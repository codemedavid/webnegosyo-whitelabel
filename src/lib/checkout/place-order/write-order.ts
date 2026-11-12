/**
 * Writing the order to the store's own backend, then everything owed once a
 * row exists: the Senior/PWD sales book, voucher burns, stock, the merchant
 * email and the Loyverse push.
 */

import { createOrder, createOrderConvex } from '@/lib/orders-service'
import { resolveOrderBackend, assertOrderBackendReady, type OrderBackend } from '@/lib/order-backend'
import { burnRedemptions } from '@/lib/vouchers/order-voucher-flow'
import { runOrderFollowUps } from '@/lib/checkout/order-follow-ups'
import { holdSimpleOptionStock } from '@/lib/checkout/simple-option-hold'
import type { AdmittedOrder } from './context'
import type { PricedCharges } from './pricing'
import type { PresellClaimHolder } from './presell-claim'
import { ORDER_SOURCE_BY_CHANNEL, refused, type PlacedOrderRow, type PlacedOrderToken, type RefusedOrder } from './types'

export interface WrittenOrder {
  kind: 'written'
  order: PlacedOrderRow
  orderToken: PlacedOrderToken
  deduped: boolean
  backend: OrderBackend
}

interface WriteOrderInput {
  order: AdmittedOrder
  charges: PricedCharges
  effectiveDeliveryFee: number | undefined
  presell: PresellClaimHolder
  /** Platform only: the id the order is inserted with (simple-option counters are claimed under it). */
  platformOrderId: string | null
}

/** The STORED payment method the order records, as the backends' four positional fields. */
function paymentFields(order: AdmittedOrder) {
  const method = order.paymentMethod
  return {
    paymentMethodId: method?.id,
    paymentMethodName: method?.name,
    paymentMethodDetails: method?.details ?? undefined,
    paymentMethodQrCodeUrl: method?.qrCodeUrl ?? undefined,
  }
}

function createAfterWrite({ order, charges, effectiveDeliveryFee }: WriteOrderInput) {
  const { input, db: supabaseAdmin, tenantConfig, lines: items, resolvedOutlet } = order
  const { tenantId } = input
  const { pricing, checkoutGovernment, customerKey, serviceCharge } = charges

  /** Burns the uses once an order row exists. Never before. */
  const burnFor = async (orderId: string) => {
    // The Senior/PWD sales book, written as the order is (any backend).
    await checkoutGovernment.recordFor(orderId, resolveOrderBackend(tenantConfig))
    const outcome = await burnRedemptions(supabaseAdmin, {
      tenantId,
      orderId,
      channel: 'checkout',
      redemptions: pricing.redemptions,
      customerKey,
      outletId: resolvedOutlet?.id ?? null,
    })

    if (outcome.failures.length > 0) {
      // Not fatal: the order is saved and paid for. Losing a coupon count is
      // the cheaper failure, but it must be visible.
      console.error(
        `[createOrderAction] Order ${orderId} saved but ${outcome.failures.length} voucher redemption(s) failed:`,
        outcome.failures
      )
    }
  }

  /**
   * Everything owed once an order row exists: stock is spent on the request;
   * the merchant email and Loyverse push follow the response. Burning
   * vouchers stays with the caller, inline.
   */
  const followUp = (
    orderId: string,
    platformOrderId: string | null,
  ) => runOrderFollowUps({
    tenantConfig,
    tenantId,
    orderId,
    platformOrderId,
    items,
    outletId: resolvedOutlet?.id ?? null,
    loyverse: order.loyverseTenant,
    notice: {
      orderTypeName: order.orderTypeRow?.name ?? null,
      deliveryFee: effectiveDeliveryFee,
      serviceCharge,
      orderTotal: pricing.totals.grandTotal,
      paymentMethodName: order.paymentMethod?.name,
      customerData: charges.customerData,
    },
  })

  return { burnFor, followUp }
}

/**
 * Route on the same resolver the admin queue reads with, so a write can
 * never land in a backend the merchant's order page isn't looking at.
 * `assertOrderBackendReady` turns a half-configured Convex tenant into a
 * loud failure rather than a silent write into the shared platform DB.
 */
async function writeConvexOrder(write: WriteOrderInput): Promise<WrittenOrder> {
  const { order, charges, effectiveDeliveryFee, presell } = write
  const { input, tenantConfig, lines: items } = order
  const { pricing, serviceCharge } = charges
  const { burnFor, followUp } = createAfterWrite(write)
  assertOrderBackendReady(tenantConfig)

  // Convex has no payment-proof columns, so proof rides in customerData (same
  // pattern as advance-order schedule) to stay cross-tenant compatible.
  const safePaymentProof = order.paymentProof
  const hasProof = Boolean(safePaymentProof?.url || safePaymentProof?.reference)
  const convexCustomerData = hasProof
    ? {
        ...(charges.customerData || {}),
        payment_proof_url: safePaymentProof?.url || undefined,
        payment_proof_public_id: safePaymentProof?.publicId || undefined,
        payment_proof_reference: safePaymentProof?.reference || undefined,
      }
    : charges.customerData

  // Route to Convex (prices already validated above)
  const payment = paymentFields(order)
  const result = await createOrderConvex(
    tenantConfig.convex_deployment_url,
    tenantConfig.convex_deploy_key,
    input.tenantId,
    items,
    input.customerInfo,
    input.orderTypeId,
    convexCustomerData,
    effectiveDeliveryFee,
    input.lalamoveQuotationId,
    payment.paymentMethodId,
    payment.paymentMethodName,
    payment.paymentMethodDetails,
    payment.paymentMethodQrCodeUrl,
    serviceCharge,
    order.validatedScheduledISO,
    pricing.application.discountLines,
    ORDER_SOURCE_BY_CHANNEL[input.channel ?? 'web']
  )
  // The order row exists and carries the claim; the stock is spent for real.
  presell.markPersisted()
  await burnFor(result.order.id)
  await followUp(result.order.id, null)
  return { kind: 'written', order: result.order, orderToken: result.orderToken, deduped: false, backend: 'convex' }
}

/** The shared platform database — most stores. */
async function writePlatformOrder(write: WriteOrderInput): Promise<WrittenOrder | RefusedOrder> {
  const { order, charges, effectiveDeliveryFee, presell, platformOrderId } = write
  const { input, lines: items, resolvedOutlet } = order
  const { clientOrderId } = input
  const { pricing, serviceCharge } = charges
  const { burnFor, followUp } = createAfterWrite(write)

  // The option claim (see "Simple-option counters" in index.ts), right before
  // the insert: nothing that can stall sits between the two.
  if (order.tenantConfig.inventory_enabled === true && platformOrderId) {
    const hold = await holdSimpleOptionStock({
      db: order.db,
      tenantId: input.tenantId,
      orderId: platformOrderId,
      items,
      outletId: resolvedOutlet?.id ?? null,
    })
    if (!hold.ok) {
      await presell.release()
      return refused(hold.error)
    }
    presell.adoptOptionHold(hold.release)
  }

  const payment = paymentFields(order)
  const result = await createOrder(
    input.tenantId,
    items,
    input.customerInfo,
    input.orderTypeId,
    charges.customerData,
    effectiveDeliveryFee,
    input.lalamoveQuotationId,
    payment.paymentMethodId,
    payment.paymentMethodName,
    payment.paymentMethodDetails,
    payment.paymentMethodQrCodeUrl,
    serviceCharge,
    order.validatedScheduledISO,
    order.paymentProof,
    // Only the platform database has an outlet_id column; the other two
    // backends carry the branch in customer_data (stamped above).
    resolvedOutlet?.id ?? null,
    pricing.application.discountLines,
    {
      clientOrderId: typeof clientOrderId === 'string' ? clientOrderId : null,
      discountPayload: pricing.discountPayload,
      source: ORDER_SOURCE_BY_CHANNEL[input.channel ?? 'web'],
      // The id the simple-option counters were claimed under.
      orderId: platformOrderId,
    }
  )
  if (result.deduped) {
    // The first attempt already burned vouchers, depleted stock, and pushed
    // notifications for this exact order — running them again is the
    // double-spend the dedupe exists to prevent.
    //
    // Its presell claim is the one the saved order carries, so the claim THIS
    // retry just took reserved the allocation a second time for an order that
    // already exists. Hand that duplicate back or the shelf shrinks on every
    // double tap. The same goes for the option counters claimed under this
    // retry's own (never written) order id.
    await presell.release()
    return { kind: 'written', order: result.order, orderToken: result.orderToken, deduped: true, backend: 'platform' }
  }
  // The order row exists and carries the claim; the stock is spent for real.
  presell.markPersisted()
  await burnFor(result.order.id)
  await followUp(result.order.id, result.order.id)
  return { kind: 'written', order: result.order, orderToken: result.orderToken, deduped: false, backend: 'platform' }
}

export async function writeOrder(write: WriteOrderInput): Promise<WrittenOrder | RefusedOrder> {
  const backend = resolveOrderBackend(write.order.tenantConfig)
  if (backend === 'convex') return writeConvexOrder(write)
  // Otherwise, continue with existing Supabase flow
  return writePlatformOrder(write)
}
