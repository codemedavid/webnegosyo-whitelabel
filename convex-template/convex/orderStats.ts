/**
 * The four dashboard figures, and which branch they describe.
 *
 * Deliberately free of Convex imports so the platform repo's Jest run can test
 * it, like `orderRevise.ts` and `pushRecipients.ts`. Both dashboard queries
 * computed these from near-identical copies and neither had any automated
 * coverage.
 *
 * WHY THE BRANCH ARGUMENT EXISTS. The daily inventory report divides a day's
 * stock cost by these takings. The stock half can always be narrowed to one
 * branch — every `stock_movements` row carries an `outlet_id`. Until this, the
 * takings half could not, so a branch manager's food cost had to be withheld
 * entirely rather than shown understated by roughly the number of branches. An
 * understated food cost is the direction that gets believed rather than
 * investigated.
 */

import { filterOrdersToOutlet, type BranchedOrderLike } from "./pushRecipients";

/** An order, as far as the dashboard figures are concerned. */
export interface StatsOrderLike extends BranchedOrderLike {
  total: number;
  status: string;
}

export interface OrderStats {
  /** Orders that were not cancelled. */
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  statusCounts: Record<string, number>;
}

/** The statuses the dashboard reports on, in the order the panel shows them. */
const REPORTED_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "delivered",
  "cancelled",
] as const;

function emptyStatusCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const status of REPORTED_STATUSES) counts[status] = 0;
  return counts;
}

/**
 * Summarize a window of orders, optionally for one branch.
 *
 * An order with no branch is NOT credited to a branch — it belongs to none, and
 * attributing it would inflate that branch's takings and understate its food
 * cost. `filterOrdersToOutlet` also reads the branch out of `customerData` when
 * the column is absent, which every order predating v15 relies on.
 */
export function summarizeOrderStats(
  orders: readonly StatsOrderLike[],
  outletId?: string | null,
): OrderStats {
  const inScope = filterOrdersToOutlet(orders, outletId);

  const completedOrders = inScope.filter((order) => order.status !== "cancelled");
  const totalRevenue = completedOrders.reduce((sum, order) => sum + order.total, 0);

  const statusCounts = emptyStatusCounts();
  for (const order of inScope) {
    // Only statuses this dashboard reports on. The tally used to index blind,
    // so a status added by a later schema turned its count into NaN and took
    // the whole query down with it.
    if (order.status in statusCounts) statusCounts[order.status] += 1;
  }

  return {
    totalOrders: completedOrders.length,
    totalRevenue,
    // Guarded, because a NaN average reaches the screen as "NaN" and reads as a
    // broken backend rather than as a quiet day.
    avgOrderValue: completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0,
    statusCounts,
  };
}
