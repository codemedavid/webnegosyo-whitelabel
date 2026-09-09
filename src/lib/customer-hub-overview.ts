/**
 * The Customer Hub's overview payload.
 *
 * The Hub is rendered by the merchant app, which cannot import from `src/`. So
 * this is the seam: the platform computes every number, the app renders them.
 * Keeping the arithmetic here means the repeat-rate definition cannot drift
 * between the app and the web admin port that follows it.
 *
 * Pure and clock-injected; the I/O lives in the route that calls it.
 */

import {
  computeCustomerOverview,
  rankCustomerItems,
  type CustomerOrderFact,
  type CustomerOverviewWindow,
  type RankedCustomerItem,
} from '@/lib/customer-order-facts'
import type { CustomerFactsCoverage, CustomerFactsResult } from '@/lib/queries/customer-facts'

/** The windows the Hub shows, in the order it shows them. */
const WINDOWS: Array<7 | 30 | 90> = [7, 30, 90]
const TOP_ITEM_LIMIT = 5

export interface CustomerHubOverview {
  windows: CustomerOverviewWindow[]
  topItems: RankedCustomerItem[]
  /**
   * Carried through from the reader untouched. The brief requires the
   * identified-order coverage to sit BESIDE the metric: a repeat rate computed
   * from a half-filled ledger is not wrong so much as unqualified, and hiding
   * that is how a merchant comes to trust a number they should not.
   */
  coverage: CustomerFactsCoverage
}

export function buildCustomerHubOverview(
  read: CustomerFactsResult,
  options: { now?: Date } = {},
): CustomerHubOverview {
  const now = options.now ?? new Date()
  const facts: CustomerOrderFact[] = read.facts

  return {
    windows: WINDOWS.map((days) => computeCustomerOverview(facts, { days, now })),
    // Ranked across the whole read rather than per window: a favourite item is a
    // habit, and a 7-day slice of one is mostly noise. `rankCustomerItems` drops
    // unqualified orders itself, so a cancelled sale cannot become a favourite.
    topItems: rankCustomerItems(facts, TOP_ITEM_LIMIT),
    coverage: read.coverage,
  }
}
