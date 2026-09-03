'use server'

import { findCheckoutStockShortfallMessage } from '@/lib/inventory/checkout-stock-guard'
import type { CartStockLine } from '@/lib/inventory/producible'

/**
 * The checkout's inventory look before it says "Order placed".
 *
 * The web checkout is optimistic — the confirmation screen shows before the
 * order row is written — so a refusal from `createOrderAction` lands in a
 * console warning and nowhere else: the customer is told the order was placed
 * and the merchant never receives it. `preflightPresellAction` already hoists
 * the pre-order guard ahead of that screen; this is the same move for the
 * producible-quantity guard, which is the one that refuses a cart of fifty
 * burgers made from flour for two.
 *
 * It reserves nothing and decides nothing new: the guard inside
 * `createOrderAction` remains authoritative. Inventory's default is silence,
 * so every failure here lets the order through.
 *
 * Unauthenticated for the same reason the presell preflight is: a diner has no
 * session, and what comes back is one sentence the storefront was about to
 * show anyway.
 */
export async function preflightCheckoutStockAction(
  tenantId: string,
  lines: readonly CartStockLine[],
  outletId: string | null = null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const message = await findCheckoutStockShortfallMessage(tenantId, lines, outletId)
    return message ? { ok: false, message } : { ok: true }
  } catch (error) {
    console.error('[inventory] Checkout stock preflight failed', tenantId, error)
    return { ok: true }
  }
}
