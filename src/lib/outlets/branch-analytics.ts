/**
 * Comparing branches against each other.
 *
 * The owner's question is not "how did this branch do" — every existing
 * dashboard answers that — but "how do my branches compare". That is a single
 * pass over one order list, so it lives here as pure data rather than as three
 * queries whose totals can disagree.
 *
 * Two rules make the table trustworthy:
 *
 * **Nothing is dropped.** Orders taken before branches existed carry no branch,
 * and so do orders from any path that has not been taught to stamp one. They
 * are collected into an explicit `Unassigned` row. Discarding them would make
 * the branch table quietly add up to less than the store's own revenue, with
 * nothing on screen to explain the gap.
 *
 * **Cancelled orders are excluded from revenue and count**, matching
 * `deriveStatsForScope` in the merchant app and the Convex stats handler, so
 * the comparison describes the same set of orders as the figures beside it.
 *
 * Nothing here queries or throws. Orders arrive from three backends with
 * different field names and no shared type, so every read is defensive: one
 * malformed row degrades to zero rather than turning the whole table into NaN.
 */

import { getOrderOutletId, getOrderOutletLabel, type OutletOrderLike } from './order-outlet-display'

/** Label for orders that carry no branch. Also the sort key that pins it last. */
export const UNASSIGNED_OUTLET_LABEL = 'Unassigned'

/** Status excluded from revenue and count, mirroring the app's dashboard. */
const CANCELLED_STATUS = 'cancelled'

/** The order fields this module reads, on top of the branch carriers. */
export interface AnalyticsOrderLike extends OutletOrderLike {
  total?: number | null
  status?: string | null
}

/** Every order one branch took, with the name to show for it. */
export interface OutletOrderGroup<T extends AnalyticsOrderLike> {
  /** Null for the Unassigned bucket. */
  outletId: string | null
  outletName: string
  orders: readonly T[]
}

/** One row of the comparison table. */
export interface BranchComparisonRow {
  /** Null for the Unassigned bucket. */
  outletId: string | null
  outletName: string
  revenue: number
  orderCount: number
  averageOrderValue: number
  /** Fraction of store revenue, 0–1. Zero when the store took nothing. */
  revenueShare: number
}

/** Read a numeric total off an untyped row, treating anything else as zero. */
function readTotal(order: AnalyticsOrderLike): number {
  const total = order.total
  return typeof total === 'number' && Number.isFinite(total) ? total : 0
}

/** Whether this order counts toward takings. */
function isCounted(order: AnalyticsOrderLike): boolean {
  return order.status !== CANCELLED_STATUS
}

/**
 * Split orders by the branch that took them, preserving arrival order within
 * each group.
 *
 * Branches appear in the order they are first seen, which keeps the grouping
 * itself opinion-free — `compareBranches` is where ranking happens. The
 * Unassigned bucket is created only if something lands in it, so a merchant who
 * has always been multi-branch is not shown an empty row to wonder about.
 */
export function groupOrdersByOutlet<T extends AnalyticsOrderLike>(
  orders: readonly T[]
): OutletOrderGroup<T>[] {
  const groups = new Map<string | null, { outletName: string; orders: T[] }>()

  for (const order of orders) {
    const outletId = getOrderOutletId(order)
    const existing = groups.get(outletId)

    if (existing) {
      existing.orders.push(order)
      continue
    }

    // The name is a snapshot on the order itself. Falling back to the id keeps
    // a row the owner can still match against their branch list; falling back
    // to a blank would not.
    const outletName =
      outletId === null ? UNASSIGNED_OUTLET_LABEL : getOrderOutletLabel(order) ?? outletId

    groups.set(outletId, { outletName, orders: [order] })
  }

  return Array.from(groups, ([outletId, group]) => ({
    outletId,
    outletName: group.outletName,
    orders: group.orders,
  }))
}

/**
 * The branch comparison table, ranked by revenue.
 *
 * Unassigned is pinned last however much revenue it holds: it is a data-quality
 * bucket, not a branch competing in the ranking, and letting it top the table
 * would read as the store's best-performing location.
 */
export function compareBranches(orders: readonly AnalyticsOrderLike[]): BranchComparisonRow[] {
  const groups = groupOrdersByOutlet(orders)
  if (groups.length === 0) return []

  const rows = groups.map(({ outletId, outletName, orders: groupOrders }) => {
    const counted = groupOrders.filter(isCounted)
    const revenue = counted.reduce((sum, order) => sum + readTotal(order), 0)
    const orderCount = counted.length

    return {
      outletId,
      outletName,
      revenue,
      orderCount,
      averageOrderValue: orderCount === 0 ? 0 : revenue / orderCount,
      // Filled in below, once the store total is known.
      revenueShare: 0,
    }
  })

  const storeRevenue = rows.reduce((sum, row) => sum + row.revenue, 0)

  return rows
    .map((row) => ({
      ...row,
      revenueShare: storeRevenue === 0 ? 0 : row.revenue / storeRevenue,
    }))
    .sort((a, b) => {
      if (a.outletId === null) return 1
      if (b.outletId === null) return -1
      return b.revenue - a.revenue
    })
}
