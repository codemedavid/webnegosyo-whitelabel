/**
 * Writing a Senior/PWD grant into the sales book.
 *
 * Called by `POST /api/gov-discounts/record` after the caller is verified. The
 * steps, in order:
 *
 *   1. Read what the server trusts: the store's tax profile, the items the
 *      store excluded, the saved order lines (platform stores).
 *   2. Consume the manager approval, if the register sent one — one approval
 *      can vouch for one order only.
 *   3. Re-price and flag (`verify.ts`), and look for the same ID on another
 *      order today.
 *   4. Reverse whatever earlier revisions of this order granted, then append
 *      this revision's grants. Re-sending the same request is a no-op (the
 *      ledger's unique key), so the register can retry freely.
 *
 * Integrity rules (security review 2026-10-15):
 *
 * - A take-back (`government: null`) is only believed when the order itself
 *   agrees: a platform order must exist in this store and no longer carry a
 *   Senior/PWD block (or be cancelled). An order the server cannot read
 *   (Convex, a tenant's own Supabase) is still reversed — the register is the
 *   only witness — but the reversal is flagged for the owner.
 * - Records can arrive out of order (an offline register retries). A late
 *   OLDER revision is written and immediately taken back, so the book keeps
 *   the audit trail without counting the discount twice; a late take-back
 *   never touches a newer revision. A grant that arrives after the order was
 *   cancelled is likewise written and taken back.
 * - The sale time is the register's, bounded by the server clock: a future
 *   time is replaced (`clock_ahead`), an old one is kept but marked
 *   `late_sync`. The device queue has no maximum age (a record is a tax
 *   document), so old times are accepted rather than refused.
 * - A manager approval is consumed only for the claimants it was given for
 *   (`approval-binding.ts`).
 *
 * The data access is injected (`LedgerStore`) so the whole flow is testable
 * without a database.
 */

import { normalizeIdNumber, sortFlags, type GovFlag, type RecordGovDiscountRequest, type TaxProfile } from '@/lib/gov-discount'
import { saleFingerprint } from './approval-binding'
import { verifyGrant, type SavedOrderLine } from './verify'

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
/** A register clock this far ahead is still believed (clock drift). */
const FUTURE_TOLERANCE_MS = 2 * 60 * 1000
/** Older than this, a record was queued offline — kept, but marked. */
const LATE_AFTER_MS = 15 * 60 * 1000

export interface LedgerActor {
  /** Null for an online order — no staff member granted it. */
  userId: string | null
  name: string
}

export interface ConsumedApproval {
  approvalId: string
  approverUserId: string | null
  approverName: string
}

/** A granted row that no later row has reversed. */
export interface ActiveGrant {
  revision: number
  claimantRef: string
  row: ClaimRow
}

export interface ClaimRow {
  tenant_id: string
  outlet_id: string | null
  backend: string
  external_order_id: string
  order_label: string | null
  order_created_at: string | null
  revision: number
  event: 'granted' | 'reversed'
  claimant_ref: string
  kind: string
  claimant_name: string
  id_number: string
  allocation_mode: 'items' | 'shared'
  diners: number | null
  vat_status: string
  gross_share: number
  vat_exempt_sales: number
  vat_removed: number
  discount: number
  net_due: number
  reduction: number
  order_total: number | null
  server_reduction: number | null
  verification: 'verified' | 'mismatch' | 'payload_only'
  flags: GovFlag[]
  granted_by: string | null
  granted_by_name: string
  approval_id: string | null
  approved_by: string | null
  approved_by_name: string | null
  /** Set on a reversed row only: who took the discount back. */
  reversed_by?: string | null
  reversed_by_name?: string | null
  source: 'pos' | 'online'
  occurred_at: string
}

/** What the server can see of the order a record is about. */
export type LedgerOrderState =
  /** A backend the server does not read (Convex, a tenant's own Supabase). */
  | { readable: false }
  | { readable: true; exists: false }
  | { readable: true; exists: true; cancelled: boolean; hasGovernment: boolean }

export interface LedgerStore {
  loadTaxProfile(tenantId: string): Promise<TaxProfile | null>
  loadExcludedMenuItemIds(tenantId: string, menuItemIds: readonly string[]): Promise<Set<string>>
  /** Null when the backend is not one the server reads, or the order is not found. */
  loadSavedLines(request: RecordGovDiscountRequest): Promise<SavedOrderLine[] | null>
  loadOrderState(order: { tenantId: string; backend: string; externalOrderId: string }): Promise<LedgerOrderState>
  consumeApproval(args: {
    approvalId: string
    tenantId: string
    cashierUserId: string
    reduction: number
    orderRef: string
    /** `approval-binding.ts` — the approval must have been given for these claimants. */
    saleFingerprint: string
  }): Promise<ConsumedApproval | null>
  /** ID numbers (normalised) already granted on a DIFFERENT order since `sinceIso`. */
  idsUsedElsewhere(args: {
    tenantId: string
    idNumbers: readonly string[]
    externalOrderId: string
    sinceIso: string
  }): Promise<Set<string>>
  listActiveGrants(tenantId: string, backend: string, externalOrderId: string): Promise<ActiveGrant[]>
  /** The highest revision the book holds for this order (any event), or null. */
  highestRevision(tenantId: string, backend: string, externalOrderId: string): Promise<number | null>
  /** Inserts, skipping rows the ledger already holds. Returns how many were new. */
  insertClaims(rows: readonly ClaimRow[]): Promise<number>
}

/** Why a take-back was not written (the route answers 409; the register retries). */
export type RecordRefusal = 'order_not_found' | 'order_still_discounted'

export interface RecordOutcome {
  granted: number
  reversed: number
  verification: 'verified' | 'mismatch' | 'payload_only' | 'none'
  flags: GovFlag[]
  refused?: RecordRefusal
}

/** The sale time to record, and what the server thought of the register's clock. */
export function ledgerTimestamp(reported: string, now: Date): { occurredAt: string; flags: GovFlag[] } {
  const reportedMs = Date.parse(reported)
  if (!Number.isFinite(reportedMs) || reportedMs > now.getTime() + FUTURE_TOLERANCE_MS) {
    return { occurredAt: now.toISOString(), flags: ['clock_ahead'] }
  }
  if (reportedMs < now.getTime() - LATE_AFTER_MS) return { occurredAt: reported, flags: ['late_sync'] }
  return { occurredAt: reported, flags: [] }
}

/** Midnight in Manila, as an ISO instant. */
export function manilaDayStart(now: Date): string {
  const local = now.getTime() + MANILA_OFFSET_MS
  return new Date(Math.floor(local / DAY_MS) * DAY_MS - MANILA_OFFSET_MS).toISOString()
}

function orderRef(request: RecordGovDiscountRequest): string {
  return `${request.backend}:${request.externalOrderId}#${request.revision}`
}

/**
 * The row that cancels an earlier grant. It keeps the ORIGINAL granter (the
 * sales book still says whose discount it was) and names who took it back.
 * (`reverse-on-cancel.ts` builds the same row for a cancelled order.)
 */
function reversalOf(grant: ActiveGrant, actor: LedgerActor, occurredAt: string, flags: GovFlag[] = []): ClaimRow {
  return {
    ...grant.row,
    event: 'reversed',
    flags,
    reversed_by: actor.userId,
    reversed_by_name: actor.name,
    occurred_at: occurredAt,
  }
}

/**
 * Whether a take-back may be written, judged against the order itself. Null =
 * go ahead (with `flags` on the reversal rows); a refusal otherwise.
 */
function takeBackVerdict(state: LedgerOrderState): { refused: RecordRefusal } | { flags: GovFlag[] } {
  if (!state.readable) return { flags: ['reversal_unverified'] }
  if (!state.exists) return { refused: 'order_not_found' }
  if (state.hasGovernment && !state.cancelled) return { refused: 'order_still_discounted' }
  return { flags: [] }
}

async function recordTakeBack(
  store: LedgerStore,
  request: RecordGovDiscountRequest,
  actor: LedgerActor,
  occurredAt: string,
): Promise<RecordOutcome> {
  const empty: RecordOutcome = { granted: 0, reversed: 0, verification: 'none', flags: [] }
  const active = await store.listActiveGrants(request.tenantId, request.backend, request.externalOrderId)
  // A late take-back never reaches a revision newer than itself.
  const superseded = active.filter((grant) => grant.revision <= request.revision)
  if (superseded.length === 0) return empty

  const verdict = takeBackVerdict(await store.loadOrderState(request))
  if ('refused' in verdict) return { ...empty, refused: verdict.refused }

  const reversed = await store.insertClaims(
    superseded.map((grant) => reversalOf(grant, actor, occurredAt, verdict.flags)),
  )
  return { ...empty, reversed, flags: verdict.flags }
}

function totalReductionOf(government: NonNullable<RecordGovDiscountRequest['government']>): number {
  return government.claimants.reduce((sum, claimant) => sum + claimant.reduction, 0)
}

export async function recordGovDiscount(
  store: LedgerStore,
  request: RecordGovDiscountRequest,
  actor: LedgerActor,
  now: Date,
): Promise<RecordOutcome> {
  const government = request.government
  const time = ledgerTimestamp(request.occurredAt, now)

  if (!government || government.claimants.length === 0) {
    return recordTakeBack(store, request, actor, time.occurredAt)
  }

  const menuItemIds = request.lines
    .map((line) => line.menuItemId)
    .filter((id): id is string => typeof id === 'string' && id !== '')

  const [active, highest, orderState, profile, excluded, savedLines, approval] = await Promise.all([
    store.listActiveGrants(request.tenantId, request.backend, request.externalOrderId),
    store.highestRevision(request.tenantId, request.backend, request.externalOrderId),
    store.loadOrderState(request),
    store.loadTaxProfile(request.tenantId),
    store.loadExcludedMenuItemIds(request.tenantId, menuItemIds),
    store.loadSavedLines(request),
    request.approvalId && actor.userId
      ? store.consumeApproval({
          approvalId: request.approvalId,
          tenantId: request.tenantId,
          cashierUserId: actor.userId,
          reduction: totalReductionOf(government),
          orderRef: orderRef(request),
          saleFingerprint: saleFingerprint(government.claimants, actor.userId),
        })
      : Promise.resolve(null),
  ])

  const verdict = verifyGrant({
    request,
    profile,
    excludedMenuItemIds: excluded,
    savedLines,
    isApproved: approval !== null,
    isSelfApproved: approval !== null && approval.approverUserId === actor.userId,
  })

  const reused = await store.idsUsedElsewhere({
    tenantId: request.tenantId,
    idNumbers: government.claimants.map((claimant) => normalizeIdNumber(claimant.idNumber)),
    externalOrderId: request.externalOrderId,
    sinceIso: manilaDayStart(now),
  })

  const isSupersededLate = highest !== null && highest > request.revision
  const isAfterCancel = orderState.readable && orderState.exists && orderState.cancelled
  const recordFlags: GovFlag[] = [
    ...time.flags,
    ...(!orderState.readable ? (['unverified_order'] as const) : []),
    ...(isSupersededLate ? (['superseded_late'] as const) : []),
    ...(isAfterCancel ? (['recorded_after_cancel'] as const) : []),
  ]

  const grants: ClaimRow[] = government.claimants.map((claimant) => {
    const claimantVerdict = verdict.claimants.find((entry) => entry.claimantRef === claimant.id)
    const idNumber = normalizeIdNumber(claimant.idNumber)
    const flags = sortFlags([
      ...verdict.orderFlags,
      ...recordFlags,
      ...(claimantVerdict?.flags ?? []),
      ...(reused.has(idNumber) ? ['id_reused_today'] : []),
    ])
    return {
      tenant_id: request.tenantId,
      outlet_id: request.outletId,
      backend: request.backend,
      external_order_id: request.externalOrderId,
      order_label: request.orderLabel,
      order_created_at: time.occurredAt,
      revision: request.revision,
      event: 'granted',
      claimant_ref: claimant.id,
      kind: claimant.kind,
      claimant_name: claimant.name,
      id_number: idNumber,
      allocation_mode: claimant.allocation.mode,
      diners: claimant.allocation.mode === 'shared' ? government.diners : null,
      vat_status: government.vatStatus,
      gross_share: claimant.grossShare,
      vat_exempt_sales: claimant.vatExemptSales,
      vat_removed: claimant.vatRemoved + claimant.serviceChargeVatRemoved,
      discount: claimant.discount,
      net_due: claimant.netDue,
      reduction: claimant.reduction,
      order_total: request.orderTotal,
      server_reduction: claimantVerdict?.serverReduction ?? null,
      verification: verdict.verification,
      flags,
      granted_by: actor.userId,
      granted_by_name: actor.name,
      approval_id: approval?.approvalId ?? null,
      approved_by: approval?.approverUserId ?? null,
      approved_by_name: approval?.approverName ?? null,
      source: request.source,
      occurred_at: time.occurredAt,
    }
  })

  // Older revisions this one replaces — and, when this one is itself already
  // out of date (a newer revision was recorded first, or the order is
  // cancelled), this one too, at once: written for the audit trail, never
  // counted.
  const superseded = active.filter((grant) => grant.revision < request.revision)
  const selfReversals: ActiveGrant[] =
    isSupersededLate || isAfterCancel
      ? grants.map((row) => ({ revision: row.revision, claimantRef: row.claimant_ref, row }))
      : []

  const reversed = await store.insertClaims(superseded.map((grant) => reversalOf(grant, actor, time.occurredAt)))
  const granted = await store.insertClaims(grants)
  const selfReversed = await store.insertClaims(
    selfReversals.map((grant) => reversalOf(grant, actor, time.occurredAt)),
  )
  return {
    granted,
    reversed: reversed + selfReversed,
    verification: verdict.verification,
    flags: sortFlags(grants.flatMap((row) => row.flags)),
  }
}
