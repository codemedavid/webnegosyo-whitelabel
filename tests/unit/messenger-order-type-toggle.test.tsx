/**
 * Per-order-type Messenger toggle.
 *
 * Merchants can turn Messenger off for a specific order type (e.g. Dine-In runs
 * on a QR/kiosk flow and should never bounce the customer to Facebook, while
 * Delivery still does). When Messenger is off for the selected order type the
 * checkout CTA must read "Complete Order" instead of "Send Order via Messenger",
 * and no Messenger URL / auto-redirect may be produced.
 */

import { render, screen } from '@testing-library/react'
import {
  isMessengerEnabledForOrderType,
  isMessengerRedirectEnabledForOrderType,
  resolveCheckoutCtaLabel,
  resolveFinalSubmitLabel,
} from '@/lib/messenger-availability'
import { CheckoutCTA } from '@/components/customer/checkout-templates/checkout-primitives'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

// ---- Fixtures -------------------------------------------------------------

function makeCheckout(overrides: Partial<UseCheckoutReturn> = {}): UseCheckoutReturn {
  return {
    tenant: { id: 'tenant-1', name: 'Island Silog' },
    branding: { checkoutAccent: '#ff6b00' },
    paymentMethods: [],
    isProcessing: false,
    handleProceedToPayment: jest.fn(),
    grandTotal: 250,
    messengerEnabled: true,
    ...overrides,
  } as unknown as UseCheckoutReturn
}

// ---- isMessengerEnabledForOrderType --------------------------------------

describe('isMessengerEnabledForOrderType', () => {
  it('defaults to enabled when the order type is missing', () => {
    expect(isMessengerEnabledForOrderType(null)).toBe(true)
    expect(isMessengerEnabledForOrderType(undefined)).toBe(true)
  })

  it('defaults to enabled when the column has not been backfilled yet', () => {
    expect(isMessengerEnabledForOrderType({})).toBe(true)
    expect(isMessengerEnabledForOrderType({ messenger_enabled: null })).toBe(true)
  })

  it('is disabled only when the order type explicitly turns Messenger off', () => {
    expect(isMessengerEnabledForOrderType({ messenger_enabled: false })).toBe(false)
    expect(isMessengerEnabledForOrderType({ messenger_enabled: true })).toBe(true)
  })
})

// ---- isMessengerRedirectEnabledForOrderType -------------------------------

describe('isMessengerRedirectEnabledForOrderType', () => {
  it('redirects when both the tenant and the order type allow Messenger', () => {
    expect(
      isMessengerRedirectEnabledForOrderType({ messenger_redirect_enabled: true }, { messenger_enabled: true })
    ).toBe(true)
  })

  it('does not redirect when the order type turns Messenger off', () => {
    expect(
      isMessengerRedirectEnabledForOrderType({ messenger_redirect_enabled: true }, { messenger_enabled: false })
    ).toBe(false)
  })

  it('still honours the tenant-level redirect switch', () => {
    expect(
      isMessengerRedirectEnabledForOrderType({ messenger_redirect_enabled: false }, { messenger_enabled: true })
    ).toBe(false)
  })

  it('defaults to redirecting when neither side has been configured', () => {
    expect(isMessengerRedirectEnabledForOrderType(null, null)).toBe(true)
  })
})

// ---- resolveCheckoutCtaLabel ---------------------------------------------

describe('resolveCheckoutCtaLabel', () => {
  it('sends the customer to payment selection when payment methods exist', () => {
    expect(resolveCheckoutCtaLabel({ hasPaymentMethods: true, isMessengerEnabled: true })).toBe('Proceed to Payment')
    expect(resolveCheckoutCtaLabel({ hasPaymentMethods: true, isMessengerEnabled: false })).toBe('Proceed to Payment')
  })

  it('offers Messenger when it is enabled for the order type', () => {
    expect(resolveCheckoutCtaLabel({ hasPaymentMethods: false, isMessengerEnabled: true })).toBe(
      'Send Order via Messenger'
    )
  })

  it('completes the order in place when Messenger is off for the order type', () => {
    expect(resolveCheckoutCtaLabel({ hasPaymentMethods: false, isMessengerEnabled: false })).toBe('Complete Order')
  })
})

// ---- resolveFinalSubmitLabel ---------------------------------------------

describe('resolveFinalSubmitLabel', () => {
  it('keeps the Messenger wording on the payment-details step when Messenger is on', () => {
    expect(resolveFinalSubmitLabel({ isMessengerEnabled: true })).toBe('Order Now')
  })

  it('reads "Complete Order" when Messenger is off for the order type', () => {
    expect(resolveFinalSubmitLabel({ isMessengerEnabled: false })).toBe('Complete Order')
  })
})

// ---- CheckoutCTA rendering ------------------------------------------------

describe('CheckoutCTA', () => {
  it('renders the Messenger CTA when Messenger is enabled and no payment methods exist', () => {
    render(<CheckoutCTA checkout={makeCheckout({ messengerEnabled: true })} />)

    expect(screen.getByRole('button')).toHaveTextContent('Send Order via Messenger')
  })

  it('renders "Complete Order" when Messenger is disabled for the selected order type', () => {
    render(<CheckoutCTA checkout={makeCheckout({ messengerEnabled: false })} />)

    const button = screen.getByRole('button')
    expect(button).toHaveTextContent('Complete Order')
    expect(button).not.toHaveTextContent('Messenger')
  })
})
