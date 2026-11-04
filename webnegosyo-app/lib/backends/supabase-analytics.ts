/**
 * Serves the app's `analytics:*` and `productAnalytics:*` function refs from
 * the shared platform Supabase.
 *
 * This module only FETCHES: it applies the window, the tenant guard and the
 * branch scope, coerces PostgREST rows, and hands them to the pure compute
 * modules, which own the arithmetic. Every read is bounded and every read is
 * tenant-scoped — see `platform-client.ts` for why RLS is not enough on its own.
 *
 * A screen asks many questions of ONE window (the Analytics screen sends nine),
 * so the bulk reads are shared while in flight (`shared-read.ts`): each window's
 * orders, lines, payments and events cross the network once, whichever figures
 * they feed.
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
  type AnalyticsPayment,
} from "./analytics-compute";
import {
  computeProductAnalytics,
  resolveProductPeriod,
  summarizePortfolio,
  type ProductCost,
  type ProductPeriod,
} from "./product-analytics-compute";
import { DAY_MS, localDayStartMs } from "./analytics-time";
import { cachedCutoffSchedule } from "../business-day/cached-schedule";
import type { CutoffSchedule } from "../business-day/trading-day";
import {
  STORE_WIDE,
  asRecord,
  boundedInt,
  readAllPages,
  readEveryRow,
  requireTenant,
  scopeToBranch,
  toNumber,
  withAbortSignal,
  type PlatformClient,
} from "./platform-client";
import type { BranchScope } from "../branch-scope";
import { IDENTITY_BLOB_KEYS } from "../customer-identity";
import { sharedRead } from "./shared-read";
import { parseItemSalesArgs, readItemSales } from "./supabase-item-sales";

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
  "analytics:getItemSales",
] as const;

export function isPlatformAnalyticsRef(ref: string): boolean {
  return (ANALYTICS_REFS as readonly string[]).includes(ref);
}

/** The widest window a screen may ask for. Beyond it the read is a table scan. */
const MAX_DAYS_BACK = 366;
const MAX_TOP_ITEMS = 100;
const DEFAULT_TOP_ITEMS = 10;

/**
 * Most rows one window may add up on the phone. Past it the read is refused
 * rather than summed in part; a window that big belongs to a server report.
 */
const ANALYTICS_ROW_LIMIT = 50_000;

/** Prefix of the identity keys selected out of `customer_data`. */
const BLOB_KEY_PREFIX = "cd_";

/**
 * Only what the analytics arithmetic reads — not the full order row. Of the
 * `customer_data` blob (most of a row's bytes) only the keys a guest can be
 * recognised by come down, each as its own JSON value.
 */
const ANALYTICS_ORDER_COLUMNS = [
  "id, created_at, status, total, source, order_type, payment_method_name, customer_name, customer_contact, outlet_id",
  ...IDENTITY_BLOB_KEYS.map((key) => `${BLOB_KEY_PREFIX}${key}:customer_data->${key}`),
].join(", ");

/**
 * Line items scoped through an inner join on their parent order, which also
 * carries the window and the cancellation filter so the cap applies to the
 * rows that matter rather than to the whole history. The join is EMPTY
 * (`orders!inner()`): it filters and orders, but repeats none of the order's
 * columns on every line — over half of each line's bytes before.
 */
const ANALYTICS_ITEM_COLUMNS =
  "id, order_id, menu_item_id, menu_item_name, quantity, subtotal, is_upsell_item, orders!inner()";

/**
 * Settlement rows of the window's orders, so a bill paid by several methods
 * counts under each. Joined through the parent order, which carries the window,
 * the branch and the cancellation filter, as the line-item read does.
 */
const ANALYTICS_PAYMENT_COLUMNS =
  "id, order_id, kind, amount, payment_method_name, orders!inner()";

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
  /** `cd_<key>`: one identity key of `customer_data`, or null when absent. */
  [blobKey: `cd_${string}`]: unknown;
}

interface AnalyticsItemRow {
  order_id: string;
  menu_item_id: string | null;
  menu_item_name: string | null;
  quantity: unknown;
  subtotal: unknown;
  is_upsell_item: boolean | null;
}

interface AnalyticsPaymentRow {
  order_id: string;
  kind: string | null;
  amount: unknown;
  payment_method_name: string | null;
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
    customerData: identityBlob(row),
  };
}

/** The identity keys of `customer_data` back in their blob, or null if none. */
function identityBlob(row: AnalyticsOrderRow): Record<string, unknown> | null {
  const entries = IDENTITY_BLOB_KEYS.flatMap((key) => {
    const value = row[`${BLOB_KEY_PREFIX}${key}`];
    return value === null || value === undefined ? [] : [[key, value] as const];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : null;
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

const MINUTE_MS = 60_000;

/**
 * "Now", to the minute. Queries a screen sends together resolve their rolling
 * windows a few milliseconds apart; on the same minute they name the same
 * window and share one read.
 */
function nowToTheMinute(): number {
  return Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;
}

/** `daysBack` as Convex reads it: a rolling window ending now. */
function rollingWindow(args: Record<string, unknown>, defaultDays: number): Window {
  const explicit = explicitWindow(args);
  if (explicit) return explicit;

  const days = boundedInt(args.daysBack, defaultDays, 1, MAX_DAYS_BACK);
  return { startMs: nowToTheMinute() - days * DAY_MS };
}

/** The window immediately before `window`, of the same length. */
function previousWindow(window: Window): Window {
  const endMs = window.endMs ?? nowToTheMinute();
  return { startMs: window.startMs - (endMs - window.startMs), endMs: window.startMs };
}

/**
 * Inclusive N-day window ending on the current business day, as `getTrends`
 * uses (Manila calendar days with no cutoff schedule, as before).
 */
function localDayWindow(
  args: Record<string, unknown>,
  defaultDays: number,
  schedule: CutoffSchedule
): Window {
  const explicit = explicitWindow(args);
  if (explicit) return explicit;

  const days = boundedInt(args.daysBack, defaultDays, 1, MAX_DAYS_BACK);
  return { startMs: localDayStartMs(Date.now() - (days - 1) * DAY_MS, undefined, schedule) };
}

/** Where the product analytics window starts for a period (0 = all history). */
function productWindow(period: ProductPeriod, nowMs: number): Window {
  if (period === "all") return { startMs: 0 };
  // The 7d trend compares against the week before, so it needs 14 days.
  const days = period === "7d" ? 14 : 30;
  return { startMs: nowMs - days * DAY_MS };
}

// --- reads --------------------------------------------------------------------------

/** Who is asking, and how to stop asking. */
interface ReadContext {
  /** Unsignalled: a shared read attaches its own signal, a private one the caller's. */
  client: PlatformClient;
  tenantId: string;
  scope: BranchScope;
  signal?: AbortSignal;
}

const clientIds = new WeakMap<PlatformClient, number>();
let lastClientId = 0;

/** Everything that decides a bulk read's rows, as one key. */
function readKey(ctx: ReadContext, kind: string, window: Window): string {
  if (!clientIds.has(ctx.client)) clientIds.set(ctx.client, ++lastClientId);
  const branch = ctx.scope.kind === "all" ? "all" : ctx.scope.outletId;
  const end = window.endMs ?? "now";
  return `${kind}|${clientIds.get(ctx.client)}|${ctx.tenantId}|${branch}|${window.startMs}|${end}`;
}

/** `read` once for every caller asking `kind` of the same window right now. */
function shared<T>(
  ctx: ReadContext,
  kind: string,
  window: Window,
  read: (client: PlatformClient) => Promise<T>
): Promise<T> {
  return sharedRead(readKey(ctx, kind, window), ctx.signal, (signal) =>
    read(withAbortSignal(ctx.client, signal))
  );
}

/** The caller's own client, for a read nobody else asks for. */
function ownClient(ctx: ReadContext): PlatformClient {
  return ctx.signal ? withAbortSignal(ctx.client, ctx.signal) : ctx.client;
}

function boundCreatedAt(
  builder: ReturnType<PlatformClient["from"]>,
  column: string,
  window: Window
): ReturnType<PlatformClient["from"]> {
  const bounded = builder.gte(column, new Date(window.startMs).toISOString());
  return window.endMs === undefined ? bounded : bounded.lt(column, new Date(window.endMs).toISOString());
}

interface ReadOptions {
  includeCancelled?: boolean;
}

/**
 * The window's orders. Cancelled orders come down too and are dropped here, so
 * the sales figures (which count cancellations) and every other figure share
 * one read; with `readEveryRow` refusing an over-full window, they can no
 * longer crowd real sales out of a capped one.
 */
async function fetchOrders(
  ctx: ReadContext,
  window: Window,
  options: ReadOptions = {}
): Promise<AnalyticsOrder[]> {
  const orders = await shared(ctx, "orders", window, async (client) => {
    const rows = await readEveryRow<AnalyticsOrderRow>(
      () =>
        boundCreatedAt(
          scopeToBranch(
            client.from("orders").select(ANALYTICS_ORDER_COLUMNS).eq("tenant_id", ctx.tenantId),
            ctx.scope
          ),
          "created_at",
          window
        )
          // Oldest first, `id` breaking ties — see `readEveryRow`.
          .order("created_at", { ascending: true })
          .order("id", { ascending: true }),
      { maxRows: ANALYTICS_ROW_LIMIT }
    );
    return rows.map(toAnalyticsOrder);
  });
  return options.includeCancelled ? orders : orders.filter((order) => order.status !== "cancelled");
}

/** Line items of the non-cancelled orders in the window. */
function fetchItems(ctx: ReadContext, window: Window): Promise<AnalyticsItem[]> {
  return shared(ctx, "items", window, async (client) => {
    const rows = await readEveryRow<AnalyticsItemRow>(
      () =>
        // The bounds belong on the JOINED order: an item has no date of its own,
        // so without the upper one a window asking for one day would take that
        // day's first item and every item sold since.
        boundCreatedAt(
          scopeToBranch(
            client
              .from("order_items")
              .select(ANALYTICS_ITEM_COLUMNS)
              .eq("orders.tenant_id", ctx.tenantId)
              .neq("orders.status", "cancelled"),
            ctx.scope,
            "orders.outlet_id"
          ),
          "orders.created_at",
          window
        )
          .order("orders(created_at)", { ascending: true })
          .order("id", { ascending: true }),
      { maxRows: ANALYTICS_ROW_LIMIT }
    );
    return rows.map(toAnalyticsItem);
  });
}

/** Settlement rows of the window's non-cancelled orders, by order. */
function fetchPayments(ctx: ReadContext, window: Window): Promise<Map<string, AnalyticsPayment[]>> {
  return shared(ctx, "payments", window, async (client) => {
    const rows = await readEveryRow<AnalyticsPaymentRow>(
      () => {
        const builder = scopeToBranch(
          client
            .from("order_payments")
            .select(ANALYTICS_PAYMENT_COLUMNS)
            .eq("tenant_id", ctx.tenantId)
            .eq("orders.tenant_id", ctx.tenantId)
            // A payment never predates its order, so this bound is safe and lets
            // the read use the ledger's (tenant_id, created_at) index.
            .gte("created_at", new Date(window.startMs).toISOString())
            .neq("orders.status", "cancelled"),
          ctx.scope,
          "orders.outlet_id"
        );
        return boundCreatedAt(builder, "orders.created_at", window)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true });
      },
      { maxRows: ANALYTICS_ROW_LIMIT }
    );

    const byOrder = new Map<string, AnalyticsPayment[]>();
    for (const row of rows) {
      const payment: AnalyticsPayment = {
        kind: row.kind ?? "charge",
        amount: toNumber(row.amount),
        method: row.payment_method_name ?? undefined,
      };
      byOrder.set(row.order_id, [...(byOrder.get(row.order_id) ?? []), payment]);
    }
    return byOrder;
  });
}

/**
 * The window's orders, each with its settlement ledger. Only the payment-method
 * figures need the ledger, so only they pay for the second read.
 */
async function fetchOrdersWithPayments(ctx: ReadContext, window: Window): Promise<AnalyticsOrder[]> {
  const [orders, byOrder] = await Promise.all([fetchOrders(ctx, window), fetchPayments(ctx, window)]);
  return orders.map((order) => {
    const payments = byOrder.get(order.id);
    return payments ? { ...order, payments } : order;
  });
}

function fetchEvents(
  ctx: ReadContext,
  types: readonly string[],
  window: Window
): Promise<AnalyticsEvent[]> {
  return shared(ctx, `events:${types.join(",")}`, window, async (client) => {
    const rows = await readEveryRow<AnalyticsEventRow>(
      () => {
        let builder = client.from("analytics_events")
          .select("id, type, created_at")
          .eq("tenant_id", ctx.tenantId);
        if (ctx.scope.kind === "branch") {
          // Checkout historically used outletId; newer event producers use outlet_id.
          // Prefer the canonical key if both exist. Quote PostgREST filter values.
          const id = JSON.stringify(ctx.scope.outletId);
          builder = builder.or(`metadata->>outlet_id.eq.${id},and(metadata->>outlet_id.is.null,metadata->>outletId.eq.${id})`);
        }
        return boundCreatedAt(builder.in("type", types), "created_at", window)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true });
      },
      { maxRows: ANALYTICS_ROW_LIMIT }
    );
    return rows.map(toAnalyticsEvent);
  });
}

async function fetchCosts(ctx: ReadContext): Promise<ProductCost[]> {
  const client = ownClient(ctx);
  const rows = await readAllPages<ProductCostRow>(() =>
    client
      .from("product_costs")
      .select("menu_item_id, cost_price")
      .eq("tenant_id", ctx.tenantId)
      .order("menu_item_id", { ascending: true })
  );
  return rows.map(toProductCost);
}

async function fetchProductRows(ctx: ReadContext, args: Record<string, unknown>) {
  const period = resolveProductPeriod(args.period);
  const nowMs = Date.now();
  const window = productWindow(period, nowToTheMinute());
  const [orders, items, costs] = await Promise.all([
    fetchOrders(ctx, window),
    fetchItems(ctx, window),
    fetchCosts(ctx),
  ]);
  return computeProductAnalytics({ orders, items, costs, period, nowMs });
}

// --- dispatch ------------------------------------------------------------------------

/**
 * `scope` is the effective viewing branch: the account restriction narrowed
 * by the owner's selection. An aggregate cannot be narrowed after computing.
 *
 * `client` must NOT carry the caller's signal: a read shared with other
 * queries attaches its own, so one query giving up never cancels another's
 * answer. `signal` is the caller's.
 */
export async function runPlatformAnalyticsQuery(
  client: PlatformClient,
  tenantId: string,
  ref: string,
  args: unknown,
  scope: BranchScope = STORE_WIDE,
  signal?: AbortSignal
): Promise<unknown> {
  const ctx: ReadContext = { client, tenantId: requireTenant(tenantId), scope, signal };
  const params = asRecord(args);

  switch (ref) {
    case "analytics:getUpsellAnalytics":
      return computeUpsellAnalytics(await fetchEvents(ctx, UPSELL_EVENT_TYPES, rollingWindow(params, 7)));
    case "analytics:getBundleAnalytics":
      return computeBundleAnalytics(await fetchEvents(ctx, BUNDLE_EVENT_TYPES, rollingWindow(params, 7)));
    case "analytics:getTopItems":
      return computeTopItems(
        await fetchItems(ctx, rollingWindow(params, 7)),
        boundedInt(params.limit, DEFAULT_TOP_ITEMS, 1, MAX_TOP_ITEMS)
      );
    case "analytics:getTrends":
    {
      const schedule = cachedCutoffSchedule(ctx.tenantId);
      return computeTrends(await fetchOrders(ctx, localDayWindow(params, 30, schedule)), schedule);
    }
    case "analytics:getRevenueBreakdown":
      return computeRevenueBreakdown(await fetchOrdersWithPayments(ctx, rollingWindow(params, 7)));
    case "analytics:getUpsellTrends": {
      const window = rollingWindow(params, 7);
      const [events, items] = await Promise.all([
        fetchEvents(ctx, UPSELL_EVENT_TYPES, window),
        fetchItems(ctx, window),
      ]);
      return computeUpsellTrends(events, items);
    }
    case "analytics:getSalesAnalytics": {
      const window = rollingWindow(params, 7);
      const [current, previous] = await Promise.all([
        fetchOrders(ctx, window, { includeCancelled: true }),
        fetchOrders(ctx, previousWindow(window), { includeCancelled: true }),
      ]);
      return computeSalesAnalytics(current, previous);
    }
    case "analytics:getPaymentMethodAnalytics":
      return computePaymentMethodAnalytics(await fetchOrdersWithPayments(ctx, rollingWindow(params, 7)));
    case "analytics:getOrderHeatmap":
      return computeOrderHeatmap(await fetchOrders(ctx, rollingWindow(params, 30)));
    case "analytics:getCustomerInsights":
      return computeCustomerInsights(await fetchOrders(ctx, rollingWindow(params, 30)));
    case "analytics:getItemSales":
      return readItemSales(ownClient(ctx), ctx.tenantId, scope, parseItemSalesArgs(params));
    case "productAnalytics:getAll":
      return fetchProductRows(ctx, params);
    case "productAnalytics:getPortfolioSummary":
      return summarizePortfolio(await fetchProductRows(ctx, params));
    default:
      throw new Error(`Query "${ref}" is not supported by the platform backend.`);
  }
}
