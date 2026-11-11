/**
 * Simple-option counters ("Pearls: 5 left") held for an order BEFORE it is
 * written — the presell claim's twin.
 *
 * `apply_simple_option_order_stock` locks the dishes, checks every counter the
 * order spends and decrements them in one transaction, under a claim keyed by
 * the ORDER ID. Running it after the insert (as the depletion follow-up does)
 * meant a refusal arrived once the order already stood, and was swallowed. So
 * on the platform backend, whose order id the server can choose, the checkout
 * claims under the id it is about to insert with:
 *
 *  - not enough → refused before any order row exists;
 *  - claimed → the follow-up's own `sale` call finds the claim taken and is a
 *    no-op, so nothing is spent twice, and a later cancel of the order finds
 *    the movements under its id;
 *  - any other failure → the transaction rolled back and holds nothing, so the
 *    follow-up tries again under the same id, which is today's behaviour.
 *
 * Release = the RPC's `cancel` under the same id, which returns exactly what
 * the claim took. Convex orders get their ids from their own backend, so
 * they keep the unlocked courtesy read.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { depletionItemFromCheckoutLine, type CheckoutOrderLine } from '@/lib/inventory/order-depletion'
import { resolveMovementOutletId } from '@/lib/inventory/stock-location'

type AdminClient = ReturnType<typeof createAdminClient>

export type SimpleOptionHold =
  | { ok: true; release: () => Promise<void> }
  | { ok: false; error: string }

export interface SimpleOptionHoldInput {
  db: AdminClient
  tenantId: string
  /** The id the order WILL be written with; null when its backend picks it. */
  orderId: string | null
  items: readonly CheckoutOrderLine[]
  /** The validated branch taking the order. */
  outletId: string | null
}

/** The RPC's refusal: `Insufficient stock for <option name>`. */
const RPC_SHORTAGE = /^Insufficient stock for (.+)$/
/** The courtesy read's refusal: `Not enough stock for <names>`. */
const READ_SHORTAGE = /^Not enough stock for (.+)$/

const NOTHING_HELD: SimpleOptionHold = { ok: true, release: async () => {} }

function soldOutMessage(names: string): string {
  return `Sorry — ${names} just sold out. Please remove it from your order and try again.`
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  const message = (error as { message?: unknown } | null)?.message
  return typeof message === 'string' ? message : String(error)
}

function hasSelections(items: readonly CheckoutOrderLine[]): boolean {
  return items.some((item) => item.option_ids?.length || item.addon_ids?.length)
}

/** Convex: the unlocked read, as before. A failed read never refuses. */
async function checkWithoutClaim(tenantId: string, items: readonly CheckoutOrderLine[]): Promise<SimpleOptionHold> {
  const { assertSimpleOptionStockAvailable } = await import('@/lib/inventory/simple-option-stock-service')
  try {
    await assertSimpleOptionStockAvailable(tenantId, items.map(depletionItemFromCheckoutLine))
    return NOTHING_HELD
  } catch (error) {
    const shortage = READ_SHORTAGE.exec(errorMessage(error))
    if (shortage) return { ok: false, error: soldOutMessage(shortage[1]) }
    console.error('[createOrderAction] Add-on stock check failed — order continues', { tenantId, message: errorMessage(error) })
    return NOTHING_HELD
  }
}

export async function holdSimpleOptionStock(input: SimpleOptionHoldInput): Promise<SimpleOptionHold> {
  const { db, tenantId, orderId, items, outletId } = input
  if (!hasSelections(items)) return NOTHING_HELD
  if (!orderId) return checkWithoutClaim(tenantId, items)

  const { applySimpleOptionStock } = await import('@/lib/inventory/simple-option-stock-service')
  try {
    await applySimpleOptionStock(
      db, tenantId, orderId, 'sale', 0, items.map(depletionItemFromCheckoutLine), resolveMovementOutletId(outletId),
    )
  } catch (error) {
    const shortage = RPC_SHORTAGE.exec(errorMessage(error))
    if (shortage) return { ok: false, error: soldOutMessage(shortage[1]) }
    // Rolled back: nothing is held, and the post-order depletion retries it.
    console.error('[createOrderAction] Add-on stock claim failed — order continues', { tenantId, orderId, message: errorMessage(error) })
    return NOTHING_HELD
  }

  let isReleased = false
  return {
    ok: true,
    release: async () => {
      if (isReleased) return
      try {
        await applySimpleOptionStock(db, tenantId, orderId, 'cancel')
        isReleased = true
      } catch (error) {
        // A leak worth shouting about, but never the answer the diner hears.
        console.error('[createOrderAction] Add-on stock release failed — counters stay reduced', {
          tenantId, orderId, message: errorMessage(error),
        })
      }
    },
  }
}
