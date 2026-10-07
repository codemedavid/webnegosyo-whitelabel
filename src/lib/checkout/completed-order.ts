/**
 * The confirmation screen's frozen copy of an order.
 *
 * Taken just before the cart is cleared: the confirmation renders AFTER that,
 * so everything it shows — including the parts the grand total is re-derived
 * from — has to travel on this snapshot. Lifted out of `useCheckout`. Pure.
 */
import type { FormFieldMeta } from '@/lib/cart-utils'
import type { OrderDiscountLine } from '@/lib/order-totals'
import type { CartItem, CustomerFormField, PaymentMethod } from '@/types/database'

export type { FormFieldMeta }

export interface CompletedOrderData {
  items: CartItem[]
  total: number
  deliveryFee: number | null
  serviceChargeAmount: number
  /**
   * What was actually taken off this order. Carried on the snapshot because the
   * confirmation screen re-derives the grand total from these parts, and a cart
   * cleared a millisecond later can no longer be asked.
   */
  discounts: OrderDiscountLine[]
  customerData: Record<string, string>
  orderTypeName: string | null
  scheduledForLabel: string | null
  paymentMethodName: string | null
  paymentMethodDetails: string | null
  messengerMessage: string
  messengerUrl: string
  formFields: FormFieldMeta[]
}

/** Each field's name and label — all the message and the confirmation read. */
export function toFormFieldsMeta(fields: readonly Pick<CustomerFormField, 'field_name' | 'field_label'>[]): FormFieldMeta[] {
  return fields.map(field => ({ field_name: field.field_name, field_label: field.field_label }))
}

export interface CompletedOrderSnapshotInput {
  items: readonly CartItem[]
  total: number
  /** The fee the summary billed (null when none); free delivery (0) is a fee. */
  deliveryFee: number | null
  serviceChargeAmount: number
  discounts: readonly OrderDiscountLine[]
  /** Already normalized — the same values the message and the order carry. */
  customerData: Readonly<Record<string, string>>
  orderTypeName: string | null
  scheduledForLabel: string | null
  paymentMethod: Pick<PaymentMethod, 'name' | 'details'> | null
  messengerMessage: string
  messengerUrl: string | null
  formFields: readonly Pick<CustomerFormField, 'field_name' | 'field_label'>[]
}

export function buildCompletedOrderSnapshot(input: CompletedOrderSnapshotInput): CompletedOrderData {
  return {
    items: [...input.items],
    total: input.total,
    deliveryFee: input.deliveryFee,
    serviceChargeAmount: input.serviceChargeAmount,
    discounts: [...input.discounts],
    customerData: { ...input.customerData },
    orderTypeName: input.orderTypeName,
    scheduledForLabel: input.scheduledForLabel,
    paymentMethodName: input.paymentMethod?.name ?? null,
    paymentMethodDetails: input.paymentMethod?.details ?? null,
    messengerMessage: input.messengerMessage,
    messengerUrl: input.messengerUrl ?? '',
    formFields: toFormFieldsMeta(input.formFields),
  }
}
