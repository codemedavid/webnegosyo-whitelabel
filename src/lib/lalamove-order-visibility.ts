/**
 * Whether an order should carry the Lalamove controls at all.
 *
 * The admin used to key this on "has a quotation or a delivery fee". A
 * delivery order whose quotation was never stored — or expired and was
 * cleared — therefore had no Delivery tab and no way to get a new quote. The
 * order TYPE is what makes it a delivery; the quotation is just its state.
 */
export interface LalamoveOrderShape {
  orderType?: string | null
  deliveryAddress?: string | null
  deliveryFee?: number | string | null
  lalamoveQuotationId?: string | null
  lalamoveOrderId?: string | null
}

const DELIVERY_TYPE_RE = /deliver/i

export function isDeliveryOrderType(orderType: string | null | undefined): boolean {
  return typeof orderType === 'string' && DELIVERY_TYPE_RE.test(orderType)
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

export function shouldShowLalamoveControls(order: LalamoveOrderShape): boolean {
  if (hasText(order.lalamoveOrderId) || hasText(order.lalamoveQuotationId)) return true
  if (Number(order.deliveryFee ?? 0) > 0) return true
  return isDeliveryOrderType(order.orderType) || hasText(order.deliveryAddress)
}
