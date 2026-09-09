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

/** The order-level filters that do not depend on the window: status and channel. */
function matchesOrderFilters(order: DailyOrderInput, options: ProductAnalyticsOptions): boolean {
  if (order.status === EXCLUDED_STATUS) return false;
  if (options.sources && options.sources.length > 0) {
    if (!order.source || !options.sources.includes(order.source)) return false;
  }
  return true;
}

/** Inclusive lower bound, exclusive upper bound; an absent bound is open. */
function isInWindow(atMs: number, startMs: number | undefined, endMs: number | undefined): boolean {
  if (startMs !== undefined && atMs < startMs) return false;
  if (endMs !== undefined && atMs >= endMs) return false;
  return true;
}

function matchesOrder(order: DailyOrderInput, options: ProductAnalyticsOptions): boolean {
  return (
    matchesOrderFilters(order, options) &&
    isInWindow(order.createdAtMs, options.startMs, options.endMs)
  );
}

/**
 * The per-item filter inputs, resolved once before the loop.
 *
 * `trim()` and `toLowerCase()` on the search term allocate two strings every
 * time they run. Inside the item loop that is once per line item, twice per
 * recompute (current window plus comparison window), on every keystroke — work
 * that scales with sales history to answer a question that cannot change
 * between two items. Resolving it here makes it constant.
 */
interface ProductMatcher {
  search: string | undefined;
  categoryId: string | undefined;
  categoryByItemId: Record<string, string> | undefined;
}

function resolveMatcher(options: ProductAnalyticsOptions): ProductMatcher {
  const search = options.search?.trim().toLowerCase();
  return {
    search: search ? search : undefined,
    categoryId: options.categoryId,
    categoryByItemId: options.categoryByItemId,
  };
}

function matchesProduct(item: DailyOrderItemInput, matcher: ProductMatcher): boolean {
  if (matcher.search && !item.menuItemName.toLowerCase().includes(matcher.search)) {
    return false;
  }
  if (matcher.categoryId) {
    const category = matcher.categoryByItemId?.[item.menuItemId];
    if (category !== matcher.categoryId) return false;
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

/** Everything one window collects while the items are walked. */
interface WindowAccumulators {
  byDay: Map<string, Map<string, ProductAccumulator>>;
  totals: Map<string, ProductAccumulator>;
  orderIdsByDay: Map<string, Set<string>>;
}

function emptyWindow(): WindowAccumulators {
  return { byDay: new Map(), totals: new Map(), orderIdsByDay: new Map() };
}

function accumulateInWindow(
  window: WindowAccumulators,
  item: DailyOrderItemInput,
  date: string
): void {
  const dayBucket = window.byDay.get(date) ?? new Map<string, ProductAccumulator>();
  accumulate(dayBucket, item, item.orderId);
  window.byDay.set(date, dayBucket);

  accumulate(window.totals, item, item.orderId);

  const dayOrders = window.orderIdsByDay.get(date) ?? new Set<string>();
  dayOrders.add(item.orderId);
  window.orderIdsByDay.set(date, dayOrders);
}

function finalizeWindow(
  window: WindowAccumulators,
  metric: ProductMetric,
  topN: number | undefined
): ProductAnalyticsResult {
  const days: ProductDayGroup[] = [...window.byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, bucket]) => {
      const ranked = toTotals(bucket).sort((a, b) => compareByMetric(a, b, metric));
      const rows = topN === undefined ? ranked : ranked.slice(0, topN);
      return {
        date,
        rows,
        totalUnits: ranked.reduce((sum, row) => sum + row.units, 0),
        totalSales: ranked.reduce((sum, row) => sum + row.sales, 0),
        totalOrders: window.orderIdsByDay.get(date)?.size ?? 0,
        truncatedCount: ranked.length - rows.length,
      };
    });

  const totals = toTotals(window.totals).sort((a, b) => compareByMetric(a, b, metric));

  return { days, totals };
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

  const window = emptyWindow();
  const matcher = resolveMatcher(options);

  for (const item of items) {
    const date = dateByOrderId.get(item.orderId);
    if (date === undefined) continue;
    if (!matchesProduct(item, matcher)) continue;
    accumulateInWindow(window, item, date);
  }

  return finalizeWindow(window, options.metric, options.topN);
}

export interface ProductAnalyticsComparison {
  /** The window asked for, capped by `topN` like `buildProductAnalytics`. */
  current: ProductAnalyticsResult;
  /**
   * The equal-length window before it, never capped: only its totals feed the
   * deltas, and a capped baseline would read a product hidden by `topN` as
   * "new". Empty when the current window is unbounded.
   */
  previous: ProductAnalyticsResult;
}

export interface TimeWindow {
  startMs: number;
  endMs: number;
}

/** The previous equal-length window, or null when the current one is unbounded. */
function defaultComparisonWindow(options: ProductAnalyticsOptions): TimeWindow | null {
  if (options.startMs === undefined || options.endMs === undefined) return null;
  return previousWindow(options.startMs, options.endMs);
}

/** Which of the two windows an order falls in, with its local day. */
interface OrderPlacement {
  window: "current" | "previous";
  date: string;
}

/**
 * The current window and the one before it from ONE walk over the items.
 *
 * The screen compares every window against its predecessor, and a store's
 * line items are the largest thing it holds; walking them twice per keystroke
 * is what made the search box stutter. Each order is placed once, each item is
 * routed once, and the answer is exactly what two separate builds would give.
 */
export function buildProductAnalyticsComparison(
  orders: readonly DailyOrderInput[],
  items: readonly DailyOrderItemInput[],
  options: ProductAnalyticsOptions,
  /** Defaults to the equal-length window before the current one. */
  comparisonWindow?: TimeWindow
): ProductAnalyticsComparison {
  const before = comparisonWindow ?? defaultComparisonWindow(options);
  if (before === null) {
    return {
      current: buildProductAnalytics(orders, items, options),
      previous: { days: [], totals: [] },
    };
  }

  const { startMs, endMs } = options;
  const offsetMs = options.offsetMs ?? DEFAULT_TZ_OFFSET_MS;

  const placementByOrderId = new Map<string, OrderPlacement>();
  for (const order of orders) {
    if (!matchesOrderFilters(order, options)) continue;
    const window = isInWindow(order.createdAtMs, startMs, endMs)
      ? "current"
      : isInWindow(order.createdAtMs, before.startMs, before.endMs)
        ? "previous"
        : null;
    if (window === null) continue;
    placementByOrderId.set(order.id, {
      window,
      date: productDateKey(order.createdAtMs, offsetMs),
    });
  }

  const windows = { current: emptyWindow(), previous: emptyWindow() };
  const matcher = resolveMatcher(options);

  for (const item of items) {
    const placement = placementByOrderId.get(item.orderId);
    if (placement === undefined) continue;
    if (!matchesProduct(item, matcher)) continue;
    accumulateInWindow(windows[placement.window], item, placement.date);
  }

  return {
    current: finalizeWindow(windows.current, options.metric, options.topN),
    previous: finalizeWindow(windows.previous, options.metric, undefined),
  };
}

/** The equal-length window immediately preceding [startMs, endMs). */
export function previousWindow(startMs: number, endMs: number): TimeWindow {
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
