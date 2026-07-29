/**
 * Comparing branches against each other, in the merchant app.
 *
 * Hand-kept copy of `src/lib/outlets/branch-analytics.ts`. The two packages
 * build separately and share no import — the same arrangement
 * `staff-permissions.ts` and `branch-scope.ts` already use. **Keep the two in
 * sync**: an owner who reads ₱400 for a branch on the web must read ₱400 for it
 * here, and both test files assert the same rules so a drift shows up as a
 * failure rather than as two disagreeing dashboards.
 *
 * Two rules make the table trustworthy:
 *
 * **Nothing is dropped.** Orders taken before branches existed carry no branch.
 * They are collected into an explicit `Unassigned` row rather than discarded,
 * so the branch figures always add up to the store's own.
 *
 * **Cancelled orders are excluded from revenue and count**, matching
 * `deriveStatsForScope` in `branch-dashboard.ts` and the Convex stats handler.
 *
 * Nothing here queries or throws. Orders arrive untyped from three backends, so
 * every read is defensive: one malformed row degrades to zero rather than
 * turning the whole comparison into NaN.
 */

import { ORDER_OUTLET_NAME_KEY } from "./order-outlet";
import { getOrderOutletId, type ScopedOrderLike } from "./branch-scope";

/** Label for orders that carry no branch. */
export const UNASSIGNED_OUTLET_LABEL = "Unassigned";

/** Status excluded from revenue and count. */
const CANCELLED_STATUS = "cancelled";

/** The order fields this module reads, on top of the branch carriers. */
export interface AnalyticsOrderLike extends ScopedOrderLike {
  total?: number | null;
  status?: string | null;
}

/** One row of the comparison. */
export interface BranchComparisonRow {
  /** Null for the Unassigned bucket. */
  outletId: string | null;
  outletName: string;
  revenue: number;
  orderCount: number;
  averageOrderValue: number;
  /** Fraction of store revenue, 0–1. Zero when the store took nothing. */
  revenueShare: number;
}

/**
 * The branch name recorded on this order.
 *
 * A snapshot taken at order time, not a live lookup: renaming a branch must not
 * rewrite the tickets it already took.
 */
export function getOrderOutletLabel(order: AnalyticsOrderLike | null | undefined): string | null {
  if (!order) return null;

  const blob = order.customerData;
  if (typeof blob !== "object" || blob === null || Array.isArray(blob)) return null;

  const value = (blob as Record<string, unknown>)[ORDER_OUTLET_NAME_KEY];
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Read a numeric total off an untyped row, treating anything else as zero. */
function readTotal(order: AnalyticsOrderLike): number {
  const total = order.total;
  return typeof total === "number" && Number.isFinite(total) ? total : 0;
}

interface Bucket {
  outletName: string;
  revenue: number;
  orderCount: number;
}

/**
 * The branch comparison, ranked by revenue.
 *
 * Unassigned is pinned last however much revenue it holds: it is a data-quality
 * bucket, not a branch competing in the ranking, and letting it top the table
 * would read as the store's best-performing location.
 */
export function compareBranches(
  orders: readonly AnalyticsOrderLike[],
): BranchComparisonRow[] {
  const buckets = new Map<string | null, Bucket>();

  for (const order of orders) {
    const outletId = getOrderOutletId(order);

    let bucket = buckets.get(outletId);
    if (!bucket) {
      // Falling back to the id keeps a row the owner can match against their
      // branch list; falling back to a blank would not.
      const outletName =
        outletId === null ? UNASSIGNED_OUTLET_LABEL : getOrderOutletLabel(order) ?? outletId;
      bucket = { outletName, revenue: 0, orderCount: 0 };
      buckets.set(outletId, bucket);
    }

    // The row exists as soon as a branch appears, so a branch whose orders were
    // all cancelled still shows — with zeroes — rather than vanishing.
    if (order.status === CANCELLED_STATUS) continue;

    bucket.revenue += readTotal(order);
    bucket.orderCount += 1;
  }

  if (buckets.size === 0) return [];

  const storeRevenue = Array.from(buckets.values()).reduce((sum, b) => sum + b.revenue, 0);

  return Array.from(buckets, ([outletId, bucket]) => ({
    outletId,
    outletName: bucket.outletName,
    revenue: bucket.revenue,
    orderCount: bucket.orderCount,
    averageOrderValue: bucket.orderCount === 0 ? 0 : bucket.revenue / bucket.orderCount,
    revenueShare: storeRevenue === 0 ? 0 : bucket.revenue / storeRevenue,
  })).sort((a, b) => {
    if (a.outletId === null) return 1;
    if (b.outletId === null) return -1;
    return b.revenue - a.revenue;
  });
}
