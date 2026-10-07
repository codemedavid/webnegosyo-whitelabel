/**
 * The order message the merchant reads in Messenger (and the customer can copy).
 *
 * A named-argument front for `generateMessengerMessage`, whose nine positional
 * parameters `useCheckout` used to assemble inline. Pure.
 */
import { generateMessengerMessage } from '@/lib/cart-utils'
import type { OrderDiscountLine } from '@/lib/order-totals'
import { toFormFieldsMeta } from '@/lib/checkout/completed-order'
import type { CartBundleItem, CartItem, CustomerFormField, OrderType, PaymentMethod } from '@/types/database'

export interface OrderMessageInput {
  items: CartItem[]
  bundleItems: readonly CartBundleItem[]
  tenantName: string
  orderType: Pick<OrderType, 'name' | 'type'> | undefined
  /** Already normalized — the same values the order carries. */
  customerData: Record<string, string>
  paymentMethod: Pick<PaymentMethod, 'name' | 'details'> | null
  formFields: readonly Pick<CustomerFormField, 'field_name' | 'field_label'>[]
  serviceChargeAmount: number
  scheduledForLabel: string | null
  /** The fee the summary billed; null when none applies. */
  deliveryFee: number | null
  discounts: readonly OrderDiscountLine[]
}

export function buildOrderMessage(input: OrderMessageInput): string {
  const { orderType, paymentMethod } = input
  return generateMessengerMessage(
    input.items,
    input.tenantName,
    orderType ? { name: orderType.name, type: orderType.type } : null,
    input.customerData,
    paymentMethod ? { name: paymentMethod.name, details: paymentMethod.details || undefined } : null,
    toFormFieldsMeta(input.formFields),
    input.serviceChargeAmount || undefined,
    input.scheduledForLabel || undefined,
    { bundleItems: input.bundleItems, deliveryFee: input.deliveryFee, discounts: input.discounts }
  )
}
