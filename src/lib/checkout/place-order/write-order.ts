/**
 * Writing the order to the store's own backend, then everything owed once a
 * row exists: the Senior/PWD sales book, voucher burns, stock, the merchant
 * email, the Loyverse push and (tenant Supabase) Regulars capture.
 */

import { createOrder, createOrderConvex } from '@/lib/orders-service'
import { createTenantOrderWriteClient } from '@/lib/supabase/tenant-order-client'
import { createOrderTenantSupabase } from '@/lib/tenant-supabase-orders'
import { resolveOrderBackend, assertOrderBackendReady, type OrderBackend } from '@/lib/order-backend'
import { burnRedemptions } from '@/lib/vouchers/order-voucher-flow'
import { runOrderFollowUps } from '@/lib/checkout/order-follow-ups'
import type { AdmittedOrder } from './context'
import type { PricedCharges } from './pricing'
import type { PresellClaimHolder } from './presell-claim'
import { ORDER_SOURCE_BY_CHANNEL, type PlacedOrderRow, type PlacedOrderToken } from './types'

export interface WrittenOrder {
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
   * the merchant email, Loyverse push and (tenant-Supabase) Regulars capture
   * follow the response. Burning vouchers stays with the caller, inline.
   */
  const followUp = (
    orderId: string,
    platformOrderId: string | null,
    captureCustomer?: () => Promise<unknown>,
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
      paymentMethodName: input.paymentMethodName,
      customerData: charges.customerData,
    },
    captureCustomer,
  })

  return { burnFor, followUp }
}

/**
 * Route to the tenant's OWN Supabase project when that is the selected
 * backend. Checked before the Convex branch so an explicit selection always
 * wins; `assertOrderBackendReady` makes a half-configured tenant fail loudly
 * instead of silently writing into the shared platform database, which would
 * split that merchant's orders across two backends unnoticed.
 */
async function writeTenantSupabaseOrder(write: WriteOrderInput): Promise<WrittenOrder> {
  const { order, charges, effectiveDeliveryFee, presell } = write
  const { input, db: supabaseAdmin, tenantConfig, lines: items } = order
  const { tenantId, customerInfo } = input
  const { pricing, serviceCharge } = charges
  const effectiveCustomerData = charges.customerData
  const { burnFor, followUp } = createAfterWrite(write)
  assertOrderBackendReady(tenantConfig)

  // The order type lives on the platform; carry its display name across so
  // the merchant queue doesn't render every order as "N/A".
  const orderTypeName = order.orderTypeRow?.name ?? null

  const tenantClient = createTenantOrderWriteClient(tenantConfig)
  const result = await createOrderTenantSupabase(tenantClient, {
    tenantId,
    items,
    customerInfo,
    orderTypeId: input.orderTypeId,
    orderTypeName,
    customerData: effectiveCustomerData,
    deliveryFee: effectiveDeliveryFee,
    lalamoveQuotationId: input.lalamoveQuotationId,
    paymentMethodId: input.paymentMethodId,
    paymentMethodName: input.paymentMethodName,
    paymentMethodDetails: input.paymentMethodDetails,
    paymentMethodQrCodeUrl: input.paymentMethodQrCodeUrl,
    serviceChargeAmount: serviceCharge,
    scheduledForISO: order.validatedScheduledISO,
    paymentProof: order.paymentProof,
    discounts: pricing.application.discountLines,
  })
  // The order row exists and carries the claim; the stock is spent for real.
  presell.markPersisted()

  await burnFor(result.order.id)

  // Same reason as the Convex branch: this order lives in the tenant's own
  // project, so nothing else would ever roll it into the platform-side
  // customers table. Best-effort and post-response — the order is saved.
  const capturedAt = new Date().toISOString()
  await followUp(result.order.id, null, async () => {
    const { captureExternalOrderBestEffort } = await import('@/lib/customer-external-orders')
    await captureExternalOrderBestEffort(supabaseAdmin, tenantId, {
      backend: 'tenant_supabase',
      externalOrderId: result.order.id,
      name: customerInfo?.name ?? null,
      contact: customerInfo?.contact ?? null,
      customerData: effectiveCustomerData ?? null,
      total: Number(result.order.total) || 0,
      createdAt: capturedAt,
      channel: orderTypeName,
      items: items.map((item) => ({
        name: item.menu_item_name,
        quantity: item.quantity,
      })),
    })
  })
  return { order: result.order, orderToken: result.orderToken, deduped: false, backend: 'supabase' }
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
    input.paymentMethodId,
    input.paymentMethodName,
    input.paymentMethodDetails,
    input.paymentMethodQrCodeUrl,
    serviceCharge,
    order.validatedScheduledISO,
    pricing.application.discountLines,
    ORDER_SOURCE_BY_CHANNEL[input.channel ?? 'web']
  )
  // The order row exists and carries the claim; the stock is spent for real.
  presell.markPersisted()
  await burnFor(result.order.id)
  await followUp(result.order.id, null)
  return { order: result.order, orderToken: result.orderToken, deduped: false, backend: 'convex' }
}

/** The shared platform database — most stores. */
async function writePlatformOrder(write: WriteOrderInput): Promise<WrittenOrder> {
  const { order, charges, effectiveDeliveryFee, presell } = write
  const { input, lines: items, resolvedOutlet } = order
  const { clientOrderId } = input
  const { pricing, serviceCharge } = charges
  const { burnFor, followUp } = createAfterWrite(write)

  const result = await createOrder(
    input.tenantId,
    items,
    input.customerInfo,
    input.orderTypeId,
    charges.customerData,
    effectiveDeliveryFee,
    input.lalamoveQuotationId,
    input.paymentMethodId,
    input.paymentMethodName,
    input.paymentMethodDetails,
    input.paymentMethodQrCodeUrl,
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
    // double tap.
    await presell.release()
    return { order: result.order, orderToken: result.orderToken, deduped: true, backend: 'platform' }
  }
  // The order row exists and carries the claim; the stock is spent for real.
  presell.markPersisted()
  await burnFor(result.order.id)
  await followUp(result.order.id, result.order.id)
  return { order: result.order, orderToken: result.orderToken, deduped: false, backend: 'platform' }
}

export async function writeOrder(write: WriteOrderInput): Promise<WrittenOrder> {
  const backend = resolveOrderBackend(write.order.tenantConfig)
  if (backend === 'supabase') return writeTenantSupabaseOrder(write)
  if (backend === 'convex') return writeConvexOrder(write)
  // Otherwise, continue with existing Supabase flow
  return writePlatformOrder(write)
}
