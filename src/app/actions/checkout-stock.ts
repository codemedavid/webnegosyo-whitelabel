'use server'

import { findCheckoutStockShortfallMessage } from '@/lib/inventory/checkout-stock-guard'
import type { CartStockLine } from '@/lib/inventory/producible'
import { checkActionRateLimit } from '@/lib/action-rate-limit'
import { parseStockPreflightInput } from '@/lib/checkout/stock-preflight-input'

type PreflightVerdict = { ok: true } | { ok: false; message: string }

const NO_OPINION: PreflightVerdict = { ok: true }

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
 * show anyway. Open is not unbounded, though: every call reads the store's
 * stock graph on the shared database, so input the checkout never sends is
 * turned away unread and each client gets a per-store allowance (the same one
 * `/api/inventory/ceilings` gives). Both answer "no opinion", never a throw.
 */
export async function preflightCheckoutStockAction(
  tenantId: string,
  lines: readonly CartStockLine[],
  outletId: string | null = null,
): Promise<PreflightVerdict> {
  try {
    const input = parseStockPreflightInput(tenantId, lines, outletId)
    if (!input) return NO_OPINION

    const rate = await checkActionRateLimit(`stock-preflight:${input.tenantId}`, {
      limit: 120,
      windowSec: 60,
      onRedisFailure: 'instance',
    })
    if (!rate.allowed) return NO_OPINION

    const message = await findCheckoutStockShortfallMessage(input.tenantId, input.lines, input.outletId)
    return message ? { ok: false, message } : NO_OPINION
  } catch (error) {
    console.error('[inventory] Checkout stock preflight failed', tenantId, error)
    return NO_OPINION
  }
}
