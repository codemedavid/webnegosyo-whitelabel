/**
 * The enforcement layer, server-side.
 *
 * `resolveSubscriptionAccess` decides; this decides what to DO about it. Kept
 * separate so the verdict stays pure and testable while the throwing lives
 * where callers expect a guard.
 *
 * Two layers use it, and the distinction is the point:
 *  - the admin layout redirects a paused merchant, which is UX;
 *  - the server actions call `assertSubscriptionActive`, which is the actual
 *    boundary. A `redirect()` in a layout is a rendering decision — it does not
 *    stop a POST aimed straight at an action, so a gate that lived only there
 *    would be a sign on an unlocked door.
 */

import {
  resolveSubscriptionAccess,
  type SubscriptionRecord,
} from '@/lib/billing/subscription-status'

/**
 * Shown to the merchant verbatim. Names the cause and the way out, because the
 * person reading it is standing in a restaurant and cannot fix it themselves.
 */
export const SUBSCRIPTION_PAUSED_MESSAGE =
  'Your subscription is unpaid, so admin changes are paused. Your store is still ' +
  'open and taking orders. Contact support to restore access.'

/** The subset of a caller this module needs. */
export interface GateCaller {
  role: string
}

/**
 * Raised when a paused merchant attempts a write. Distinct class so an action
 * can tell "you have not paid" apart from "that input was invalid".
 */
export class SubscriptionPausedError extends Error {
  constructor() {
    super(SUBSCRIPTION_PAUSED_MESSAGE)
    this.name = 'SubscriptionPausedError'
  }
}

/**
 * Refuses a write from a lapsed tenant.
 *
 * A superadmin is always let through: they are the only account that can clear
 * an unpaid subscription, and a gate that locks out its own remedy cannot be
 * fixed from inside the product.
 */
export function assertSubscriptionActive(
  subscription: SubscriptionRecord | null | undefined,
  caller: GateCaller,
  nowIso: string = new Date().toISOString()
): void {
  if (caller.role === 'superadmin') return

  const access = resolveSubscriptionAccess(subscription, nowIso)
  if (!access.isBlocked) return

  throw new SubscriptionPausedError()
}
