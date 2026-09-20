/**
 * Serves the app's `analytics:*` and `productAnalytics:*` function refs from
 * the shared platform Supabase.
 *
 * This module only FETCHES: it applies the window, the tenant guard and the
 * branch scope, coerces PostgREST rows, and hands them to the pure compute
 * modules, which own the arithmetic. Every read is bounded (`STATS_LIMIT`) and
 * every read is tenant-scoped — see `platform-client.ts` for why RLS is not
 * enough on its own.
 */

import {
  computeBundleAnalytics,
  computeCustomerInsights,
  computeOrderHeatmap,
  computePaymentMethodAnalytics,
  computeRevenueBreakdown,
  computeSalesAnalytics,
  computeTopItems,
  computeTrends,
  computeUpsellAnalytics,
  computeUpsellTrends,
  type AnalyticsEvent,
  type AnalyticsItem,
  type AnalyticsOrder,
} from "./analytics-compute";
import {
  computeProductAnalytics,
  resolveProductPeriod,
  summarizePortfolio,
  type ProductCost,
  type ProductPeriod,
} from "./product-analytics-compute";
import { DAY_MS, localDayStartMs } from "./analytics-time";
import {
  STATS_LIMIT,
  STORE_WIDE,
  asRecord,
  boundedInt,
  requireTenant,
  scopeToBranch,
  toNumber,
  unwrap,
  type PlatformClient,
} from "./platform-client";
import type { BranchScope } from "../branch-scope";

/** Refs this module serves. */
const ANALYTICS_REFS = [
  "analytics:getUpsellAnalytics",
  "analytics:getBundleAnalytics",
  "analytics:getTopItems",
  "analytics:getTrends",
  "analytics:getRevenueBreakdown",
  "analytics:getUpsellTrends",
  "analytics:getSalesAnalytics",
  "analytics:getPaymentMethodAnalytics",
  "analytics:getOrderHeatmap",
  "analytics:getCustomerInsights",
  "productAnalytics:getAll",
  "productAnalytics:getPortfolioSummary",
] as const;

export function isPlatformAnalyticsRef(ref: string): boolean {
  return (ANALYTICS_REFS as readonly string[]).includes(ref);
}

/** The widest window a screen may ask for. Beyond it the read is a table scan. */
const MAX_DAYS_BACK = 366;
const MAX_TOP_ITEMS = 100;
const DEFAULT_TOP_ITEMS = 10;

/** Only what the analytics arithmetic reads — not the full order row. */
const ANALYTICS_ORDER_COLUMNS =
  "id, created_at, status, total, source, order_type, payment_method_name, customer_name, customer_contact, customer_data, outlet_id";

/**
 * Line items scoped through an inner join on their parent order, which also
 * carries the window and the cancellation filter so the cap applies to the
 * rows that matter rather than to the whole history.
 */
const ANALYTICS_ITEM_COLUMNS =
  "order_id, menu_item_id, menu_item_name, quantity, subtotal, is_upsell_item, orders!inner(tenant_id, created_at, status, outlet_id)";

const UPSELL_EVENT_TYPES = ["upsell_shown", "upsell_clicked", "upsell_converted"];
const BUNDLE_EVENT_TYPES = ["bundle_viewed", "bundle_added"];

// --- row shapes ------------------------------------------------------------------

interface AnalyticsOrderRow {
  id: string;
  created_at: string;
  status: string | null;
  total: unknown;
  source: string | null;
  order_type: string | null;
  payment_method_name: string | null;
  customer_name: string | null;
  customer_contact: string | null;
  customer_data: unknown;
}

interface AnalyticsItemRow {
  order_id: string;
  menu_item_id: string | null;
  menu_item_name: string | null;
  quantity: unknown;
  subtotal: unknown;
  is_upsell_item: boolean | null;
}

interface AnalyticsEventRow {
  type: string;
  created_at: string;
}

interface ProductCostRow {
  menu_item_id: string;
  cost_price: unknown;
}

function toAnalyticsOrder(row: AnalyticsOrderRow): AnalyticsOrder {
  return {
    id: row.id,
    createdAtMs: Date.parse(row.created_at),
    status: row.status ?? "pending",
    total: toNumber(row.total),
    source: row.source ?? undefined,
    orderType: row.order_type ?? undefined,
    paymentMethod: row.payment_method_name ?? undefined,
    customerName: row.customer_name ?? "",
    customerContact: row.customer_contact ?? "",
    customerData: row.customer_data,
  };
}

function toAnalyticsItem(row: AnalyticsItemRow): AnalyticsItem {
  return {
    orderId: row.order_id,
    menuItemId: row.menu_item_id,
    menuItemName: row.menu_item_name ?? "",
    quantity: toNumber(row.quantity),
    subtotal: toNumber(row.subtotal),
    isUpsellItem: row.is_upsell_item === true,
  };
}

function toAnalyticsEvent(row: AnalyticsEventRow): AnalyticsEvent {
  return { type: row.type, createdAtMs: Date.parse(row.created_at) };
}

function toProductCost(row: ProductCostRow): ProductCost {
  return { menuItemId: row.menu_item_id, costPrice: toNumber(row.cost_price) };
}

// --- windows ----------------------------------------------------------------------

interface Window {
  startMs: number;
  /** Exclusive upper bound; absent means "up to now". */
  endMs?: number;
}

/**
 * An explicit `[startMs, endMs)` from the screen, or `null` when the screen
 * sent none and the rolling `daysBack` behaviour applies.
 *
 * Refused loudly rather than coerced: `Number(undefined)` is NaN and
 * `new Date(NaN).toISOString()` throws a bare RangeError with no clue which
 * screen sent it — the same reasoning `getDashboardStatsByPeriod` already
 * applies in the orders adapter.
 */
function explicitWindow(args: Record<string, unknown>): Window | null {
  if (args.startMs === undefined && args.endMs === undefined) return null;

  const startMs = Number(args.startMs);
  const endMs = Number(args.endMs);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new Error(
      "Invalid report window — startMs and endMs must both be epoch milliseconds."
    );
  }
  if (endMs <= startMs) {
    throw new Error("Invalid report window — endMs must be after startMs.");
  }
  if (endMs - startMs > MAX_DAYS_BACK * DAY_MS) {
    throw new Error(`Report windows are limited to ${MAX_DAYS_BACK} days.`);
  }
  return { startMs, endMs };
}

/** `daysBack` as Convex reads it: a rolling window ending now. */
function rollingWindow(args: Record<string, unknown>, defaultDays: number): Window {
  const explicit = explicitWindow(args);
  if (explicit) return explicit;

  const days = boundedInt(args.daysBack, defaultDays, 1, MAX_DAYS_BACK);
  return { startMs: Date.now() - days * DAY_MS };
}

/** The window immediately before `window`, of the same length. */
function previousWindow(window: Window): Window {
  const endMs = window.endMs ?? Date.now();
  return { startMs: window.startMs - (endMs - window.startMs), endMs: window.startMs };
}

/** Inclusive N-day window ending on the current LOCAL day, as `getTrends` uses. */
function localDayWindow(args: Record<string, unknown>, defaultDays: number): Window {
  const explicit = explicitWindow(args);
  if (explicit) return explicit;

  const days = boundedInt(args.daysBack, defaultDays, 1, MAX_DAYS_BACK);
  return { startMs: localDayStartMs(Date.now()) - (days - 1) * DAY_MS };
}

/** Where the product analytics window starts for a period (0 = all history). */
function productWindow(period: ProductPeriod, nowMs: number): Window {
  if (period === "all") return { startMs: 0 };
  // The 7d trend compares against the week before, so it needs 14 days.
  const days = period === "7d" ? 14 : 30;
  return { startMs: nowMs - days * DAY_MS };
}

// --- reads --------------------------------------------------------------------------

interface ReadOptions {
  includeCancelled?: boolean;
}

async function fetchOrders(
  client: PlatformClient,
  tenantId: string,
  scope: BranchScope,
  window: Window,
  options: ReadOptions = {}
): Promise<AnalyticsOrder[]> {
  let builder = scopeToBranch(
    client.from("orders").select(ANALYTICS_ORDER_COLUMNS).eq("tenant_id", tenantId),
    scope
  ).gte("created_at", new Date(window.startMs).toISOString());

  if (window.endMs !== undefined) {
    builder = builder.lt("created_at", new Date(window.endMs).toISOString());
  }
  // Pushed to PostgREST rather than filtered after the cap: on a busy store a
  // post-filter would let cancelled rows crowd real sales out of the window.
  if (!options.includeCancelled) {
    builder = builder.neq("status", "cancelled");
  }

  const rows = await unwrap<AnalyticsOrderRow[] | null>(
    builder.order("created_at", { ascending: false }).limit(STATS_LIMIT)
  );
  return (rows ?? []).map(toAnalyticsOrder);
}

/** Line items of the non-cancelled orders in the window. */
async function fetchItems(
  client: PlatformClient,
  tenantId: string,
  scope: BranchScope,
  window: Window
): Promise<AnalyticsItem[]> {
  let builder = scopeToBranch(
    client
      .from("order_items")
      .select(ANALYTICS_ITEM_COLUMNS)
      .eq("orders.tenant_id", tenantId)
      .gte("orders.created_at", new Date(window.startMs).toISOString())
      .neq("orders.status", "cancelled"),
    scope,
    "orders.outlet_id"
  );

  // The upper bound belongs on the JOINED order, not on the item: an item has
  // no date of its own, so without this a window asking for one day would take
  // that day's first item and every item sold since.
  if (window.endMs !== undefined) {
    builder = builder.lt("orders.created_at", new Date(window.endMs).toISOString());
  }

  const rows = await unwrap<AnalyticsItemRow[] | null>(
    builder.order("orders(created_at)", { ascending: false }).limit(STATS_LIMIT)
  );
  return (rows ?? []).map(toAnalyticsItem);
}

async function fetchEvents(
  client: PlatformClient,
  tenantId: string,
  types: readonly string[],
  scope: BranchScope,
  window: Window
): Promise<AnalyticsEvent[]> {
  let builder = client.from("analytics_events")
    .select("type, created_at")
    .eq("tenant_id", tenantId);
  if (scope.kind === "branch") {
    // Checkout historically used outletId; newer event producers use outlet_id.
    // Prefer the canonical key if both exist. Quote PostgREST filter values.
    const id = JSON.stringify(scope.outletId);
    builder = builder.or(`metadata->>outlet_id.eq.${id},and(metadata->>outlet_id.is.null,metadata->>outletId.eq.${id})`);
  }
  builder = builder
    .in("type", types)
    .gte("created_at", new Date(window.startMs).toISOString());

  if (window.endMs !== undefined) {
    builder = builder.lt("created_at", new Date(window.endMs).toISOString());
  }

  const rows = await unwrap<AnalyticsEventRow[] | null>(
    builder.order("created_at", { ascending: false }).limit(STATS_LIMIT)
  );
  return (rows ?? []).map(toAnalyticsEvent);
}

async function fetchCosts(client: PlatformClient, tenantId: string): Promise<ProductCost[]> {
  const rows = await unwrap<ProductCostRow[] | null>(
    client
      .from("product_costs")
      .select("menu_item_id, cost_price")
      .eq("tenant_id", tenantId)
      .limit(STATS_LIMIT)
  );
  return (rows ?? []).map(toProductCost);
}

async function fetchProductRows(
  client: PlatformClient,
  tenantId: string,
  scope: BranchScope,
  args: Record<string, unknown>
) {
  const period = resolveProductPeriod(args.period);
  const nowMs = Date.now();
  const window = productWindow(period, nowMs);
  const [orders, items, costs] = await Promise.all([
    fetchOrders(client, tenantId, scope, window),
    fetchItems(client, tenantId, scope, window),
    fetchCosts(client, tenantId),
  ]);
  return computeProductAnalytics({ orders, items, costs, period, nowMs });
}

// --- dispatch ------------------------------------------------------------------------

/**
 * `scope` is the effective viewing branch: the account restriction narrowed
 * by the owner's selection. An aggregate cannot be narrowed after computing.
 */
export async function runPlatformAnalyticsQuery(
  client: PlatformClient,
  tenantId: string,
  ref: string,
  args: unknown,
  scope: BranchScope = STORE_WIDE
): Promise<unknown> {
  const tenant = requireTenant(tenantId);
  const params = asRecord(args);

  switch (ref) {
    case "analytics:getUpsellAnalytics":
      return computeUpsellAnalytics(
        await fetchEvents(client, tenant, UPSELL_EVENT_TYPES, scope, rollingWindow(params, 7))
      );
    case "analytics:getBundleAnalytics":
      return computeBundleAnalytics(
        await fetchEvents(client, tenant, BUNDLE_EVENT_TYPES, scope, rollingWindow(params, 7))
      );
    case "analytics:getTopItems":
      return computeTopItems(
        await fetchItems(client, tenant, scope, rollingWindow(params, 7)),
        boundedInt(params.limit, DEFAULT_TOP_ITEMS, 1, MAX_TOP_ITEMS)
      );
    case "analytics:getTrends":
      return computeTrends(await fetchOrders(client, tenant, scope, localDayWindow(params, 30)));
    case "analytics:getRevenueBreakdown":
      return computeRevenueBreakdown(await fetchOrders(client, tenant, scope, rollingWindow(params, 7)));
    case "analytics:getUpsellTrends": {
      const window = rollingWindow(params, 7);
      const [events, items] = await Promise.all([
        fetchEvents(client, tenant, UPSELL_EVENT_TYPES, scope, window),
        fetchItems(client, tenant, scope, window),
      ]);
      return computeUpsellTrends(events, items);
    }
    case "analytics:getSalesAnalytics": {
      const window = rollingWindow(params, 7);
      const [current, previous] = await Promise.all([
        fetchOrders(client, tenant, scope, window, { includeCancelled: true }),
        fetchOrders(client, tenant, scope, previousWindow(window), { includeCancelled: true }),
      ]);
      return computeSalesAnalytics(current, previous);
    }
    case "analytics:getPaymentMethodAnalytics":
      return computePaymentMethodAnalytics(
        await fetchOrders(client, tenant, scope, rollingWindow(params, 7))
      );
    case "analytics:getOrderHeatmap":
      return computeOrderHeatmap(await fetchOrders(client, tenant, scope, rollingWindow(params, 30)));
    case "analytics:getCustomerInsights":
      return computeCustomerInsights(await fetchOrders(client, tenant, scope, rollingWindow(params, 30)));
    case "productAnalytics:getAll":
      return fetchProductRows(client, tenant, scope, params);
    case "productAnalytics:getPortfolioSummary":
      return summarizePortfolio(await fetchProductRows(client, tenant, scope, params));
    default:
      throw new Error(`Query "${ref}" is not supported by the platform backend.`);
  }
}
