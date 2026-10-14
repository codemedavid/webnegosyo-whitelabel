/**
 * The Senior/PWD sales book as the owner's reports read it.
 *
 * Rows come from `gov_discount_claims` (append-only). A `reversed` row repeats
 * the amounts of the `granted` row it cancels — same (backend, order,
 * revision, claimant) — so every figure here is a SIGNED sum: a grant adds, its
 * reversal subtracts, each on the day it was recorded. That is how the BIR
 * book prints them too (see `sales-book.ts`), so the screen and the file agree.
 */

import type { GovDiscountKind, GovFlag } from '@/lib/gov-discount'

export type ClaimEvent = 'granted' | 'reversed'
export type ClaimVerification = 'verified' | 'mismatch' | 'payload_only'
export type ReviewVerdict = 'ok' | 'problem'

export interface LedgerClaim {
  id: string
  outletId: string | null
  backend: string
  externalOrderId: string
  orderLabel: string | null
  revision: number
  event: ClaimEvent
  claimantRef: string
  kind: GovDiscountKind
  claimantName: string
  idNumber: string
  allocationMode: 'items' | 'shared'
  diners: number | null
  vatStatus: 'vat' | 'non_vat'
  grossShare: number
  vatExemptSales: number
  vatRemoved: number
  discount: number
  netDue: number
  reduction: number
  orderTotal: number | null
  serverReduction: number | null
  verification: ClaimVerification
  flags: GovFlag[]
  grantedByName: string
  approvedByName: string | null
  source: 'pos' | 'online'
  occurredAt: string
}

export interface LedgerReview {
  id: string
  claimId: string
  verdict: ReviewVerdict
  note: string | null
  reviewerName: string
  createdAt: string
}

/** Only what's needed to tell that a grant was later taken back. */
export interface ReversalStamp {
  backend: string
  externalOrderId: string
  revision: number
  claimantRef: string
  occurredAt: string
}

/** Signed sums over a set of rows, in pesos. `sales` = grants − reversals. */
export interface MoneyTotals {
  sales: number
  grossShare: number
  vatRemoved: number
  vatExemptSales: number
  discount: number
  netDue: number
  reduction: number
}

export interface GroupTotals {
  key: string
  label: string
  totals: MoneyTotals
}

/** A grant as the ledger list shows it: with its fate and its reviews. */
export interface GrantEntry extends LedgerClaim {
  /** When it was taken back (an edit or a cancellation), or null. */
  reversedAt: string | null
  /** Newest first. */
  reviews: LedgerReview[]
}

/** An ID photo the reviewer may open, matched to a grant by order + claimant. */
export interface IdPhotoRef {
  id: string
  backend: string
  externalOrderId: string
  claimantRef: string
}

export interface OutletName {
  id: string
  name: string
}
