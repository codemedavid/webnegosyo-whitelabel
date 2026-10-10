/**
 * What `/onboarding/join/<code>` shows. A used link is dead for everyone but
 * the browser that used it: that browser holds its set-up token in an
 * httpOnly cookie scoped to the link's path, and goes back to its wizard if it
 * lost the tab. Pure.
 */

import { inviteStatus, type InviteStatusSource } from './status'

export const JOIN_RESUME_COOKIE = 'wn_join'
/** Longer than the longest link expiry: a set-up can be finished days later. */
export const JOIN_RESUME_MAX_AGE_SEC = 120 * 86_400

export function joinCookiePath(code: string): string {
  return `/onboarding/join/${code}`
}

export type JoinPageState =
  | { kind: 'form' }
  | { kind: 'resume'; token: string }
  | { kind: 'used' }
  | { kind: 'revoked' }
  | { kind: 'expired' }

export interface JoinInviteSource extends InviteStatusSource {
  checkoutLeadId: string | null
}

/** The cookie's token, already resolved to the lead its wizard belongs to. */
export interface ResumeCandidate {
  token: string
  checkoutLeadId: string
}

export function joinPageState(invite: JoinInviteSource, resume: ResumeCandidate | null, nowMs: number = Date.now()): JoinPageState {
  const status = inviteStatus(invite, nowMs)
  if (status === 'active') return { kind: 'form' }
  if (status !== 'used') return { kind: status }
  const isOwnWizard = resume !== null && invite.checkoutLeadId !== null && resume.checkoutLeadId === invite.checkoutLeadId
  return isOwnWizard ? { kind: 'resume', token: resume.token } : { kind: 'used' }
}
