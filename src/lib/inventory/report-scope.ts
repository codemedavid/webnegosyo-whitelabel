/**
 * Which shop the daily report answers for, and whether it may state a food cost.
 *
 * Pulled out of the page because a server component cannot be unit-tested, and
 * this is the part that must not be wrong: it decides whether the two halves of
 * the food-cost ratio describe the same business.
 *
 * THE ASYMMETRY THIS EXISTS FOR. The stock half can always be narrowed — every
 * `stock_movements` row carries an `outlet_id`. The takings half depends
 * entirely on where the tenant's orders live:
 *
 *  - **Platform / per-tenant Supabase** — `getDailyRevenue` narrows the `orders`
 *    read by `outlet_id`. Comparable.
 *  - **Convex** — `orders:getDashboardStatsByPeriod` takes a date window and
 *    nothing else. Store-wide, whoever asks.
 *
 * So a branch admin on Convex would get a BRANCH numerator over STORE-WIDE
 * takings: a food cost understated by roughly the number of branches. That is
 * the dangerous direction — an overstated figure looks like a crisis and gets
 * investigated, an understated one gets believed. Those tenants keep the
 * withheld figure until the Convex query learns a branch.
 *
 * Mirrors `webnegosyo-app/lib/daily-report-revenue.ts`, deliberately: a merchant
 * who sees a food cost on their phone and a blank on the web has no way to know
 * which surface is lying to them.
 */

import type { BranchScope } from '@/lib/outlets/branch-scope'

export interface ReportScopeInput {
  /** The branch this ACCOUNT is confined to, not an owner's drill-down. */
  scope: BranchScope
  /** Where this tenant's orders live. `null` when it could not be established. */
  orderBackend: string | null
}

export interface ReportScope {
  /** The branch to read, or `null` for the whole store. */
  outletId: string | null
  /**
   * Whether the takings can be narrowed to the same branch as the stock.
   *
   * True for a store-wide account: nothing is being narrowed, so there is no
   * mismatch to guard against, and withholding would take the figure away from
   * every tenant that has had it all along.
   */
  isRevenueBranchScoped: boolean
}

/** Backends whose order reads can be filtered by branch. */
const BRANCH_SCOPABLE_BACKENDS = new Set(['platform', 'supabase'])

export function resolveReportScope({ scope, orderBackend }: ReportScopeInput): ReportScope {
  if (scope.kind !== 'branch') {
    return { outletId: null, isRevenueBranchScoped: true }
  }

  return {
    outletId: scope.outletId,
    // An unrecognised or absent backend is treated as unnarrowable. Absent
    // means "not established", never "assume yes" — the same rule the merchant
    // app follows, and the one that stops a new backend publishing
    // incomparable figures merely by not being listed here.
    isRevenueBranchScoped: BRANCH_SCOPABLE_BACKENDS.has(orderBackend ?? ''),
  }
}
