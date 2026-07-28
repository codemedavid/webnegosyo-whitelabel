// Per-day, per-product sales analytics for the merchant Products screen.
//
// The pre-aggregated `productAnalytics` table only carries whole-period totals
// (7d / 30d / all), so it cannot answer "what did this product do on Tuesday?".
// These helpers derive the daily grain from raw orders + order items, which the
// app can already read on both backends (Convex and platform Supabase).
//
// Pure functions only — no data fetching — so the filter/ranking maths stays
// unit-testable and the screen stays presentational.

/** Default UTC offset: Philippines (Asia/Manila) is a fixed UTC+8, no DST. */
export const DEFAULT_TZ_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Orders in this status never count toward units or sales. */
const EXCLUDED_STATUS = "cancelled";

export type ProductMetric = "units" | "sales" | "orders";

export interface DailyOrderInput {
  id: string;
  createdAtMs: number;
  status: string;
  source?: string;
}

export interface DailyOrderItemInput {
  orderId: string;
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  subtotal: number;
}

export interface ProductTotals {
  menuItemId: string;
  menuItemName: string;
  units: number;
  /** Distinct orders containing this product — not line-item count. */
  orders: number;
  sales: number;
}

export interface ProductDayGroup {
  date: string;
  /** Ranked by the selected metric and capped by `topN`. */
  rows: ProductTotals[];
  /** The day's real totals across every matching product, before `topN`. */
  totalUnits: number;
  totalSales: number;
  totalOrders: number;
  /** How many products `topN` hid from `rows`. */
  truncatedCount: number;
}

export interface ProductAnalyticsOptions {
  metric: ProductMetric;
  /** Inclusive lower bound on order time. */
  startMs?: number;
  /** Exclusive upper bound on order time. */
  endMs?: number;
  /** Case-insensitive substring match on the product name. */
  search?: string;
  categoryId?: string;
  categoryByItemId?: Record<string, string>;
  /** Order channels to include; empty or omitted means all channels. */
  sources?: readonly string[];
  /** Max products shown per day; omitted means no cap. */
  topN?: number;
  offsetMs?: number;
}

export interface ProductAnalyticsResult {
  /** Newest local day first. */
  days: ProductDayGroup[];
  /** Window-wide totals per product, ranked by the metric, never capped. */
  totals: ProductTotals[];
}

export interface ProductDelta extends ProductTotals {
  previousUnits: number;
  previousSales: number;
  /** Undefined when there is no previous baseline to divide by. */
  unitsChangePercent: number | undefined;
  salesChangePercent: number | undefined;
  /** True when the product sold now but had no sales in the previous window. */
  isNew: boolean;
}

/** Local-day date key "YYYY-MM-DD" for an epoch-ms instant. */
export function productDateKey(
  atMs: number,
  offsetMs: number = DEFAULT_TZ_OFFSET_MS
): string {
  return new Date(atMs + offsetMs).toISOString().split("T")[0];
}

/** Coerce a possibly-dirty numeric field to a finite number. */
function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/** Round to one decimal place. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function matchesOrder(
  order: DailyOrderInput,
  options: ProductAnalyticsOptions
): boolean {
  if (order.status === EXCLUDED_STATUS) return false;
  if (options.startMs !== undefined && order.createdAtMs < options.startMs) return false;
  if (options.endMs !== undefined && order.createdAtMs >= options.endMs) return false;
  if (options.sources && options.sources.length > 0) {
    if (!order.source || !options.sources.includes(order.source)) return false;
  }
  return true;
}

function matchesProduct(
  item: DailyOrderItemInput,
  options: ProductAnalyticsOptions
): boolean {
  const search = options.search?.trim().toLowerCase();
  if (search && !item.menuItemName.toLowerCase().includes(search)) return false;
  if (options.categoryId) {
    const category = options.categoryByItemId?.[item.menuItemId];
    if (category !== options.categoryId) return false;
  }
  return true;
}

/** Ranking comparator — metric desc, then sales desc, then name for stability. */
function compareByMetric(
  a: ProductTotals,
  b: ProductTotals,
  metric: ProductMetric
): number {
  const byMetric = b[metric] - a[metric];
  if (byMetric !== 0) return byMetric;
  const bySales = b.sales - a.sales;
  if (bySales !== 0) return bySales;
  return a.menuItemName.localeCompare(b.menuItemName);
}

/**
 * Accumulator keyed by product, tracking which orders it appeared in so the
 * order count stays distinct when a product is on two lines of one order.
 */
interface ProductAccumulator extends ProductTotals {
  orderIds: Set<string>;
}

function emptyAccumulator(item: DailyOrderItemInput): ProductAccumulator {
  return {
    menuItemId: item.menuItemId,
    menuItemName: item.menuItemName,
    units: 0,
    orders: 0,
    sales: 0,
    orderIds: new Set<string>(),
  };
}

function accumulate(
  bucket: Map<string, ProductAccumulator>,
  item: DailyOrderItemInput,
  orderId: string
): void {
  const existing = bucket.get(item.menuItemId) ?? emptyAccumulator(item);
  existing.units += finite(item.quantity);
  existing.sales += finite(item.subtotal);
  existing.orderIds.add(orderId);
  bucket.set(item.menuItemId, existing);
}

function toTotals(bucket: Map<string, ProductAccumulator>): ProductTotals[] {
  return [...bucket.values()].map(({ orderIds, ...rest }) => ({
    ...rest,
    orders: orderIds.size,
  }));
}

/**
 * Build the daily breakdown and the window-wide totals in one pass over the
 * items, applying every order-level and product-level filter.
 */
export function buildProductAnalytics(
  orders: readonly DailyOrderInput[],
  items: readonly DailyOrderItemInput[],
  options: ProductAnalyticsOptions
): ProductAnalyticsResult {
  const offsetMs = options.offsetMs ?? DEFAULT_TZ_OFFSET_MS;

  // Only orders that survive the filters contribute; the map doubles as the
  // membership test that drops items whose parent order is absent or excluded.
  const dateByOrderId = new Map<string, string>();
  for (const order of orders) {
    if (!matchesOrder(order, options)) continue;
    dateByOrderId.set(order.id, productDateKey(order.createdAtMs, offsetMs));
  }

  const byDay = new Map<string, Map<string, ProductAccumulator>>();
  const windowTotals = new Map<string, ProductAccumulator>();
  const orderIdsByDay = new Map<string, Set<string>>();

  for (const item of items) {
    const date = dateByOrderId.get(item.orderId);
    if (date === undefined) continue;
    if (!matchesProduct(item, options)) continue;

    const dayBucket = byDay.get(date) ?? new Map<string, ProductAccumulator>();
    accumulate(dayBucket, item, item.orderId);
    byDay.set(date, dayBucket);

    accumulate(windowTotals, item, item.orderId);

    const dayOrders = orderIdsByDay.get(date) ?? new Set<string>();
    dayOrders.add(item.orderId);
    orderIdsByDay.set(date, dayOrders);
  }

  const days: ProductDayGroup[] = [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, bucket]) => {
      const ranked = toTotals(bucket).sort((a, b) =>
        compareByMetric(a, b, options.metric)
      );
      const rows = options.topN === undefined ? ranked : ranked.slice(0, options.topN);
      return {
        date,
        rows,
        totalUnits: ranked.reduce((sum, row) => sum + row.units, 0),
        totalSales: ranked.reduce((sum, row) => sum + row.sales, 0),
        totalOrders: orderIdsByDay.get(date)?.size ?? 0,
        truncatedCount: ranked.length - rows.length,
      };
    });

  const totals = toTotals(windowTotals).sort((a, b) =>
    compareByMetric(a, b, options.metric)
  );

  return { days, totals };
}

/** The equal-length window immediately preceding [startMs, endMs). */
export function previousWindow(
  startMs: number,
  endMs: number
): { startMs: number; endMs: number } {
  const length = endMs - startMs;
  return { startMs: startMs - length, endMs: startMs };
}

/** Percentage change, or undefined when there is no baseline to divide by. */
function changePercent(current: number, previous: number): number | undefined {
  if (previous <= 0) return undefined;
  return round1(((current - previous) / previous) * 100);
}

/**
 * Join current-window totals against the previous window.
 *
 * Current-window ranking is preserved; products that sold previously but not
 * now are appended at the end as a full (-100%) decline rather than dropped,
 * because a product that stopped selling is exactly what a merchant needs to see.
 */
export function computeProductDeltas(
  current: readonly ProductTotals[],
  previous: readonly ProductTotals[]
): ProductDelta[] {
  const previousById = new Map(previous.map((row) => [row.menuItemId, row]));

  const deltas: ProductDelta[] = current.map((row) => {
    const before = previousById.get(row.menuItemId);
    const previousUnits = before?.units ?? 0;
    const previousSales = before?.sales ?? 0;
    return {
      ...row,
      previousUnits,
      previousSales,
      unitsChangePercent: changePercent(row.units, previousUnits),
      salesChangePercent: changePercent(row.sales, previousSales),
      isNew: previousSales <= 0 && previousUnits <= 0,
    };
  });

  const currentIds = new Set(current.map((row) => row.menuItemId));
  const dropped: ProductDelta[] = previous
    .filter((row) => !currentIds.has(row.menuItemId))
    .map((row) => ({
      menuItemId: row.menuItemId,
      menuItemName: row.menuItemName,
      units: 0,
      orders: 0,
      sales: 0,
      previousUnits: row.units,
      previousSales: row.sales,
      unitsChangePercent: changePercent(0, row.units),
      salesChangePercent: changePercent(0, row.sales),
      isNew: false,
    }));

  return [...deltas, ...dropped];
}
