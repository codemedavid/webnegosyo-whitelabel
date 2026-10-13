/**
 * approval_requests rows → what a viewer may see and do. Pure.
 */
import { approverCapCentavos, checkCanDecide, fromCentavos, reachesOutlet, toCentavos } from './rules'
import { effectiveStatus } from './state'
import {
  APPROVAL_KINDS,
  APPROVAL_STATUSES,
  type ApprovalActor,
  type ApprovalKind,
  type ApprovalRequestRecord,
  type ApprovalRequestView,
  type ApprovalRules,
  type ApprovalStatus,
} from './types'

type Row = Record<string, unknown>

const str = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null)
const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
const obj = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null

function asKind(value: unknown): ApprovalKind {
  return (APPROVAL_KINDS as readonly string[]).includes(value as string) ? (value as ApprovalKind) : 'refund'
}

function asStatus(value: unknown): ApprovalStatus {
  return (APPROVAL_STATUSES as readonly string[]).includes(value as string) ? (value as ApprovalStatus) : 'failed'
}

/** A raw row (to_jsonb of approval_requests, or a PostgREST row) in camelCase. */
export function toApprovalRecord(row: Row): ApprovalRequestRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    outletId: str(row.outlet_id),
    kind: asKind(row.kind),
    status: asStatus(row.status),
    isDirect: row.is_direct === true,
    externalOrderId: str(row.external_order_id),
    orderNumber: str(row.order_number),
    payload: obj(row.payload) ?? {},
    amount: num(row.amount) ?? 0,
    approvedAmount: num(row.approved_amount),
    reasonCode: String(row.reason_code ?? ''),
    note: str(row.note),
    orderSnapshot: obj(row.order_snapshot),
    requestedBy: String(row.requested_by),
    requestedByName: str(row.requested_by_name),
    requesterShiftId: str(row.requester_shift_id),
    decidedBy: str(row.decided_by),
    decidedByName: str(row.decided_by_name),
    decidedAt: str(row.decided_at),
    decisionReasonCode: str(row.decision_reason_code),
    decisionNote: str(row.decision_note),
    expiresAt: String(row.expires_at),
    executedAt: str(row.executed_at),
    result: obj(row.result),
    error: str(row.error),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at ?? row.created_at),
  }
}

function isApprover(viewer: ApprovalActor, rules: ApprovalRules): boolean {
  return approverCapCentavos(viewer, rules) !== -1
}

/** The requester always; approvers who reach the branch. Mirrors the SELECT policy. */
export function canViewRequest(viewer: ApprovalActor, record: ApprovalRequestRecord, rules: ApprovalRules): boolean {
  if (record.requestedBy === viewer.userId) return true
  return isApprover(viewer, rules) && reachesOutlet(viewer, record.outletId)
}

/**
 * Discount tokens are for the register that asked: only the requester (and
 * the owner) ever see one.
 */
function visibleResult(viewer: ApprovalActor, record: ApprovalRequestRecord): Record<string, unknown> | null {
  if (!record.result || !('discountToken' in record.result)) return record.result
  if (record.requestedBy === viewer.userId) return record.result
  return Object.fromEntries(Object.entries(record.result).filter(([key]) => key !== 'discountToken'))
}

export function toApprovalView(
  viewer: ApprovalActor,
  record: ApprovalRequestRecord,
  rules: ApprovalRules,
  now: Date,
): ApprovalRequestView {
  const status = effectiveStatus(record.status, record.expiresAt, now)
  const cap = approverCapCentavos(viewer, rules)
  const decide = checkCanDecide({
    approver: viewer,
    requestedBy: record.requestedBy,
    outletId: record.outletId,
    amountCentavos: toCentavos(record.amount),
    rules,
  })
  const decline = checkCanDecide({
    decision: 'decline',
    approver: viewer,
    requestedBy: record.requestedBy,
    outletId: record.outletId,
    amountCentavos: toCentavos(record.amount),
    rules,
  })
  const refundLabel = typeof record.result?.refundLabel === 'string' ? record.result.refundLabel : null
  return {
    ...record,
    status,
    result: visibleResult(viewer, record),
    refundLabel,
    canDecide: status === 'pending' && decide.ok,
    canDecline: status === 'pending' && decline.ok,
    canWithdraw: status === 'pending' && record.requestedBy === viewer.userId,
    isOverViewerLimit: status === 'pending' && !decide.ok && decide.code === 'over_limit',
    viewerCap: cap === -1 ? undefined : cap === null ? null : fromCentavos(cap),
  }
}

/** Oldest first (first asked, first answered) for the inbox; newest first otherwise. */
export function sortForInbox(views: readonly ApprovalRequestView[]): ApprovalRequestView[] {
  return [...views].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
}
