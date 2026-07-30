/**
 * The five numbers a multi-branch owner needs, per branch.
 *
 * The screen this feeds shows five KPIs and one verdict — not twenty tiles — so
 * the choice of five is the design. Each earns its place by pointing at a
 * different lever:
 *
 * | KPI | Lever it exposes |
 * |---|---|
 * | Revenue (+ trend vs the previous window) | the outcome; direction matters more than the level |
 * | Average order value | how much each ticket is worth — upsells, bundles, pricing |
 * | Repeat-guest rate | whether the experience brings people back |
 * | Revenue per trading hour | throughput, and the normaliser that makes a small branch comparable to a big one |
 * | Cancellation leak | money already earned and then thrown away |
 *
 * Two things deliberately absent, because the data to compute them honestly does
 * not exist in this platform: **prime cost** (no labour hours, no recipe-level
 * food cost) and **CAC / LTGP:CAC** (no ad spend). Showing a guess for either
 * would be worse than showing nothing — an owner would make hiring and
 * marketing decisions on it.
 *
 * Everything here is pure: no React, no Convex, no queries, no throwing. Orders
 * arrive untyped from three backends (Convex, platform Supabase, tenant-owned
 * Supabase), so every read is defensive and one malformed row degrades to zero
 * rather than turning a branch's whole column into NaN.
 *
 * Cancelled orders are excluded from revenue, count and average — matching
 * `branch-analytics.ts`, `branch-dashboard.ts` and the Convex stats handler — so
 * these figures describe the same set of orders as every other screen. They are
 * what the cancellation leak is measured from.
 */

import { getOrderOutletId, type ScopedOrderLike } from "./branch-scope";
import { getOrderOutletLabel } from "./branch-analytics";
import { resolveOrderIdentityKey, type IdentifiableOrderLike } from "./customer-identity";

/** Label for takings no branch owns. Matches `branch-analytics.ts`. */
export const UNASSIGNED_OUTLET_LABEL = "Unassigned";

const CANCELLED_STATUS = "cancelled";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const HOURS_IN_DAY = 24;

/**
 * Philippine Standard Time, as a fixed offset.
 *
 * Days and hours are bucketed in Manila time, not the device's and not UTC. A
 * dinner-service order at 23:30 Manila is already tomorrow in UTC, so bucketing
 * by UTC would move a restaurant's busiest hour onto the next day and make the
 * evening peak vanish from the hour chart. PH observes no DST, so a fixed offset
 * is exact rather than an approximation.
 */
const MANILA_OFFSET_MS = 8 * HOUR_MS;

/** An order as any of the three backends hands it over. */
export interface KpiOrderLike extends ScopedOrderLike, IdentifiableOrderLike {
  /** Epoch milliseconds. The Supabase adapter maps `created_at` into this. */
  _creationTime?: number;
  total?: number | null;
  status?: string | null;
}

/** A branch as the store lists it. */
export interface KpiOutlet {
  id: string;
  name: string;
}

/** The window the period selector is showing. Both ends inclusive. */
export interface KpiPeriod {
  startMs: number;
  endMs: number;
  /** Calendar days the window covers — the length of the daily series. */
  days: number;
}

/** One branch's row on the redesigned screen. */
export interface BranchKpis {
  /** Null for the Unassigned bucket. */
  outletId: string | null;
  outletName: string;
  revenue: number;
  orderCount: number;
  averageOrderValue: number;
  /** Fraction of store revenue, 0–1. */
  revenueShare: number;
  /** Fraction of *identified* orders placed by a guest who ordered earlier. */
  repeatRate: number;
  /** Fraction of orders that could be attributed to a person at all. */
  identifiedShare: number;
  /** Distinct clock hours in which the branch completed at least one order. */
  tradingHours: number;
  revenuePerTradingHour: number;
  cancelledCount: number;
  lostRevenue: number;
  /** Cancelled ÷ all orders placed, 0–1. */
  cancellationRate: number;
  /** One point per period day, chronological, zero-filled. */
  dailyRevenue: number[];
  /** Revenue in the equal-length window immediately before the period. */
  previousRevenue: number;
  /** Change vs that window as a fraction; null when there is no baseline. */
  revenueDelta: number | null;
}

/** The store's own headline, added up from its branches. */
export interface StoreKpiTotals {
  revenue: number;
  orderCount: number;
  averageOrderValue: number;
  dailyRevenue: number[];
  previousRevenue: number;
  revenueDelta: number | null;
}

function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return numerator / denominator;
}

/**
 * Change as a fraction, or null when there is nothing to compare against.
 *
 * Null rather than zero or Infinity: a branch's first week is not "flat", and
 * "+∞%" is not a figure to put in front of an owner.
 */
function delta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return (current - previous) / previous;
}

/** A numeric total, treating anything else a backend sent as zero. */
function readTotal(order: KpiOrderLike): number {
  const total = order.total;
  return typeof total === "number" && Number.isFinite(total) ? total : 0;
}

/** The timestamp, or null when the row carries nothing usable. */
function readTimestamp(order: KpiOrderLike): number | null {
  const at = order._creationTime;
  return typeof at === "number" && Number.isFinite(at) ? at : null;
}

function isCancelled(order: KpiOrderLike): boolean {
  return order.status === CANCELLED_STATUS;
}

/** Whole days since the Manila epoch — the day-bucket key. */
function manilaDayIndex(timestampMs: number): number {
  return Math.floor((timestampMs + MANILA_OFFSET_MS) / DAY_MS);
}

/** Hour of the Manila day, 0–23. */
function manilaHourOfDay(timestampMs: number): number {
  return Math.floor((timestampMs + MANILA_OFFSET_MS) / HOUR_MS) % HOURS_IN_DAY;
}

/** Whole hours since the Manila epoch — the trading-hour key. */
function manilaHourIndex(timestampMs: number): number {
  return Math.floor((timestampMs + MANILA_OFFSET_MS) / HOUR_MS);
}

function isWithin(period: KpiPeriod, at: number): boolean {
  return at >= period.startMs && at <= period.endMs;
}

/** The equal-length window ending the instant the period begins. */
function previousWindow(period: KpiPeriod): { startMs: number; endMs: number } {
  const length = period.endMs - period.startMs + 1;
  return { startMs: period.startMs - length, endMs: period.startMs - 1 };
}

/** Everything accumulated for one branch before it becomes a row. */
interface Bucket {
  outletName: string;
  revenue: number;
  orderCount: number;
  cancelledCount: number;
  lostRevenue: number;
  dailyRevenue: number[];
  previousRevenue: number;
  tradingHourKeys: Set<number>;
  /** Identity key → epoch ms of that guest's first completed order here. */
  firstVisitAt: Map<string, number>;
  identifiedOrders: number;
  repeatOrders: number;
}

function emptyBucket(outletName: string, days: number): Bucket {
  return {
    outletName,
    revenue: 0,
    orderCount: 0,
    cancelledCount: 0,
    lostRevenue: 0,
    dailyRevenue: new Array<number>(Math.max(0, days)).fill(0),
    previousRevenue: 0,
    tradingHourKeys: new Set<number>(),
    firstVisitAt: new Map<string, number>(),
    identifiedOrders: 0,
    repeatOrders: 0,
  };
}

/**
 * The branch a row belongs to, and the name to show if the branch list does not
 * know it — a snapshot taken at order time, so renaming a branch never rewrites
 * the tickets it already took.
 */
function bucketKeyAndName(order: KpiOrderLike): { outletId: string | null; outletName: string } {
  const outletId = getOrderOutletId(order);
  if (outletId === null) return { outletId: null, outletName: UNASSIGNED_OUTLET_LABEL };
  return { outletId, outletName: getOrderOutletLabel(order) ?? outletId };
}

/**
 * Every branch's KPIs for the period, ranked by revenue per trading hour.
 *
 * The ranking is the opinionated part. Sorting by raw revenue always crowns the
 * branch in the busiest location, which tells an owner nothing they did not
 * already know; per-trading-hour surfaces the branch that is actually running
 * well for its size — the one worth copying — and the one quietly
 * underperforming its footprint.
 *
 * Membership comes from the branch list, not from the orders: a branch that has
 * never taken an order is the branch most likely to need attention, and it would
 * be invisible if the orders decided who appears. Unattributed takings survive
 * as a trailing Unassigned row so the branch figures still add up to the store's.
 */
export function buildBranchKpis(
  orders: readonly KpiOrderLike[] | undefined,
  outlets: readonly KpiOutlet[],
  period: KpiPeriod,
): BranchKpis[] {
  const buckets = new Map<string | null, Bucket>();
  for (const outlet of outlets) {
    buckets.set(outlet.id, emptyBucket(outlet.name, period.days));
  }

  const firstDayIndex = manilaDayIndex(period.startMs);
  const previous = previousWindow(period);

  // Chronological, so "did this guest order here before?" can be answered in a
  // single pass — the first order seen for an identity is by definition their
  // first visit.
  const dated = (orders ?? [])
    .map((order) => ({ order, at: readTimestamp(order) }))
    .filter((entry): entry is { order: KpiOrderLike; at: number } => entry.at !== null)
    .sort((a, b) => a.at - b.at);

  for (const { order, at } of dated) {
    const inPeriod = isWithin(period, at);
    const inPrevious = at >= previous.startMs && at <= previous.endMs;
    if (!inPeriod && !inPrevious) continue;

    const { outletId, outletName } = bucketKeyAndName(order);

    let bucket = buckets.get(outletId);
    if (!bucket) {
      // A branch the list does not have — deleted, or the Unassigned bucket.
      bucket = emptyBucket(outletName, period.days);
      buckets.set(outletId, bucket);
    }

    const total = readTotal(order);

    if (inPrevious) {
      if (!isCancelled(order)) bucket.previousRevenue += total;
      continue;
    }

    if (isCancelled(order)) {
      bucket.cancelledCount += 1;
      bucket.lostRevenue += total;
      continue;
    }

    bucket.revenue += total;
    bucket.orderCount += 1;
    bucket.tradingHourKeys.add(manilaHourIndex(at));

    const dayOffset = manilaDayIndex(at) - firstDayIndex;
    if (dayOffset >= 0 && dayOffset < bucket.dailyRevenue.length) {
      bucket.dailyRevenue[dayOffset] += total;
    }

    // A cancelled order is not a visit, so identity is only read here.
    const identityKey = resolveOrderIdentityKey(order);
    if (identityKey !== null) {
      bucket.identifiedOrders += 1;
      const firstVisit = bucket.firstVisitAt.get(identityKey);
      if (firstVisit === undefined) {
        bucket.firstVisitAt.set(identityKey, at);
      } else {
        bucket.repeatOrders += 1;
      }
    }
  }

  const storeRevenue = Array.from(buckets.values()).reduce((sum, b) => sum + b.revenue, 0);

  const rows = Array.from(buckets, ([outletId, bucket]) => {
    const placedOrders = bucket.orderCount + bucket.cancelledCount;
    return {
      outletId,
      outletName: bucket.outletName,
      revenue: bucket.revenue,
      orderCount: bucket.orderCount,
      averageOrderValue: safeDivide(bucket.revenue, bucket.orderCount),
      revenueShare: safeDivide(bucket.revenue, storeRevenue),
      repeatRate: safeDivide(bucket.repeatOrders, bucket.identifiedOrders),
      identifiedShare: safeDivide(bucket.identifiedOrders, bucket.orderCount),
      tradingHours: bucket.tradingHourKeys.size,
      revenuePerTradingHour: safeDivide(bucket.revenue, bucket.tradingHourKeys.size),
      cancelledCount: bucket.cancelledCount,
      lostRevenue: bucket.lostRevenue,
      cancellationRate: safeDivide(bucket.cancelledCount, placedOrders),
      dailyRevenue: bucket.dailyRevenue,
      previousRevenue: bucket.previousRevenue,
      revenueDelta: delta(bucket.revenue, bucket.previousRevenue),
    };
  });

  // Unassigned is pinned last however much it holds: it is a data-quality
  // bucket, not a branch competing in the ranking.
  return rows.sort((a, b) => {
    if (a.outletId === null) return 1;
    if (b.outletId === null) return -1;
    return b.revenuePerTradingHour - a.revenuePerTradingHour;
  });
}

/**
 * The store's headline, added up from the branch rows.
 *
 * Derived from the same rows the branch cards render rather than re-queried, so
 * the hero figure and the cards under it can never disagree.
 */
export function storeKpiTotals(rows: readonly BranchKpis[]): StoreKpiTotals {
  const days = rows[0]?.dailyRevenue.length ?? 0;
  const dailyRevenue = new Array<number>(days).fill(0);

  let revenue = 0;
  let orderCount = 0;
  let previousRevenue = 0;

  for (const row of rows) {
    revenue += row.revenue;
    orderCount += row.orderCount;
    previousRevenue += row.previousRevenue;
    for (let day = 0; day < days; day += 1) {
      dailyRevenue[day] += row.dailyRevenue[day] ?? 0;
    }
  }

  return {
    revenue,
    orderCount,
    averageOrderValue: safeDivide(revenue, orderCount),
    dailyRevenue,
    previousRevenue,
    revenueDelta: delta(revenue, previousRevenue),
  };
}

/**
 * Completed orders per hour of the Manila day, 0–23.
 *
 * Answers the question a branch card cannot: *when* is this store busy? An owner
 * reads it to move staff and to find the dead hours a promo could fill.
 */
export function hourOfDayVolume(
  orders: readonly KpiOrderLike[] | undefined,
  period: KpiPeriod,
): number[] {
  const buckets = new Array<number>(HOURS_IN_DAY).fill(0);

  for (const order of orders ?? []) {
    if (isCancelled(order)) continue;
    const at = readTimestamp(order);
    if (at === null || !isWithin(period, at)) continue;
    buckets[manilaHourOfDay(at)] += 1;
  }

  return buckets;
}
