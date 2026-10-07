/**
 * One view model for the whole Branches area.
 *
 * The index grid, the summary strip above it and each branch's Team tab are
 * three renderings of the same question — what are my branches, who runs them,
 * and how are they doing — so they are answered once, here, as pure data.
 * Computing them separately is how a card comes to claim two staff while the
 * page it opens lists three.
 *
 * Two things this deliberately does NOT do. It does not rank the branches:
 * the grid follows the merchant's own `sort_order`, because that is the order
 * they think in, and the ranking they want is already named in the summary.
 * And it does not judge a branch — no verdicts, no benchmarks. That work lives
 * in the merchant app's `branch-verdict.ts`; repeating a weaker version of it
 * here would give the owner two answers to the same question.
 *
 * Nothing here queries or throws.
 */

import { MAX_STAFF_PER_TENANT } from '@/lib/staff-permissions'
import {
  compareBranches,
  type AnalyticsOrderLike,
  type BranchComparisonRow,
} from './branch-analytics'

/** The branch fields the roster reads. A superset of these is fine. */
export interface RosterOutlet {
  id: string
  name: string
  slug: string
  address: string | null
  is_active: boolean
}

/** The account fields the roster reads, as `app_users` returns them. */
export interface RosterStaff {
  user_id: string
  /** Null/absent = the whole store. */
  outlet_id?: string | null
  is_owner: boolean
  display_name: string | null
  email: string | null
  permissions: string[] | null
  /** Merchant-app screen this account opens on; null/absent = the app decides. */
  default_tab?: string | null
}

/** A branch, its people and its takings. */
export interface BranchRosterEntry<O extends RosterOutlet = RosterOutlet> {
  outlet: O
  staff: RosterStaff[]
  staffCount: number
  /** Seats left under the per-branch cap. Never negative. */
  seatsRemaining: number
  /** Null when the branch has taken no orders, or takings are unavailable. */
  metrics: BranchComparisonRow | null
}

/** The figures the summary strip shows above the grid. */
export interface BranchRosterSummary {
  branchCount: number
  /** Branches customers can currently order from. */
  activeCount: number
  /** Store takings, including orders no branch is attributed to. */
  totalRevenue: number
  totalOrders: number
  /** Highest-earning branch, never the unassigned bucket. Null before any sale. */
  topBranchName: string | null
  /** Non-owner accounts across the store, wherever they are posted. */
  staffCount: number
}

export interface BranchRoster<O extends RosterOutlet = RosterOutlet> {
  branches: BranchRosterEntry<O>[]
  /** Accounts that cover every branch. The owner is not among them. */
  storeWideStaff: RosterStaff[]
  /**
   * Accounts pointing at a branch this store no longer has.
   *
   * Deleting a branch nulls the column, but a roster built between that write
   * and the next fetch would otherwise drop the row entirely — and an account
   * that has silently vanished from the screen still has a working login.
   */
  orphanedStaff: RosterStaff[]
  /** Takings no branch is attributed to. Null when there are none. */
  unassignedMetrics: BranchComparisonRow | null
  /**
   * Whether takings could be read at all. False for the order backends that
   * keep the branch in an unindexed blob, which is a different thing from a
   * store that has sold nothing.
   */
  hasMetrics: boolean
  summary: BranchRosterSummary
}

interface BuildBranchRosterBase<O extends RosterOutlet> {
  /** In the order the merchant arranged them. */
  outlets: readonly O[]
  staff: readonly RosterStaff[]
}

/**
 * Takings arrive either as raw orders or as the comparison already computed
 * from them (`compareBranches`). The pages compute it on the server and hand
 * the browser those few rows rather than the order history; both forms produce
 * the same roster. Null in either means this store's takings cannot be
 * compared by branch.
 */
export type BuildBranchRosterInput<O extends RosterOutlet = RosterOutlet> = BuildBranchRosterBase<O> &
  (
    | { orders: readonly AnalyticsOrderLike[] | null }
    | { metricRows: readonly BranchComparisonRow[] | null }
  )

function comparisonRowsOf(input: BuildBranchRosterInput<RosterOutlet>): readonly BranchComparisonRow[] | null {
  if ('metricRows' in input) return input.metricRows
  return input.orders === null ? null : compareBranches(input.orders)
}

function branchOf(member: RosterStaff): string | null {
  const outletId = member.outlet_id
  return typeof outletId === 'string' && outletId.trim() !== '' ? outletId.trim() : null
}

export function buildBranchRoster<O extends RosterOutlet>(
  input: BuildBranchRosterInput<O>
): BranchRoster<O> {
  const { outlets, staff } = input
  const comparison = comparisonRowsOf(input)
  const hasMetrics = comparison !== null

  const rows = comparison ?? []
  const rowByOutlet = new Map(rows.filter((row) => row.outletId !== null).map((row) => [row.outletId as string, row]))
  const unassignedMetrics = rows.find((row) => row.outletId === null) ?? null

  const members = staff.filter((member) => !member.is_owner)
  const outletIds = new Set(outlets.map((outlet) => outlet.id))

  const staffByOutlet = new Map<string, RosterStaff[]>()
  const storeWideStaff: RosterStaff[] = []
  const orphanedStaff: RosterStaff[] = []

  for (const member of members) {
    const outletId = branchOf(member)

    if (outletId === null) {
      storeWideStaff.push(member)
      continue
    }
    if (!outletIds.has(outletId)) {
      orphanedStaff.push(member)
      continue
    }

    const existing = staffByOutlet.get(outletId)
    if (existing) existing.push(member)
    else staffByOutlet.set(outletId, [member])
  }

  const branches = outlets.map((outlet) => {
    const branchStaff = staffByOutlet.get(outlet.id) ?? []
    return {
      outlet,
      staff: branchStaff,
      staffCount: branchStaff.length,
      seatsRemaining: Math.max(0, MAX_STAFF_PER_TENANT - branchStaff.length),
      metrics: rowByOutlet.get(outlet.id) ?? null,
    }
  })

  return {
    branches,
    storeWideStaff,
    orphanedStaff,
    unassignedMetrics,
    hasMetrics,
    summary: {
      branchCount: outlets.length,
      activeCount: outlets.filter((outlet) => outlet.is_active).length,
      totalRevenue: rows.reduce((sum, row) => sum + row.revenue, 0),
      totalOrders: rows.reduce((sum, row) => sum + row.orderCount, 0),
      topBranchName: topEarningBranchName(branches),
      staffCount: members.length,
    },
  }
}

/**
 * The branch to put in front of the owner.
 *
 * Read off the branch entries rather than off `compareBranches`, so the
 * unassigned bucket — which that function ranks and pins last — can never be
 * crowned, and neither can a branch this store no longer has.
 */
function topEarningBranchName(branches: readonly BranchRosterEntry<RosterOutlet>[]): string | null {
  let top: BranchRosterEntry<RosterOutlet> | null = null

  for (const branch of branches) {
    const revenue = branch.metrics?.revenue ?? 0
    if (revenue <= 0) continue
    if (top === null || revenue > (top.metrics?.revenue ?? 0)) top = branch
  }

  return top?.outlet.name ?? null
}
