/**
 * The rules of an AI suggestion's life: how many generations a store gets
 * free, and how a proposal moves from "suggested" to "live".
 *
 *   pending ──approve──▶ approved ──apply──▶ applied
 *      │                    │
 *      └──reject──▶ rejected ◀──reject──┘   (approve brings it back)
 *
 * Nothing goes live without an approval first, and `applied` is final: the
 * offer now lives in Boost Sales, where it is paused or edited like any other.
 */

export const FREE_BOOST_AI_GENERATIONS = 3

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'applied'
export type ProposalDecision = 'approve' | 'reject'

export const PROPOSAL_STATUSES: readonly ProposalStatus[] = ['pending', 'approved', 'rejected', 'applied']

const TRANSITIONS: Record<ProposalDecision, readonly ProposalStatus[]> = {
  approve: ['pending', 'rejected'],
  reject: ['pending', 'approved'],
}

const DECIDED_STATUS: Record<ProposalDecision, ProposalStatus> = {
  approve: 'approved',
  reject: 'rejected',
}

/** The status a decision leads to, or null when it is not allowed from here. */
export function decideProposal(current: ProposalStatus, decision: ProposalDecision): ProposalStatus | null {
  return TRANSITIONS[decision].includes(current) ? DECIDED_STATUS[decision] : null
}

export function canApplyProposal(status: ProposalStatus): boolean {
  return status === 'approved'
}

export function generationsLeft(used: number, limit: number = FREE_BOOST_AI_GENERATIONS): number {
  return Math.max(0, limit - Math.max(0, used))
}

export type OneTapCreatePlan =
  | { ok: true; approveFirst: boolean }
  | { ok: false; error: string }

/**
 * The merchant app's single "Create it" tap. The tap IS the approval — the
 * merchant has read the offer and chosen it — so a pending (or earlier
 * dismissed) idea is approved, then applied, in one step. The rule that
 * nothing goes live without an approval still holds.
 */
export function planOneTapCreate(status: ProposalStatus): OneTapCreatePlan {
  if (status === 'applied') return { ok: false, error: 'This offer is already live' }
  return { ok: true, approveFirst: status !== 'approved' }
}
