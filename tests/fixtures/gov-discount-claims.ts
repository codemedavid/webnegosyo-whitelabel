import type { GrantEntry, LedgerClaim, LedgerReview } from '@/lib/gov-discount-reports/types'

let sequence = 0

/** A Senior grant of ₱112 (₱100 + VAT) at a VAT store, as the ledger stores it. */
export function claim(overrides: Partial<LedgerClaim> = {}): LedgerClaim {
  sequence += 1
  return {
    id: `claim-${String(sequence).padStart(4, '0')}`,
    outletId: null,
    backend: 'platform_supabase',
    externalOrderId: `order-${sequence}`,
    orderLabel: `#${sequence}`,
    revision: 0,
    event: 'granted',
    claimantRef: 'c1',
    kind: 'senior',
    claimantName: 'Juan Dela Cruz',
    idNumber: 'OSCA-12345',
    allocationMode: 'items',
    diners: null,
    vatStatus: 'vat',
    grossShare: 112,
    vatExemptSales: 100,
    vatRemoved: 12,
    discount: 20,
    netDue: 80,
    reduction: 32,
    orderTotal: 80,
    serverReduction: 32,
    verification: 'verified',
    flags: [],
    grantedByName: 'Ana',
    approvedByName: null,
    source: 'pos',
    occurredAt: '2026-10-05T04:00:00.000Z',
    ...overrides,
  }
}

/** The reversal row the ledger writes for `grant` (same amounts, new actor/time). */
export function reversalOf(grant: LedgerClaim, overrides: Partial<LedgerClaim> = {}): LedgerClaim {
  sequence += 1
  return {
    ...grant,
    id: `claim-${String(sequence).padStart(4, '0')}`,
    event: 'reversed',
    flags: [],
    occurredAt: '2026-10-05T06:00:00.000Z',
    ...overrides,
  }
}

export function review(overrides: Partial<LedgerReview> & { claimId: string }): LedgerReview {
  sequence += 1
  return {
    id: `review-${sequence}`,
    verdict: 'ok',
    note: null,
    reviewerName: 'Owner',
    createdAt: '2026-10-06T00:00:00.000Z',
    ...overrides,
  }
}

export function grantEntry(overrides: Partial<GrantEntry> = {}): GrantEntry {
  return { ...claim(overrides), reversedAt: null, reviews: [], ...overrides }
}
