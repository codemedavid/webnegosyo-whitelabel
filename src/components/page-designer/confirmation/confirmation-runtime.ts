// Pure helpers behind the designed thank-you page: its page state and the
// values of its `{tokens}`. Server-safe.

import { formatPrice } from '@/lib/cart-utils'
import type { CompletedOrderData } from '@/lib/checkout/completed-order'
import { computeOrderTotals } from '@/lib/order-totals'
import { firstNameToken } from '@/lib/page-designer/text'

export type ConfirmationState = 'success' | 'failed'

/** "Show when" state: `failed` covers both a lost and a refused order. */
export function confirmationState(hasOrderSaveFailed: boolean): ConfirmationState {
  return hasOrderSaveFailed ? 'failed' : 'success'
}

/** The grand total re-derived from the snapshot's parts (the cart is gone by now). */
export function confirmationGrandTotal(order: CompletedOrderData): number {
  return computeOrderTotals({
    subtotal: order.total,
    deliveryFee: order.deliveryFee,
    serviceCharge: order.serviceChargeAmount,
    discounts: order.discounts,
  }).grandTotal
}

/**
 * `{store}`, `{name}`, `{order_type}`, `{total}` — the total is the same
 * grand total the summary prints. A blank value drops the token.
 */
export function confirmationTokens(storeName: string, order: CompletedOrderData, grandTotal: number): Record<string, string> {
  return {
    store: storeName,
    name: firstNameToken(order.customerData.customer_name),
    order_type: order.orderTypeName ?? '',
    total: formatPrice(grandTotal),
  }
}
