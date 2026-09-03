'use server'

import { findPresellViolationMessage, type PresellGuardLine } from '@/lib/presell/checkout-guard'

/**
 * The checkout's last look before it says "Order placed".
 *
 * The web checkout is optimistic — the confirmation screen shows before the
 * order row is written — so a server refusal there is invisible to the
 * customer. For a pre-order that is not acceptable: this runs the same guard
 * the order action runs, BEFORE the optimistic screen, so a date that sold
 * out since the cart was built is reported where it can still be fixed. It
 * reserves nothing; the atomic claim in createOrderAction remains the boundary.
 *
 * Unauthenticated for the same reason /api/presell/availability is: a diner
 * has no session, and what comes back is one sentence the storefront was
 * about to show anyway.
 */
export async function preflightPresellAction(
  tenantId: string,
  lines: PresellGuardLine[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const message = await findPresellViolationMessage(tenantId, lines)
    return message ? { ok: false, message } : { ok: true }
  } catch (error) {
    console.error('[presell] Preflight failed', tenantId, error)
    return { ok: false, message: 'We could not verify pre-order availability. Please try again in a moment.' }
  }
}
