/**
 * Per-payment-method "skip the payment-details step".
 *
 * Cash and cash-on-delivery have nothing to show at checkout — no account
 * number, no QR code, nothing to copy — so the payment-details dialog is a
 * dead step the customer has to tap through. A merchant can now turn that step
 * off per method, and turn it off for any other method they settle in person.
 *
 * Strictly opt-in: rows saved before the column existed (undefined/null) and
 * rows with the flag off keep today's behavior exactly.
 */

import { isPaymentDetailsStepSkipped } from '@/lib/payment-details-step'
import { resolvePaymentSubmitPlan } from '@/lib/after-billing-payment'
import { resolveCheckoutCtaLabel } from '@/lib/messenger-availability'
import type { PaymentMethod } from '@/types/database'

function method(overrides: Partial<PaymentMethod> = {}): PaymentMethod {
  return {
    id: 'pm-1',
    tenant_id: 't-1',
    name: 'Cash',
    is_active: true,
    order_index: 0,
    created_at: '2026-09-19T00:00:00.000Z',
    updated_at: '2026-09-19T00:00:00.000Z',
    ...overrides,
  }
}

// ---- isPaymentDetailsStepSkipped ------------------------------------------

describe('isPaymentDetailsStepSkipped', () => {
  test('is off when no method is selected', () => {
    expect(isPaymentDetailsStepSkipped(null)).toBe(false)
    expect(isPaymentDetailsStepSkipped(undefined)).toBe(false)
  })

  test('is off for rows saved before the column existed', () => {
    expect(isPaymentDetailsStepSkipped(method({}))).toBe(false)
    // A stale schema can hand back an explicit null rather than the column.
    expect(isPaymentDetailsStepSkipped({ skip_payment_details: null })).toBe(false)
  })

  test('is on only when the merchant explicitly turned it on', () => {
    expect(isPaymentDetailsStepSkipped(method({ skip_payment_details: true }))).toBe(true)
    expect(isPaymentDetailsStepSkipped(method({ skip_payment_details: false }))).toBe(false)
  })

  test('does not infer anything from the method name', () => {
    expect(isPaymentDetailsStepSkipped(method({ name: 'Cash' }))).toBe(false)
    expect(isPaymentDetailsStepSkipped(method({ name: 'GCash', skip_payment_details: true }))).toBe(true)
  })
})

// ---- resolvePaymentSubmitPlan ---------------------------------------------

describe('resolvePaymentSubmitPlan with a skip-details method', () => {
  test('submits the order directly instead of opening the details step', () => {
    expect(
      resolvePaymentSubmitPlan({
        hasPaymentMethods: true,
        hasSelectedPaymentMethod: true,
        isAfterBillingPayment: false,
        skipsPaymentDetails: true,
      })
    ).toBe('submit-order')
  })

  test('still blocks until a method is chosen', () => {
    expect(
      resolvePaymentSubmitPlan({
        hasPaymentMethods: true,
        hasSelectedPaymentMethod: false,
        isAfterBillingPayment: false,
        skipsPaymentDetails: true,
      })
    ).toBe('blocked-no-method')
  })

  test('proof wins: a method that requires a screenshot still opens the step', () => {
    // The proof UI lives inside the dialog, so skipping it would make checkout
    // uncompletable for a method that demands a screenshot or reference.
    expect(
      resolvePaymentSubmitPlan({
        hasPaymentMethods: true,
        hasSelectedPaymentMethod: true,
        isAfterBillingPayment: false,
        skipsPaymentDetails: true,
        requiresPaymentProof: true,
      })
    ).toBe('payment-details')
  })

  test('unset leaves today behavior untouched — the details step opens', () => {
    expect(
      resolvePaymentSubmitPlan({
        hasPaymentMethods: true,
        hasSelectedPaymentMethod: true,
        isAfterBillingPayment: false,
      })
    ).toBe('payment-details')
  })
})

// ---- resolveCheckoutCtaLabel ----------------------------------------------

describe('resolveCheckoutCtaLabel with a skip-details method', () => {
  test('does not promise a payment step that never comes', () => {
    expect(
      resolveCheckoutCtaLabel({
        hasPaymentMethods: true,
        isMessengerEnabled: true,
        skipsPaymentDetails: true,
      })
    ).not.toBe('Proceed to Payment')
  })

  test('still says "Proceed to Payment" when proof forces the step open', () => {
    expect(
      resolveCheckoutCtaLabel({
        hasPaymentMethods: true,
        isMessengerEnabled: true,
        skipsPaymentDetails: true,
        requiresPaymentProof: true,
      })
    ).toBe('Proceed to Payment')
  })
})
