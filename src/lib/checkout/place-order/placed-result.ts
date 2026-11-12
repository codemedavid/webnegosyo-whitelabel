/** The 'placed' answer: the saved order plus the figures it was saved with. */

import { computeOrderTotals } from '@/lib/order-totals'
import { generateTrackingToken } from '@/lib/tracking-token'
import type { AdmittedOrder } from './context'
import type { PricedCharges } from './pricing'
import type { WrittenOrder } from './write-order'
import type { PlacedOrder, PlacedOrderLine } from './types'

/** The customer's tracking token; undefined when API_SECRET is missing. */
function mintTrackingToken(orderId: string): string | undefined {
  try {
    return generateTrackingToken(orderId)
  } catch {
    return undefined
  }
}

export function buildPlacedOrder(
  admitted: AdmittedOrder,
  charges: PricedCharges,
  effectiveDeliveryFee: number | undefined,
  written: WrittenOrder
): PlacedOrder {
  // The same arithmetic every writer stores its total with; nothing re-read.
  const totals = computeOrderTotals({
    subtotal: admitted.itemsSubtotal,
    deliveryFee: effectiveDeliveryFee,
    serviceCharge: charges.serviceCharge,
    discounts: charges.pricing.application.discountLines,
  })
  const lines: PlacedOrderLine[] = admitted.lines.map((line) => ({
    menu_item_id: line.menu_item_id,
    name: line.menu_item_name,
    quantity: line.quantity,
    price: line.price,
    subtotal: line.subtotal,
    variation: line.variation,
    addons: Array.isArray(line.addons) ? [...line.addons] : [],
  }))

  return {
    kind: 'placed',
    order: written.order,
    orderToken: written.orderToken,
    trackingToken: mintTrackingToken(written.order.id),
    deduped: written.deduped,
    backend: written.backend,
    pricing: {
      itemsSubtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      serviceCharge: totals.serviceCharge,
      deliveryFee: totals.deliveryFee,
      total: totals.grandTotal,
    },
    lines,
  }
}
