import type { AppLoyalty } from '@/lib/contract'

/** How often an open claim sheet re-reads the card to see whether the counter scanned it. */
export const CLAIM_POLL_MS = 5_000
/** How long "Scanned" stays up before the sheet closes. */
export const SCANNED_CLOSE_MS = 1_500

/** What the store issues today (~2 minutes); used when the phone's clock can't be trusted. */
export const DEFAULT_CLAIM_LIFETIME_MS = 2 * 60 * 1000
/** A remaining life outside (MIN, MAX] means the phone's clock is off, not the code. */
const MIN_PLAUSIBLE_MS = 5_000
const MAX_PLAUSIBLE_MS = 10 * 60 * 1000

/**
 * When this code stops working, on the PHONE's clock. The server's `expiresAt`
 * is on its own clock: a phone a few minutes fast would see a fresh code as
 * already expired (and loop on "Get a new code"), so an implausible remaining
 * life falls back to the store's usual two minutes from when it arrived.
 */
export function claimDeadline(expiresAt: string, receivedAtMs: number): number {
  const remaining = new Date(expiresAt).getTime() - receivedAtMs
  const isPlausible = Number.isFinite(remaining) && remaining > MIN_PLAUSIBLE_MS && remaining <= MAX_PLAUSIBLE_MS
  return receivedAtMs + (isPlausible ? remaining : DEFAULT_CLAIM_LIFETIME_MS)
}

export interface ClaimCountdown {
  secondsLeft: number
  /** "1:59", "0:05". */
  label: string
  isExpired: boolean
}

export function claimCountdown(deadlineMs: number, nowMs: number): ClaimCountdown {
  const secondsLeft = Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000))
  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60
  return { secondsLeft, label: `${minutes}:${String(seconds).padStart(2, '0')}`, isExpired: secondsLeft === 0 }
}

/**
 * The counter took the reward: a card read AFTER the code was issued no longer
 * lists it. An older read (still cached from before) proves nothing either way.
 * A reward that reached its own expiry also leaves the list; that is not a
 * scan (the code dies with it, so the sheet shows "expired" instead).
 */
export function isRewardRedeemed(
  rewardId: string,
  loyalty: Pick<AppLoyalty, 'rewards'> | undefined,
  readAtMs: number,
  issuedAtMs: number,
  rewardExpiresAt: string | null = null,
): boolean {
  if (!loyalty || readAtMs < issuedAtMs) return false
  const expiresAtMs = rewardExpiresAt === null ? Number.NaN : Date.parse(rewardExpiresAt)
  if (Number.isFinite(expiresAtMs) && readAtMs >= expiresAtMs) return false
  return !loyalty.rewards.some((reward) => reward.id === rewardId)
}

export type ClaimPhase = 'claiming' | 'failed' | 'showing' | 'expired' | 'scanned'

interface ClaimPhaseInput {
  isScanned: boolean
  isClaiming: boolean
  hasError: boolean
  /** Null until a code has arrived. */
  deadlineMs: number | null
  nowMs: number
}

/** What the sheet shows. A scan wins over everything; a new code being minted hides the old one. */
export function claimPhase({ isScanned, isClaiming, hasError, deadlineMs, nowMs }: ClaimPhaseInput): ClaimPhase {
  if (isScanned) return 'scanned'
  if (isClaiming) return 'claiming'
  if (hasError) return 'failed'
  if (deadlineMs === null) return 'claiming'
  return claimCountdown(deadlineMs, nowMs).isExpired ? 'expired' : 'showing'
}
