/**
 * Every money figure the order is saved with, recomputed on the server: the
 * delivery fee, the service charge, vouchers and Senior/PWD. Only codes and
 * claims came from the caller — never an amount.
 */

import { distanceConfigFromTenant, toLatLng } from '@/lib/delivery-fee'
import { measureRoadDistanceKm } from '@/lib/maps/road-distance-server'
import { resolveFreeDeliveryThreshold, waiveDeliveryFee } from '@/lib/free-delivery'
import { priceOrderWithVouchers, type PricedOrder } from '@/lib/vouchers/order-pricing'
import { sanitizeUnitPicks } from '@/lib/vouchers/unit-picks'
import { createVoucherLookup } from '@/lib/vouchers/repository'
import type { VoucherLookup } from '@/lib/vouchers/resolve'
import { loadCategoryMap } from '@/lib/vouchers/order-voucher-flow'
import { writeOrderDiscount } from '@/lib/order-discount'
import { resolveOrderContact } from '@/lib/customer-identity'
import { resolveOrderDeliveryFee } from '@/lib/checkout/order-delivery-fee'
import { verifyDeliveryQuote } from '@/lib/checkout/delivery-quote-signature'
import { computeServiceCharge } from '@/lib/order-service-charge'
import {
  applyCheckoutGovernment,
  type AppliedCheckoutGovernment,
} from '@/lib/gov-discount-checkout/apply-checkout-government'
import type { AdminClient, AdmittedOrder } from './context'
import { INVALID_DELIVERY_FEE_MESSAGE } from './validate-request'
import { lost, refused, type PlaceOrderFailure, type PlaceOrderLineInput } from './types'

/**
 * ── Delivery fee (authoritative) ──
 * A distance fee is recomputed from coordinates; an order with no fee
 * source (not a delivery, or neither Lalamove nor distance pricing on)
 * carries none. A Lalamove fee is the price the quote action SIGNED, never
 * the browser's number: a forged ₱1 fee on a real quotation used to be
 * booked at the merchant's cost.
 */
export async function resolveTrustedDeliveryFee(
  order: AdmittedOrder
): Promise<{ ok: true; fee: number | undefined } | { ok: false; failure: PlaceOrderFailure }> {
  const { input, tenantConfig, orderTypeRow } = order
  const { tenantId } = input
  const isLalamoveDelivery = orderTypeRow?.type === 'delivery' && tenantConfig.lalamove_enabled === true
  const deliveryDestination = (order.customerData ?? {}) as Record<string, unknown>
  let trustedDeliveryFee = input.deliveryFee
  if (isLalamoveDelivery) {
    const verification = verifyDeliveryQuote(input.lalamoveQuoteSignature, {
      tenantId,
      quotationId: input.lalamoveQuotationId,
      destination: {
        address: deliveryDestination.delivery_address,
        lat: deliveryDestination.delivery_lat,
        lng: deliveryDestination.delivery_lng,
      },
    })
    if (verification.ok) {
      trustedDeliveryFee = verification.fee
    } else if (verification.reason === 'unconfigured') {
      console.error('[createOrderAction] Lalamove quote signing is not configured', { tenantId })
      return {
        ok: false,
        failure: refused('Delivery quotes are temporarily unavailable. Please contact the store or choose another order type.'),
      }
    } else {
      console.warn('[createOrderAction] Refused an unverified Lalamove fee', {
        tenantId,
        reason: verification.reason,
      })
      return { ok: false, failure: refused(INVALID_DELIVERY_FEE_MESSAGE) }
    }
  }

  const deliveryResolution = await resolveOrderDeliveryFee({
    clientFee: trustedDeliveryFee,
    isDeliveryOrder: orderTypeRow?.type === 'delivery',
    lalamoveEnabled: tenantConfig.lalamove_enabled === true,
    distanceConfig: distanceConfigFromTenant(tenantConfig),
    store: toLatLng(tenantConfig.restaurant_latitude, tenantConfig.restaurant_longitude),
    destination: toLatLng(deliveryDestination.delivery_lat, deliveryDestination.delivery_lng),
    measureKm: measureRoadDistanceKm,
  })
  if (deliveryResolution.kind === 'abort') return { ok: false, failure: lost(deliveryResolution.error) }
  if (deliveryResolution.kind === 'refuse') return { ok: false, failure: refused(deliveryResolution.error) }
  // Free delivery above the store's minimum, judged on the server-priced
  // item subtotal (see src/lib/free-delivery.ts). Lalamove's signed price was
  // verified above; waiving it here only changes what the customer pays.
  const fee = waiveDeliveryFee(
    deliveryResolution.fee,
    order.itemsSubtotal,
    resolveFreeDeliveryThreshold(tenantConfig.free_delivery_min_order)
  )
  return { ok: true, fee }
}

export interface PricedCharges {
  serviceCharge: number
  /** The voucher or Senior/PWD pricing that won. */
  pricing: PricedOrder
  checkoutGovernment: AppliedCheckoutGovernment
  customerKey: ReturnType<typeof resolveOrderContact>
  /** The admitted customer data with the discount breakdown written in. */
  customerData: Record<string, unknown>
}

/** What `priceOrderVouchers` needs: server-priced lines and charges, plus CODES (never amounts). */
export interface OrderVoucherPricingInput {
  db: AdminClient
  tenantId: string
  /** Server-priced lines. */
  items: readonly PlaceOrderLineInput[]
  deliveryFee: number | undefined
  serviceCharge: number
  /** As the customer typed them; untrusted, non-strings dropped. */
  voucherCodes: unknown
  outletId: string | null
  customerKey: string | null
  voucherUnitPicks?: unknown
  /** Defaults to the tenant's voucher rows; a caller may wrap it to see what was found. */
  lookup?: VoucherLookup
}

/**
 * The checkout's voucher pricing — the ONE definition the order engine and the
 * customer app's voucher preview share (same channel, customer key, branch and
 * category map), so the number previewed is the number charged.
 */
export async function priceOrderVouchers(input: OrderVoucherPricingInput): Promise<PricedOrder> {
  const requestedCodes = Array.isArray(input.voucherCodes)
    ? input.voucherCodes.filter((code): code is string => typeof code === 'string')
    : []

  // Category-scoped vouchers need to know each item's category. Loaded only
  // when a code was actually presented — an ordinary order pays nothing for
  // this feature. An empty map matches nothing, which is the safe direction.
  const categoryByMenuItemId =
    requestedCodes.length === 0
      ? {}
      : await loadCategoryMap(input.db, input.tenantId, input.items.map((i) => i.menu_item_id))

  return priceOrderWithVouchers({
    tenantId: input.tenantId,
    items: input.items,
    deliveryFee: input.deliveryFee,
    serviceCharge: input.serviceCharge,
    voucherCodes: requestedCodes,
    channel: 'checkout',
    now: new Date(),
    lookup: input.lookup ?? createVoucherLookup(input.db),
    categoryByMenuItemId,
    outletId: input.outletId,
    customerKey: input.customerKey,
    unitPicks: sanitizeUnitPicks(input.voucherUnitPicks),
  })
}

export async function priceCharges(
  order: AdmittedOrder,
  effectiveDeliveryFee: number | undefined
): Promise<PricedCharges> {
  const { input, db: supabaseAdmin, lines: items, orderTypeRow, itemsSubtotal, resolvedOutlet } = order
  const { tenantId, customerInfo } = input

  // ── Service charge (authoritative) ──
  // Recomputed from the tenant's own order type against the server-priced
  // subtotal, with the formula the checkout displays. The sent figure is
  // ignored — a negative one used to be stored as a discount.
  const serviceCharge = computeServiceCharge(orderTypeRow, itemsSubtotal)

  const customerKey = resolveOrderContact({
    name: customerInfo?.name,
    contact: customerInfo?.contact,
    customerData: order.customerData,
  })

  // ---- Vouchers -------------------------------------------------------
  // Priced here, after the server has re-priced every line and settled the
  // delivery fee, so the discount is computed against numbers the customer
  // could not influence. Only codes came from the browser.
  const voucherPricing = await priceOrderVouchers({
    db: supabaseAdmin,
    tenantId,
    items,
    deliveryFee: effectiveDeliveryFee,
    serviceCharge,
    voucherCodes: input.voucherCodes,
    outletId: resolvedOutlet?.id ?? null,
    customerKey,
    voucherUnitPicks: input.voucherUnitPicks,
  })

  // ---- Senior / PWD ----------------------------------------------------
  // The government discount OR the vouchers, whichever saves more — never
  // both (RA 9994 §4). Unpriceable claims fall back to the vouchers.
  const checkoutGovernment = await applyCheckoutGovernment({
    db: supabaseAdmin,
    tenantId,
    claim: input.governmentClaim,
    items,
    serviceCharge,
    deliveryFee: effectiveDeliveryFee ?? 0,
    voucherPricing,
  })
  const pricing = checkoutGovernment.pricing

  // The breakdown rides in customerData so it reaches Convex tenants too,
  // whose schema is deployed per tenant and would not have a new column.
  // `total` is already net of the discount on every backend; this is the
  // receipt detail, never the source of the amount charged.
  const customerData = writeOrderDiscount(order.customerData, pricing.discountPayload)

  return { serviceCharge, pricing, checkoutGovernment, customerKey, customerData }
}
