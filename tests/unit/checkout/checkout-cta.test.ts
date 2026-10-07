import { findSelectedPaymentMethod, resolvePlaceOrderLabel } from '@/lib/checkout/checkout-cta'
import { CHECKOUT_CTA_LABEL } from '@/lib/messenger-availability'
import type { OrderType, PaymentMethod } from '@/types/database'

const cash = { id: 'cash', name: 'Cash', skip_payment_details: true } as unknown as PaymentMethod
const gcash = { id: 'gcash', name: 'GCash' } as unknown as PaymentMethod

describe('findSelectedPaymentMethod', () => {
  it('returns the chosen method', () => {
    expect(findSelectedPaymentMethod([cash, gcash], 'gcash')).toBe(gcash)
  })

  it('returns null with no choice or an unknown id', () => {
    expect(findSelectedPaymentMethod([cash, gcash], null)).toBeNull()
    expect(findSelectedPaymentMethod([cash, gcash], 'card')).toBeNull()
  })
})

describe('resolvePlaceOrderLabel', () => {
  it('promises the payment step for a method that has one', () => {
    expect(resolvePlaceOrderLabel({
      paymentMethods: [cash, gcash],
      selectedPaymentMethod: 'gcash',
      messengerEnabled: false,
      selectedOrderTypeData: undefined,
    })).toBe(CHECKOUT_CTA_LABEL.payment)
  })

  it('names Messenger when the order type uses it and there is nothing to pay up front', () => {
    expect(resolvePlaceOrderLabel({
      paymentMethods: [],
      selectedPaymentMethod: null,
      messengerEnabled: true,
      selectedOrderTypeData: { id: 'pickup' } as unknown as OrderType,
    })).toBe(CHECKOUT_CTA_LABEL.messenger)
  })

  it('completes directly when the chosen method skips its details step', () => {
    expect(resolvePlaceOrderLabel({
      paymentMethods: [cash, gcash],
      selectedPaymentMethod: 'cash',
      messengerEnabled: false,
      selectedOrderTypeData: undefined,
    })).toBe(CHECKOUT_CTA_LABEL.complete)
  })
})
