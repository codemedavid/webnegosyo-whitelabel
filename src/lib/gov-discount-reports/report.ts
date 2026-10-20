/**
 * Everything the Senior & PWD page shows, computed from the raw rows in one
 * pure step so the page component only lays it out.
 */

import { GOV_DISCOUNT_KINDS, type GovDiscountKind } from '@/lib/gov-discount'
import { kindLabel } from './format'
import { cashierAttribution, grantsWithStatus, groupTotals, sumClaims } from './netting'
import { needsALook } from './review-queue'
import type { GrantEntry, GroupTotals, LedgerClaim, LedgerReview, MoneyTotals, OutletName, ReversalStamp } from './types'

/** Rows the list hands to the browser; the totals always cover every row. */
export const CLIENT_GRANT_LIMIT = 2000

export const NO_BRANCH_KEY = 'none'

export interface GovDiscountReportInput {
  rows: readonly LedgerClaim[]
  laterReversals: readonly ReversalStamp[]
  reviews: readonly LedgerReview[]
  outlets: readonly OutletName[]
}

export interface GovDiscountReport {
  totals: MoneyTotals
  /** How many grants in the window were later taken back. */
  reversedCount: number
  byKind: GroupTotals[]
  byCashier: GroupTotals[]
  /** Null for a single-location store. */
  byBranch: GroupTotals[] | null
  /** Newest first, capped at `CLIENT_GRANT_LIMIT`. */
  grants: GrantEntry[]
  grantCount: number
  needsALook: GrantEntry[]
  kinds: GovDiscountKind[]
}

export function buildGovDiscountReport({ rows, laterReversals, reviews, outlets }: GovDiscountReportInput): GovDiscountReport {
  const grants = grantsWithStatus(rows, laterReversals, reviews)
  const outletName = new Map(outlets.map((outlet) => [outlet.id, outlet.name]))
  const kindRank = (key: string) => GOV_DISCOUNT_KINDS.indexOf(key as GovDiscountKind)
  const hasBranches = outlets.length > 1 || rows.some((row) => row.outletId !== null && !outletName.has(row.outletId))

  return {
    totals: sumClaims(rows),
    reversedCount: grants.filter((grant) => grant.reversedAt !== null).length,
    byKind: groupTotals(rows, (row) => row.kind, (key) => kindLabel(key as GovDiscountKind)).sort(
      (a, b) => kindRank(a.key) - kindRank(b.key),
    ),
    byCashier: groupTotals(rows, cashierAttribution(rows), (key) => key),
    byBranch: hasBranches
      ? groupTotals(
          rows,
          (row) => row.outletId ?? NO_BRANCH_KEY,
          (key) => (key === NO_BRANCH_KEY ? 'No branch recorded' : outletName.get(key) ?? 'Removed branch'),
        )
      : null,
    grants: grants.slice(0, CLIENT_GRANT_LIMIT),
    grantCount: grants.length,
    needsALook: needsALook(grants),
    kinds: GOV_DISCOUNT_KINDS.filter((kind) => rows.some((row) => row.kind === kind)),
  }
}
