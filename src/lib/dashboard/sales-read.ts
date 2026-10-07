/** The contract every backend's sales reader fulfils for the admin dashboard. */

import type { CustomerVisit, SaleRecord } from './sale-record'

export interface SalesReadWindow {
  /** Earliest sale to read, epoch ms (covers the previous window and baselines). */
  readStart: number
  /** Start of the current reporting window; line items are read from here on. */
  currentStart: number
  now: number
  /** Branch-scoped accounts see one branch; null is the whole business. */
  outletId: string | null
  includeItems: boolean
  /**
   * Read the identified visits before `readStart`. Only the Growth classifier
   * uses them — and on a long-lived store they are its WHOLE history, the
   * largest read the dashboard makes — so the Overview never asks for them.
   */
  includePriorVisits: boolean
}

export interface SalesReadResult {
  sales: SaleRecord[]
  /** Completed, identified visits before `readStart`. */
  priorVisits: CustomerVisit[]
  /** Plain-language caveats shown beside the numbers. */
  notes: string[]
  /** True when the order read itself failed — the dashboard shows an error, not zeros. */
  failed: boolean
}
