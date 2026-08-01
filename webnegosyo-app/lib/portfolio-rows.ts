/**
 * The portfolio's rows: every branch the store has, with what each took.
 *
 * Two sources that disagree by design. The branch list is the store's own
 * `outlets` rows — the truth about which branches exist and what they are
 * called *now*. The figures come from `compareBranches`, which derives them
 * from orders and can only know about branches that have taken one.
 *
 * The list wins on membership and on naming:
 *
 * - Membership, because a branch that has never taken an order is the branch
 *   most likely to need the owner's attention, and it would be invisible if
 *   the orders decided who appears.
 * - Naming, because an order snapshots the branch name at the time it was
 *   taken (renaming a branch must not rewrite its old tickets), so a renamed
 *   branch would otherwise show its old name on the very screen it is managed
 *   from.
 *
 * Unassigned takings survive as a trailing row when there are any, so the
 * store total on this screen still matches the dashboard's — a portfolio that
 * quietly under-reported the day would be worse than no portfolio.
 */

import type { BranchComparisonRow } from "./branch-analytics";

/** A branch as the store lists it. */
export interface PortfolioOutlet {
  id: string;
  name: string;
}

/** One card on the portfolio. `outletId: null` is the unassigned bucket. */
export type PortfolioRow = BranchComparisonRow;

export interface StoreTotals {
  revenue: number;
  orderCount: number;
}

const ZERO = { revenue: 0, orderCount: 0, averageOrderValue: 0, revenueShare: 0 } as const;

/**
 * Branch rows ranked by revenue, then the unassigned bucket if it holds
 * anything.
 */
export function buildPortfolioRows(
  outlets: readonly PortfolioOutlet[],
  comparison: readonly BranchComparisonRow[],
): PortfolioRow[] {
  const byOutletId = new Map(comparison.map((row) => [row.outletId, row]));

  const branchRows = outlets
    .map((outlet) => {
      const figures = byOutletId.get(outlet.id);
      return { ...ZERO, ...figures, outletId: outlet.id, outletName: outlet.name };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const unassigned = byOutletId.get(null);
  // An empty unassigned bucket is not a data-quality problem worth a card.
  if (!unassigned || unassigned.orderCount === 0) return branchRows;

  return [...branchRows, unassigned];
}

/** What the whole store took, across every row including unassigned. */
export function storeTotals(rows: readonly PortfolioRow[]): StoreTotals {
  return rows.reduce<StoreTotals>(
    (totals, row) => ({
      revenue: totals.revenue + row.revenue,
      orderCount: totals.orderCount + row.orderCount,
    }),
    { revenue: 0, orderCount: 0 },
  );
}
