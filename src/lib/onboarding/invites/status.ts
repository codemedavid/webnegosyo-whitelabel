/** Where a single-use sign-up link stands. Pure. */

export type InviteStatus = 'active' | 'used' | 'revoked' | 'expired'

export interface InviteStatusSource {
  claimedAt: string | null
  revokedAt: string | null
  expiresAt: string
}

export const INVITE_EXPIRY_DAYS = [7, 14, 30, 90] as const
export type InviteExpiryDays = (typeof INVITE_EXPIRY_DAYS)[number]
export const DEFAULT_INVITE_EXPIRY_DAYS: InviteExpiryDays = 30

const DAY_MS = 86_400_000

/** Used wins: a link someone redeemed stays "used" whatever happened after. */
export function inviteStatus(invite: InviteStatusSource, nowMs: number = Date.now()): InviteStatus {
  if (invite.claimedAt) return 'used'
  if (invite.revokedAt) return 'revoked'
  return Date.parse(invite.expiresAt) <= nowMs ? 'expired' : 'active'
}

export function inviteExpiryFrom(nowMs: number, days: InviteExpiryDays): string {
  return new Date(nowMs + days * DAY_MS).toISOString()
}
