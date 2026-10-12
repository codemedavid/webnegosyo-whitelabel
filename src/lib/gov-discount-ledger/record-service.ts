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
 * The data access is injected (`LedgerStore`) so the whole flow is testable
 * without a database.
 */

import { normalizeIdNumber, sortFlags, type GovFlag, type RecordGovDiscountRequest, type TaxProfile } from '@/lib/gov-discount'
import { verifyGrant, type SavedOrderLine } from './verify'

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export interface LedgerActor {
  userId: string
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

export interface LedgerStore {
  loadTaxProfile(tenantId: string): Promise<TaxProfile | null>
  loadExcludedMenuItemIds(tenantId: string, menuItemIds: readonly string[]): Promise<Set<string>>
  /** Null when the backend is not one the server reads, or the order is not found. */
  loadSavedLines(request: RecordGovDiscountRequest): Promise<SavedOrderLine[] | null>
  consumeApproval(args: {
    approvalId: string
    tenantId: string
    cashierUserId: string
    reduction: number
    orderRef: string
  }): Promise<ConsumedApproval | null>
  /** ID numbers (normalised) already granted on a DIFFERENT order since `sinceIso`. */
  idsUsedElsewhere(args: {
    tenantId: string
    idNumbers: readonly string[]
    externalOrderId: string
    sinceIso: string
  }): Promise<Set<string>>
  listActiveGrants(tenantId: string, backend: string, externalOrderId: string): Promise<ActiveGrant[]>
  /** Inserts, skipping rows the ledger already holds. Returns how many were new. */
  insertClaims(rows: readonly ClaimRow[]): Promise<number>
}

export interface RecordOutcome {
  granted: number
  reversed: number
  verification: 'verified' | 'mismatch' | 'payload_only' | 'none'
  flags: GovFlag[]
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
 */
function reversalOf(grant: ActiveGrant, actor: LedgerActor, occurredAt: string): ClaimRow {
  return {
    ...grant.row,
    event: 'reversed',
    flags: [],
    reversed_by: actor.userId,
    reversed_by_name: actor.name,
    occurred_at: occurredAt,
  }
}

export async function recordGovDiscount(
  store: LedgerStore,
  request: RecordGovDiscountRequest,
  actor: LedgerActor,
  now: Date,
): Promise<RecordOutcome> {
  const government = request.government
  const active = await store.listActiveGrants(request.tenantId, request.backend, request.externalOrderId)
  const superseded = active.filter((grant) => grant.revision < request.revision || !government)
  const reversals = superseded.map((grant) => reversalOf(grant, actor, request.occurredAt))

  if (!government || government.claimants.length === 0) {
    const reversed = await store.insertClaims(reversals)
    return { granted: 0, reversed, verification: 'none', flags: [] }
  }

  const menuItemIds = request.lines
    .map((line) => line.menuItemId)
    .filter((id): id is string => typeof id === 'string' && id !== '')
  const totalReduction = government.claimants.reduce((sum, claimant) => sum + claimant.reduction, 0)

  const [profile, excluded, savedLines, approval] = await Promise.all([
    store.loadTaxProfile(request.tenantId),
    store.loadExcludedMenuItemIds(request.tenantId, menuItemIds),
    store.loadSavedLines(request),
    request.approvalId
      ? store.consumeApproval({
          approvalId: request.approvalId,
          tenantId: request.tenantId,
          cashierUserId: actor.userId,
          reduction: totalReduction,
          orderRef: orderRef(request),
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

  const grants: ClaimRow[] = government.claimants.map((claimant) => {
    const claimantVerdict = verdict.claimants.find((entry) => entry.claimantRef === claimant.id)
    const idNumber = normalizeIdNumber(claimant.idNumber)
    const flags = sortFlags([
      ...verdict.orderFlags,
      ...(claimantVerdict?.flags ?? []),
      ...(reused.has(idNumber) ? ['id_reused_today'] : []),
    ])
    return {
      tenant_id: request.tenantId,
      outlet_id: request.outletId,
      backend: request.backend,
      external_order_id: request.externalOrderId,
      order_label: request.orderLabel,
      order_created_at: request.occurredAt,
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
      occurred_at: request.occurredAt,
    }
  })

  const reversed = await store.insertClaims(reversals)
  const granted = await store.insertClaims(grants)
  return {
    granted,
    reversed,
    verification: verdict.verification,
    flags: sortFlags(grants.flatMap((row) => row.flags)),
  }
}
