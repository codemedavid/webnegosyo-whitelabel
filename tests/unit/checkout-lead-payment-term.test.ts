/**
 * `checkout_leads.payment_term` is a nullable text column. The stale generated
 * types claimed it was a non-null union, so the label helper's `default` branch
 * returned the raw value and nobody had to think about null. Regenerating the
 * types made the lie visible.
 *
 * This pins the two edges: an unrecognised term still shows its raw value (so a
 * term added by a migration is not invisible in the superadmin panel), and a
 * null term renders as nothing rather than the string "null".
 */
import { describe, it, expect } from '@jest/globals'
import { getPaymentTermLabel } from '@/app/superadmin/checkout-leads/components/payment-term'

describe('getPaymentTermLabel', () => {
  it('labels a 50% downpayment', () => {
    expect(getPaymentTermLabel('downpayment_50')).toBe('50% Downpayment')
  })

  it('labels a full payment', () => {
    expect(getPaymentTermLabel('full_payment')).toBe('Full Payment')
  })

  it('falls back to the raw value for a term it does not know', () => {
    expect(getPaymentTermLabel('installment_3' as never)).toBe('installment_3')
  })

  it('renders nothing for a missing term instead of the string "null"', () => {
    expect(getPaymentTermLabel(null)).toBe('')
  })
})
