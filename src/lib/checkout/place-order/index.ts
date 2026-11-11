import 'server-only'

/**
 * The order engine. The ONLY place an online order is repriced, checked
 * against stock, hours, branch, minimum and presell, charged its delivery fee,
 * service charge, vouchers and Senior/PWD, and routed to the store's backend.
 * The web checkout (`createOrderAction`) and the customer app both call it.
 */

import { resolveOrderBackend } from '@/lib/order-backend'
import { holdSimpleOptionStock } from '@/lib/checkout/simple-option-hold'
import { admitOrder } from './admit-order'
import { createPresellClaimHolder, type PresellClaimHolder } from './presell-claim'
import { priceCharges, resolveTrustedDeliveryFee } from './pricing'
import { writeOrder } from './write-order'
import { buildPlacedOrder } from './placed-result'
import { lost, refused, type PlaceOrderInput, type PlaceOrderResult } from './types'

export type {
  OrderChannel,
  PlaceOrderInput,
  PlaceOrderLineInput,
  PlaceOrderResult,
  PlacedOrder,
  PlacedOrderLine,
  PlacedOrderPricing,
  RefusedOrder,
  LostOrder,
} from './types'

export const LOST_ORDER_MESSAGE = 'We could not save your order. Please try again or contact the store.'

/**
 * Placed with the Messenger chat's link: what they added in Messenger is now
 * this order. Never throws: the order is already saved, and a failure here
 * must not read as a failed order.
 */
async function finishChatCart(chatSessionId: string | null): Promise<void> {
  if (!chatSessionId) return
  try {
    const { emptyChatCart } = await import('@/lib/messenger/chat-cart-store')
    await emptyChatCart(chatSessionId)
  } catch (error) {
    console.error('[Messenger] chat cart not emptied after order', error instanceof Error ? error.message : error)
  }
}

async function runPlaceOrder(input: PlaceOrderInput, presell: PresellClaimHolder): Promise<PlaceOrderResult> {
  const admission = await admitOrder(input)
  if (!admission.ok) return admission.failure
  const admitted = admission.order

  const claim = await presell.claim(admitted.db, input.tenantId, admitted.lines, admitted.customerData)
  if (!claim.ok) return refused(claim.error)
  const order = { ...admitted, customerData: claim.customerData }

  // Any refusal from here on hands the reserved pre-order stock back first.

  // ── Simple-option counters ──
  // Platform: CLAIMED under the id the order is then inserted with, so the
  // post-order depletion finds the claim taken and a cancel finds its
  // movements — as the very last step before the insert (write-order.ts), so
  // a function killed mid-checkout (road distance, vouchers…) never leaves
  // counters reduced for an order that was never written (MEDIUM-4). Other
  // backends: the unlocked courtesy read, here, before anything else.
  // Lines carry the ids their text was charged for (see priceOrderLines).
  const platformOrderId = resolveOrderBackend(order.tenantConfig) === 'platform' ? crypto.randomUUID() : null
  if (order.tenantConfig.inventory_enabled === true && !platformOrderId) {
    const check = await holdSimpleOptionStock({
      db: order.db,
      tenantId: input.tenantId,
      orderId: null,
      items: order.lines,
      outletId: order.resolvedOutlet?.id ?? null,
    })
    if (!check.ok) {
      await presell.release()
      return refused(check.error)
    }
  }

  const fee = await resolveTrustedDeliveryFee(order)
  if (!fee.ok) {
    await presell.release()
    return fee.failure
  }

  const charges = await priceCharges(order, fee.fee)
  const written = await writeOrder({ order, charges, effectiveDeliveryFee: fee.fee, presell, platformOrderId })
  if (written.kind === 'refused') return written
  await finishChatCart(order.chatSessionId)
  return buildPlacedOrder(order, charges, fee.fee, written)
}

/**
 * A throw here means the web customer has already been shown "Order Placed!"
 * and had their cart cleared for an order that does not exist. The message
 * is the only record of why, so log it with enough context to find the
 * tenant and the attempt — a bare `error` object stringifies to
 * "[object Object]" in the platform log and tells an operator nothing.
 *
 * Postgres errors additionally carry a `code`; RLS refusals arrive as
 * 42501, which is what silently destroyed a live tenant's web orders.
 */
function logLostOrder(input: PlaceOrderInput, error: unknown): void {
  const detail = error as { message?: string; code?: string; details?: string } | null
  console.error('[createOrderAction] ORDER LOST — creation threw', {
    tenantId: input.tenantId,
    orderTypeId: input.orderTypeId ?? null,
    clientOrderId: typeof input.clientOrderId === 'string' ? input.clientOrderId : null,
    itemCount: Array.isArray(input.items) ? input.items.length : 0,
    code: detail?.code ?? null,
    message: detail?.message ?? String(error),
    details: detail?.details ?? null,
  })
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  // Created OUTSIDE the try so the catch below can reach it. Presell stock is
  // claimed mid-flight; see presell-claim.ts.
  const presell = createPresellClaimHolder()
  try {
    return await runPlaceOrder(input, presell)
  } catch (error) {
    // Presell stock reserved for an order that never got written is stock that
    // silently evaporates: nobody holds it, and no cancel can ever give it
    // back. Handed over first, and only when no order row claimed it — after a
    // successful write the allocation belongs to that order.
    //
    // `release` swallows nothing but never throws either, so the real
    // exception below stays the one the customer and the log hear about.
    if (!presell.isPersisted()) await presell.release()
    logLostOrder(input, error)
    return lost(LOST_ORDER_MESSAGE)
  }
}
