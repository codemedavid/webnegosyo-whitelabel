/**
 * Per-order-type "Pay after billing".
 *
 * Some order types (typically Dine In) settle the bill AFTER the meal. The
 * customer still declares how they'll pay — the merchant wants that on the
 * ticket — but there is nothing to pay yet, so checkout must not detour
 * through the payment-details step (account numbers, QR codes, proof upload).
 * Choosing a method and tapping the CTA places the order directly.
 *
 * The flag is strictly opt-in: rows saved before the column exists (undefined)
 * and rows with the flag off must keep today's behavior exactly.
 */

import {
  isAfterBillingPaymentEnabled,
  resolvePaymentSubmitPlan,
} from '@/lib/after-billing-payment'
import { resolveCheckoutCtaLabel } from '@/lib/messenger-availability'
import { orderTypeSchema } from '@/lib/order-types-service'

// ---- isAfterBillingPaymentEnabled ----------------------------------------

describe('isAfterBillingPaymentEnabled', () => {
  it('is off when there is no order type at all', () => {
    expect(isAfterBillingPaymentEnabled(null)).toBe(false)
    expect(isAfterBillingPaymentEnabled(undefined)).toBe(false)
  })

  it('is off for rows saved before the column existed', () => {
    expect(isAfterBillingPaymentEnabled({})).toBe(false)
    expect(isAfterBillingPaymentEnabled({ after_billing_payment_enabled: null })).toBe(false)
  })

  it('is on only when the merchant explicitly turned it on', () => {
    expect(isAfterBillingPaymentEnabled({ after_billing_payment_enabled: true })).toBe(true)
    expect(isAfterBillingPaymentEnabled({ after_billing_payment_enabled: false })).toBe(false)
  })
})

// ---- resolvePaymentSubmitPlan --------------------------------------------
// The single decision handleProceedToPayment makes once form validation has
// passed: block until a method is chosen, open the payment-details step, or
// submit the order directly.

describe('resolvePaymentSubmitPlan', () => {
  it('submits directly when the tenant configured no payment methods (unchanged)', () => {
    expect(
      resolvePaymentSubmitPlan({
        hasPaymentMethods: false,
        hasSelectedPaymentMethod: false,
        isAfterBillingPayment: false,
      })
    ).toBe('submit-order')
  })

  it('still requires choosing a method before anything else — even for after-billing', () => {
    expect(
      resolvePaymentSubmitPlan({
        hasPaymentMethods: true,
        hasSelectedPaymentMethod: false,
        isAfterBillingPayment: true,
      })
    ).toBe('blocked-no-method')
    expect(
      resolvePaymentSubmitPlan({
        hasPaymentMethods: true,
        hasSelectedPaymentMethod: false,
        isAfterBillingPayment: false,
      })
    ).toBe('blocked-no-method')
  })

  it('opens the payment-details step for a normal order type (unchanged)', () => {
    expect(
      resolvePaymentSubmitPlan({
        hasPaymentMethods: true,
        hasSelectedPaymentMethod: true,
        isAfterBillingPayment: false,
      })
    ).toBe('payment-details')
  })

  it('skips the payment-details step entirely when the order type is after-billing', () => {
    expect(
      resolvePaymentSubmitPlan({
        hasPaymentMethods: true,
        hasSelectedPaymentMethod: true,
        isAfterBillingPayment: true,
      })
    ).toBe('submit-order')
  })
})

// ---- CTA label ------------------------------------------------------------
// "Proceed to Payment" would promise a step that never comes. After-billing
// checkouts must label the CTA as the final submit it actually is.

describe('resolveCheckoutCtaLabel with after-billing', () => {
  it('keeps "Proceed to Payment" for normal order types with methods', () => {
    expect(
      resolveCheckoutCtaLabel({
        hasPaymentMethods: true,
        isMessengerEnabled: true,
        isAfterBillingPayment: false,
      })
    ).toBe('Proceed to Payment')
  })

  it('labels the CTA as the final submit when after-billing skips the payment step', () => {
    expect(
      resolveCheckoutCtaLabel({
        hasPaymentMethods: true,
        isMessengerEnabled: true,
        isAfterBillingPayment: true,
      })
    ).toBe('Send Order via Messenger')
    expect(
      resolveCheckoutCtaLabel({
        hasPaymentMethods: true,
        isMessengerEnabled: false,
        isAfterBillingPayment: true,
      })
    ).toBe('Complete Order')
  })

  it('existing callers that do not pass the flag are unchanged', () => {
    expect(
      resolveCheckoutCtaLabel({ hasPaymentMethods: true, isMessengerEnabled: true })
    ).toBe('Proceed to Payment')
  })
})

// ---- Write schema ---------------------------------------------------------
// zod strips unknown keys, so a missing schema entry silently discards the
// merchant's toggle on save.

const baseInput = {
  type: 'dine_in' as const,
  name: 'Dine In',
  is_enabled: true,
  order_index: 0,
}

describe('orderTypeSchema — after_billing_payment_enabled', () => {
  it('carries the flag through to the database payload', () => {
    expect(
      orderTypeSchema.parse({ ...baseInput, after_billing_payment_enabled: true })
    ).toMatchObject({ after_billing_payment_enabled: true })
    expect(
      orderTypeSchema.parse({ ...baseInput, after_billing_payment_enabled: false })
    ).toMatchObject({ after_billing_payment_enabled: false })
  })

  it('stays optional so order types saved before the column keep validating', () => {
    expect(() => orderTypeSchema.parse(baseInput)).not.toThrow()
  })
})
