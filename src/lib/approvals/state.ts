/**
 * The request state machine — pure. The database enforces the same table
 * (approval_transition_allowed + the approval_requests_guard trigger).
 *
 *   pending ──approve──▶ approved ──▶ executing ──▶ executed
 *      │                                   └──────▶ failed
 *      ├──decline──▶ declined
 *      ├──withdraw─▶ withdrawn   (requester only)
 *      └──timeout──▶ expired     (lazy on read/decide + sweep)
 *
 * A direct action is inserted as `approved` (is_direct) and executed in the
 * same transaction; an approval and its execution are one transaction too, so
 * `approved` / `executing` are never observed for long.
 */
import type { ApprovalStatus } from './types'

export const APPROVAL_TRANSITIONS: Readonly<Record<ApprovalStatus, readonly ApprovalStatus[]>> = {
  pending: ['approved', 'declined', 'withdrawn', 'expired'],
  approved: ['executing'],
  executing: ['executed', 'failed'],
  executed: [],
  failed: [],
  declined: [],
  expired: [],
  withdrawn: [],
}

export const OPEN_STATUSES: readonly ApprovalStatus[] = ['pending', 'approved', 'executing']
export const TERMINAL_STATUSES: readonly ApprovalStatus[] = ['executed', 'failed', 'declined', 'expired', 'withdrawn']

export function canTransition(from: ApprovalStatus, to: ApprovalStatus): boolean {
  return APPROVAL_TRANSITIONS[from].includes(to)
}

export function isOpenStatus(status: ApprovalStatus): boolean {
  return OPEN_STATUSES.includes(status)
}

export function isTerminalStatus(status: ApprovalStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

/** What a reader should show: a pending row past its deadline IS expired, even before the sweep writes it. */
export function effectiveStatus(status: ApprovalStatus, expiresAt: string, now: Date): ApprovalStatus {
  if (status === 'pending' && Date.parse(expiresAt) <= now.getTime()) return 'expired'
  return status
}
