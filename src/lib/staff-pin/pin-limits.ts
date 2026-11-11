/**
 * The rate limits in front of every manager-PIN check (Senior/PWD approval,
 * remittance "PIN here now"). One source, so a new PIN route cannot ship with
 * a looser limit than the first one.
 *
 * Shared across instances (Upstash). A PIN guess is a disclosure risk, so a
 * Redis outage falls back to the per-instance limiter, never to no limit.
 * - Per caller: a burst at one register.
 * - Per approver: every register in the store guessing one manager's PIN
 *   together. The key is the SAME for every PIN route — it is one PIN, so it
 *   gets one budget, whichever screen the guesses come from.
 * Behind these, the database locks the PIN after five wrong tries (15 min →
 * 1 h → 24 h, `verify_staff_approval_pin`).
 */

import { checkRateLimit, type RateLimitOptions } from '@/lib/distributed-rate-limit'

export const PIN_TRIES_PER_CALLER: RateLimitOptions = { limit: 20, windowSec: 60, onRedisFailure: 'instance' }
export const PIN_TRIES_PER_APPROVER: RateLimitOptions = { limit: 10, windowSec: 15 * 60, onRedisFailure: 'instance' }
export const PIN_TOO_MANY_TRIES = 'Too many tries. Wait a few minutes and try again.'

/** Kept as the Senior/PWD route first named it, so existing windows carry over. */
export function approverPinLimitKey(tenantId: string, approverUserId: string): string {
  return `gov-approve:approver:${tenantId}:${approverUserId}`
}

/**
 * Both limits at once. `callerKey` names the route's own per-caller bucket
 * (e.g. `gov-approve:cashier:<tenant>:<user>`).
 */
export async function checkPinTryLimits(callerKey: string, tenantId: string, approverUserId: string): Promise<boolean> {
  const [byCaller, byApprover] = await Promise.all([
    checkRateLimit(callerKey, PIN_TRIES_PER_CALLER),
    checkRateLimit(approverPinLimitKey(tenantId, approverUserId), PIN_TRIES_PER_APPROVER),
  ])
  return byCaller.allowed && byApprover.allowed
}
