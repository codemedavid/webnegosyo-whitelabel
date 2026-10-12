/**
 * Database rows → report rows. Anything the ledger's CHECK constraints would
 * never allow (an unknown kind or event) is dropped rather than guessed at.
 */

import { isGovDiscountKind, sortFlags } from '@/lib/gov-discount'
import type { ClaimVerification, LedgerClaim, LedgerReview, ReversalStamp } from './types'

/** Every column the reports read — never `*`, never the user ids. */
export const CLAIM_COLUMNS = [
  'id',
  'outlet_id',
  'backend',
  'external_order_id',
  'order_label',
  'revision',
  'event',
  'claimant_ref',
  'kind',
  'claimant_name',
  'id_number',
  'allocation_mode',
  'diners',
  'vat_status',
  'gross_share',
  'vat_exempt_sales',
  'vat_removed',
  'discount',
  'net_due',
  'reduction',
  'order_total',
  'server_reduction',
  'verification',
  'flags',
  'granted_by_name',
  'approved_by_name',
  'source',
  'occurred_at',
].join(', ')

export const REVERSAL_COLUMNS = 'backend, external_order_id, revision, claimant_ref, occurred_at'

export const REVIEW_COLUMNS = 'id, claim_id, verdict, note, reviewer_name, created_at'

type Row = Record<string, unknown>

const VERIFICATIONS: readonly ClaimVerification[] = ['verified', 'mismatch', 'payload_only']

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** PostgREST may send NUMERIC as a string; junk reads as zero. */
function money(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function moneyOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : money(value)
}

export function toLedgerClaim(row: Row): LedgerClaim | null {
  const { event, kind } = row
  if (event !== 'granted' && event !== 'reversed') return null
  if (!isGovDiscountKind(kind)) return null
  const verification = VERIFICATIONS.includes(row.verification as ClaimVerification)
    ? (row.verification as ClaimVerification)
    : 'payload_only'

  return {
    id: text(row.id),
    outletId: textOrNull(row.outlet_id),
    backend: text(row.backend),
    externalOrderId: text(row.external_order_id),
    orderLabel: textOrNull(row.order_label),
    revision: Math.trunc(money(row.revision)),
    event,
    claimantRef: text(row.claimant_ref),
    kind,
    claimantName: text(row.claimant_name),
    idNumber: text(row.id_number),
    allocationMode: row.allocation_mode === 'shared' ? 'shared' : 'items',
    diners: row.diners === null || row.diners === undefined ? null : Math.trunc(money(row.diners)),
    vatStatus: row.vat_status === 'non_vat' ? 'non_vat' : 'vat',
    grossShare: money(row.gross_share),
    vatExemptSales: money(row.vat_exempt_sales),
    vatRemoved: money(row.vat_removed),
    discount: money(row.discount),
    netDue: money(row.net_due),
    reduction: money(row.reduction),
    orderTotal: moneyOrNull(row.order_total),
    serverReduction: moneyOrNull(row.server_reduction),
    verification,
    flags: sortFlags(Array.isArray(row.flags) ? row.flags : []),
    grantedByName: text(row.granted_by_name) || 'Staff',
    approvedByName: textOrNull(row.approved_by_name),
    source: row.source === 'online' ? 'online' : 'pos',
    occurredAt: text(row.occurred_at),
  }
}

export function toReversalStamp(row: Row): ReversalStamp {
  return {
    backend: text(row.backend),
    externalOrderId: text(row.external_order_id),
    revision: Math.trunc(money(row.revision)),
    claimantRef: text(row.claimant_ref),
    occurredAt: text(row.occurred_at),
  }
}

export function toLedgerReview(row: Row): LedgerReview | null {
  const { verdict } = row
  if (verdict !== 'ok' && verdict !== 'problem') return null
  return {
    id: text(row.id),
    claimId: text(row.claim_id),
    verdict,
    note: textOrNull(row.note),
    reviewerName: text(row.reviewer_name) || 'Staff',
    createdAt: text(row.created_at),
  }
}

/** Maps a batch, dropping rows that fail to parse. */
export function mapRows<T>(rows: readonly Row[], map: (row: Row) => T | null): T[] {
  return rows.flatMap((row) => {
    const mapped = map(row)
    return mapped === null ? [] : [mapped]
  })
}
