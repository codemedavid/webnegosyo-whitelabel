/**
 * Branch scoping for the dashboard, where the flat `filterOrdersToScope` does
 * not fit.
 *
 * Two shapes need their own treatment:
 *
 * - The live queue arrives grouped by status from `orders:getRealtimeQueue`,
 *   so it is filtered bucket by bucket. Emptying a bucket must not delete its
 *   key: the status pipeline renders one column per status, and a missing key
 *   would read as a broken screen rather than as "nothing here yet".
 *
 * - The stat tiles come from `orders:getDashboardStats`, which aggregates
 *   inside Convex over the whole tenant. A branch account reading those tiles
 *   beside its own filtered order list would see store-wide revenue over its
 *   own orders. Rather than label the mismatch, the stats are re-derived here
 *   from the order list so the two always agree.
 *
 * `deriveStatsForScope` mirrors the Convex handler's arithmetic deliberately:
 * cancelled orders are excluded from revenue, order count and average, but are
 * still counted in the status breakdown. If that handler changes, this changes
 * with it — otherwise a branch account and the owner would disagree about the
 * same day's takings.
 */

import { filterOrdersToScope, isOrderInScope, type BranchScope, type ScopedOrderLike } from "./branch-scope";

/** The stat tiles, in the shape `orders:getDashboardStats` returns them. */
export interface DashboardStatsLike {
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  statusCounts: Record<string, number>;
}

/** An order carrying what the stats need on top of its branch. */
export interface StatOrderLike extends ScopedOrderLike {
  _creationTime?: number;
  status?: string;
  total?: number;
}

/** The window the period selector is showing, in epoch milliseconds. */
export interface StatPeriod {
  startDate: number;
  endDate: number;
}

/**
 * Every status the dashboard renders a column for. Listed explicitly so a
 * status with no orders still reports zero instead of vanishing.
 */
const DASHBOARD_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "delivered",
  "cancelled",
] as const;

const CANCELLED = "cancelled";

/**
 * The live queue a scope may see, still grouped by status.
 *
 * An all-branch account gets the caller's own object back — the common case,
 * and it keeps the reference stable for `useMemo` consumers.
 */
export function filterQueueToScope<T extends object>(
  scope: BranchScope,
  queue: Record<string, T[]> | undefined,
): Record<string, T[]> {
  if (!queue) return {};
  if (scope.kind === "all") return queue;

  const scoped: Record<string, T[]> = {};
  for (const [status, orders] of Object.entries(queue)) {
    // The key survives even when the bucket empties.
    scoped[status] = orders.filter((order) => isOrderInScope(scope, order));
  }
  return scoped;
}

function zeroedStatusCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const status of DASHBOARD_STATUSES) counts[status] = 0;
  return counts;
}

function isWithin(period: StatPeriod, order: StatOrderLike): boolean {
  const at = order._creationTime;
  if (typeof at !== "number") return false;
  // Inclusive at both ends, matching the Convex handler's gte/lte.
  return at >= period.startDate && at <= period.endDate;
}

/**
 * The stat tiles for this scope and period, derived from the order list.
 *
 * Both filters are applied here rather than by the caller so the tiles cannot
 * drift from the list beside them.
 */
export function deriveStatsForScope<T extends object>(
  scope: BranchScope,
  orders: readonly T[] | undefined,
  period: StatPeriod,
): DashboardStatsLike {
  const inScope = filterOrdersToScope(scope, orders) as readonly StatOrderLike[];
  const inPeriod = inScope.filter((order) => isWithin(period, order));

  const statusCounts = zeroedStatusCounts();
  for (const order of inPeriod) {
    const status = order.status;
    // An unrecognised status is still worth showing rather than dropping.
    if (typeof status === "string") {
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    }
  }

  const completed = inPeriod.filter((order) => order.status !== CANCELLED);
  const totalRevenue = completed.reduce((sum, order) => sum + (order.total ?? 0), 0);

  return {
    totalOrders: completed.length,
    totalRevenue,
    // Guard the divisor: an empty day must read as zero, never NaN.
    avgOrderValue: completed.length > 0 ? totalRevenue / completed.length : 0,
    statusCounts,
  };
}
