/**
 * Manager approval for a large Senior/PWD discount.
 *
 * The cashier's register shows who may approve; the manager types their PIN
 * on the cashier's device. The server checks the PIN (bcrypt, five tries then
 * a lock that grows 15 min → 1 h → 24 h — see the PIN-hardening migration) and
 * issues a ONE-TIME approval for this reduction and these claimants, which the
 * sales book consumes when the sale is recorded. The branch is the CASHIER's
 * (the route resolves it from their account), never the body's word.
 *
 * Who may approve: the owner, a full-access account, or anyone holding
 * `discount_review` — and a branch-locked approver only at their own branch.
 */

import { hasPermission } from '@/lib/staff-permissions'
import { approvalFingerprint } from './approval-binding'
import { isWeakPin, type ApproveRequest } from './request-schemas'

export interface ApproverRecord {
  userId: string
  name: string
  role: string
  isOwner: boolean
  permissions: string[] | null
  outletId: string | null
}

export type PinVerdict = 'ok' | 'wrong' | 'locked' | 'no_pin'

export interface ApprovalStore {
  findAccount(tenantId: string, userId: string): Promise<ApproverRecord | null>
  listAccounts(tenantId: string): Promise<ApproverRecord[]>
  usersWithPins(tenantId: string): Promise<Set<string>>
  verifyPin(userId: string, tenantId: string, pin: string): Promise<PinVerdict>
  setPin(userId: string, tenantId: string, pin: string): Promise<void>
  createApproval(row: {
    tenantId: string
    outletId: string | null
    approverUserId: string
    approverName: string
    cashierUserId: string
    cashierName: string
    approvedReduction: number
    summary: Record<string, unknown>
    /** `approval-binding.ts`: the claimants + cashier this approval is for. */
    saleFingerprint: string
  }): Promise<{ id: string; expiresAt: string }>
}

export function canApprove(account: ApproverRecord, outletId: string | null): boolean {
  const mayReview = hasPermission(
    { role: account.role, is_owner: account.isOwner, permissions: account.permissions },
    'discount_review',
  )
  if (!mayReview) return false
  if (account.isOwner || account.outletId === null) return true
  return account.outletId === outletId
}

export type ApprovalOutcome =
  | { ok: true; approvalId: string; approverName: string; expiresAt: string }
  | { ok: false; status: 400 | 403 | 423; error: string }

const PIN_MESSAGES: Record<Exclude<PinVerdict, 'ok'>, { status: 400 | 423; error: string }> = {
  wrong: { status: 400, error: 'That PIN is not right. Try again.' },
  locked: { status: 423, error: 'Too many wrong tries — this PIN is locked for now. Try again later or ask the owner.' },
  no_pin: { status: 400, error: 'This manager has not set an approval PIN yet.' },
}

export async function approveGrant(
  store: ApprovalStore,
  request: ApproveRequest,
  cashier: { userId: string; name: string },
): Promise<ApprovalOutcome> {
  const approver = await store.findAccount(request.tenantId, request.approverUserId)
  if (!approver || !canApprove(approver, request.outletId)) {
    return { ok: false, status: 403, error: 'That person cannot approve discounts here.' }
  }

  const verdict = await store.verifyPin(approver.userId, request.tenantId, request.pin)
  if (verdict !== 'ok') return { ok: false, ...PIN_MESSAGES[verdict] }

  const approval = await store.createApproval({
    tenantId: request.tenantId,
    outletId: request.outletId,
    approverUserId: approver.userId,
    approverName: approver.name,
    cashierUserId: cashier.userId,
    cashierName: cashier.name,
    approvedReduction: request.reduction,
    summary: { claimants: request.claimants },
    saleFingerprint: approvalFingerprint(request.claimants, cashier.userId),
  })
  return { ok: true, approvalId: approval.id, approverName: approver.name, expiresAt: approval.expiresAt }
}

export type SetPinOutcome = { ok: true } | { ok: false; status: 400 | 403; error: string }

/**
 * A manager setting their OWN approval PIN. Only someone who may approve gets
 * one; obvious PINs (1234, 0000…) are refused because the PIN is typed on a
 * shared register in front of the cashier.
 */
export async function setOwnApprovalPin(
  store: ApprovalStore,
  tenantId: string,
  userId: string,
  pin: string,
): Promise<SetPinOutcome> {
  const account = await store.findAccount(tenantId, userId)
  const mayApprove =
    account !== null &&
    hasPermission(
      { role: account.role, is_owner: account.isOwner, permissions: account.permissions },
      'discount_review',
    )
  if (!mayApprove) {
    return { ok: false, status: 403, error: 'Only owners and managers who approve discounts set a PIN.' }
  }
  if (isWeakPin(pin)) {
    return { ok: false, status: 400, error: 'Pick a PIN that is harder to guess than that.' }
  }
  await store.setPin(userId, tenantId, pin)
  return { ok: true }
}

export interface ApproverChoice {
  userId: string
  name: string
  hasPin: boolean
}

/** Who the register offers in the "Manager approval" picker. */
export async function listApprovers(
  store: ApprovalStore,
  tenantId: string,
  outletId: string | null,
): Promise<ApproverChoice[]> {
  const [accounts, withPins] = await Promise.all([store.listAccounts(tenantId), store.usersWithPins(tenantId)])
  return accounts
    .filter((account) => canApprove(account, outletId))
    .map((account) => ({ userId: account.userId, name: account.name, hasPin: withPins.has(account.userId) }))
    .sort((a, b) => Number(b.hasPin) - Number(a.hasPin) || a.name.localeCompare(b.name))
}
