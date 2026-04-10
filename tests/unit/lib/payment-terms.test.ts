import {
  CHECKOUT_BASE_PRICE,
  CHECKOUT_PAYMENT_TERMS,
  DEFAULT_PAYMENT_TERM,
  type CheckoutPaymentTerm,
  getCheckoutPayableAmount,
  isCheckoutPaymentTerm,
} from '@/lib/checkout-leads/payment-terms'

const EXPECTED_PAYABLE_AMOUNTS = {
  downpayment_50: 1950,
  full_payment: 3899,
} satisfies Record<CheckoutPaymentTerm, number>

describe('checkout payment terms', () => {
  it('defines the Smart Menu base price and default term', () => {
    expect(CHECKOUT_BASE_PRICE).toBe(3899)
    expect(DEFAULT_PAYMENT_TERM).toBe('downpayment_50')
    expect(CHECKOUT_PAYMENT_TERMS).toEqual(['downpayment_50', 'full_payment'])
  })

  it('computes the payable amount for every supported payment term', () => {
    CHECKOUT_PAYMENT_TERMS.forEach(term => {
      expect(getCheckoutPayableAmount(term)).toBe(EXPECTED_PAYABLE_AMOUNTS[term])
    })
  })

  it('recognizes only supported payment terms', () => {
    CHECKOUT_PAYMENT_TERMS.forEach(term => {
      expect(isCheckoutPaymentTerm(term)).toBe(true)
    })
    expect(isCheckoutPaymentTerm('other')).toBe(false)
  })

  it('throws for unsupported payment terms', () => {
    expect(() => getCheckoutPayableAmount('other' as CheckoutPaymentTerm)).toThrow(
      'Unsupported checkout payment term'
    )
  })
})
