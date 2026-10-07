/**
 * The /funnel offer sells a ₱999/month subscription through the same
 * checkout_leads pipeline the ₱3,899 one-time checkout uses. The lead's amount
 * is computed server-side from its payment term, so the monthly term must
 * resolve to the monthly price — never to the one-time setup price.
 */
import { describe, it, expect } from '@jest/globals'
import {
  CHECKOUT_BASE_PRICE,
  MONTHLY_SUBSCRIPTION_PRICE,
  getCheckoutPayableAmount,
  isCheckoutPaymentTerm,
} from '@/lib/checkout-leads/payment-terms'
import { getPaymentTermLabel } from '@/app/superadmin/checkout-leads/components/payment-term'

describe('monthly_subscription payment term', () => {
  it('is a recognised payment term', () => {
    expect(isCheckoutPaymentTerm('monthly_subscription')).toBe(true)
  })

  it('charges the first month at ₱999, not the one-time setup price', () => {
    expect(MONTHLY_SUBSCRIPTION_PRICE).toBe(999)
    expect(getCheckoutPayableAmount('monthly_subscription')).toBe(999)
    expect(getCheckoutPayableAmount('monthly_subscription')).not.toBe(CHECKOUT_BASE_PRICE)
  })

  it('leaves the one-time terms unchanged', () => {
    expect(getCheckoutPayableAmount('full_payment')).toBe(CHECKOUT_BASE_PRICE)
    expect(getCheckoutPayableAmount('downpayment_50')).toBe(Math.round(CHECKOUT_BASE_PRICE / 2))
  })

  it('is labelled as a monthly plan in the superadmin leads panel', () => {
    expect(getPaymentTermLabel('monthly_subscription')).toBe('Monthly (₱999/buwan)')
  })
})
