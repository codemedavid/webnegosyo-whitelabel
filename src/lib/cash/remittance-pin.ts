/**
 * "PIN here now" (CONTRACTS W2.3): the receiver types their manager PIN on the
 * cashier's device and the remittance is accepted on the spot.
 *
 * Who may ask: the remittance's own cashier (at the counter), or a member of
 * the store who reaches its branch. Who may receive: a `cash_manage` holder
 * who reaches the branch — not the cashier themselves unless they own the
 * store. The PIN is the same manager PIN as Senior/PWD approvals
 * (`verify_staff_approval_pin`: bcrypt, five tries, escalating lock), behind
 * the same rate limits (`staff-pin/pin-limits.ts`, applied by the route).
 *
 * Pure apart from the injected store, so every refusal is tested.
 */

import type { PinVerdict } from '@/lib/gov-discount-ledger/approval-service'
import { hasPermission } from '@/lib/staff-permissions'
import { REMITTANCE_NOTE_MAX, needsReceiverNote, type Remittance } from './remittances'

export interface PinCaller {
  userId: string
  role: string
  tenantId: string | null
  isOwner: boolean
  outletId: string | null
}

export interface PinReceiver {
  userId: string
  name: string
  role: string
  isOwner: boolean
  permissions: string[] | null
  outletId: string | null
}

export interface PinLockState {
  failedAttempts: number
  lockedUntil: string | null
}

export type AcceptAsResult = { ok: true; remittance: Remittance } | { ok: false; reason: 'not_pending' }

export interface RemittancePinStore {
  findRemittance(id: string): Promise<Remittance | null>
  findReceiver(tenantId: string, userId: string): Promise<PinReceiver | null>
  /** The shared manager-PIN rate limits (staff-pin/pin-limits.ts); false = slow down. */
  allowPinTry(tenantId: string, receiverUserId: string): Promise<boolean>
  verifyPin(userId: string, tenantId: string, pin: string): Promise<PinVerdict>
  pinState(userId: string, tenantId: string): Promise<PinLockState | null>
  acceptAs(input: { id: string; receiverUserId: string; receivedCents: number; note: string | null }): Promise<AcceptAsResult>
}

export interface AcceptByPinInput {
  remittanceId: string
  receiverUserId: string
  pin: string
  receivedCents: number
  note: string | null
}

export type AcceptByPinOutcome =
  | { ok: true; remittance: Remittance }
  | { ok: false; status: 400 | 403 | 404 | 409 | 412 | 422 | 423 | 429; body: Record<string, unknown> }

/** Five tries before the database locks the PIN (verify_staff_approval_pin). */
export const PIN_TRIES_BEFORE_LOCK = 5

export const PIN_COPY = {
  notFound: 'That remittance isn’t available.',
  notPending: 'This remittance was already answered.',
  receiverRefused: 'That person can’t receive cash here.',
  noPin: 'No PIN set — send to their phone instead.',
  wrongPin: 'That PIN is not right. Try again.',
  locked: 'Too many wrong tries — this PIN is locked for now. Send to their phone instead.',
  noteRequired: 'Say what happened. The cashier and the owner will see it.',
  tooMany: 'Too many tries. Wait a few minutes and try again.',
} as const

/** The caller may ask for this remittance: its cashier, or a member who reaches its branch. */
export function mayAskForPin(caller: PinCaller, remittance: Pick<Remittance, 'tenantId' | 'outletId' | 'cashierUserId'>): boolean {
  if (caller.role === 'superadmin') return true
  if (caller.role !== 'admin' || caller.tenantId !== remittance.tenantId) return false
  if (caller.userId === remittance.cashierUserId) return true
  return caller.isOwner || caller.outletId === null || caller.outletId === remittance.outletId
}

/** `cash_manage`, reaching the branch, and not the cashier unless they own the store. */
export function mayReceive(receiver: PinReceiver, remittance: Pick<Remittance, 'outletId' | 'cashierUserId'>): boolean {
  if (receiver.role !== 'admin') return false
  const holder = { role: receiver.role, is_owner: receiver.isOwner, permissions: receiver.permissions }
  if (!hasPermission(holder, 'cash_manage')) return false
  if (receiver.userId === remittance.cashierUserId && !receiver.isOwner) return false
  return receiver.isOwner || receiver.outletId === null || receiver.outletId === remittance.outletId
}

function refuse(status: Extract<AcceptByPinOutcome, { ok: false }>['status'], error: string, extra: Record<string, unknown> = {}): AcceptByPinOutcome {
  return { ok: false, status, body: { error, ...extra } }
}

function cleanNote(note: string | null): string | null {
  const trimmed = note?.trim() ?? ''
  return trimmed === '' ? null : trimmed.slice(0, REMITTANCE_NOTE_MAX)
}

export async function acceptRemittanceByPin(store: RemittancePinStore, caller: PinCaller, input: AcceptByPinInput): Promise<AcceptByPinOutcome> {
  const remittance = await store.findRemittance(input.remittanceId)
  // Not there and not yours read the same: nothing about another store leaks.
  if (!remittance || !mayAskForPin(caller, remittance)) return refuse(404, PIN_COPY.notFound)
  if (remittance.status !== 'pending') return refuse(409, PIN_COPY.notPending)

  const note = cleanNote(input.note)
  if (needsReceiverNote(remittance.handedOverCents, input.receivedCents) && note === null) return refuse(400, PIN_COPY.noteRequired)

  const receiver = await store.findReceiver(remittance.tenantId, input.receiverUserId)
  if (!receiver || !mayReceive(receiver, remittance)) return refuse(403, PIN_COPY.receiverRefused)

  if (!(await store.allowPinTry(remittance.tenantId, receiver.userId))) return refuse(429, PIN_COPY.tooMany)

  const verdict = await store.verifyPin(receiver.userId, remittance.tenantId, input.pin)
  if (verdict === 'no_pin') return refuse(412, PIN_COPY.noPin)
  if (verdict === 'locked') {
    const state = await store.pinState(receiver.userId, remittance.tenantId)
    return refuse(423, PIN_COPY.locked, { lockedUntil: state?.lockedUntil ?? null })
  }
  if (verdict === 'wrong') {
    const state = await store.pinState(receiver.userId, remittance.tenantId)
    const triesLeft = state ? Math.max(0, PIN_TRIES_BEFORE_LOCK - state.failedAttempts) : null
    return refuse(422, PIN_COPY.wrongPin, { triesLeft })
  }

  const accepted = await store.acceptAs({ id: remittance.id, receiverUserId: receiver.userId, receivedCents: input.receivedCents, note })
  if (!accepted.ok) return refuse(409, PIN_COPY.notPending)
  return { ok: true, remittance: accepted.remittance }
}
