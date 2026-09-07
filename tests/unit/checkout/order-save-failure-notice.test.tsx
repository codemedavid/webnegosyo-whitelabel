/**
 * What the customer sees when the order never reached the store.
 *
 * The confirmation screen is optimistic — "Order Placed!" renders before the
 * row is written — so when every retry of the save fails, that screen is
 * actively lying. A toast fades; this notice does not, because the customer
 * sending the Messenger message by hand is the only thing that still gets the
 * order to the merchant.
 */

import { render, screen } from '@testing-library/react'
import { CheckoutConfirmation } from '@/components/customer/checkout-templates/checkout-shared'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

const checkoutWith = (overrides: Partial<UseCheckoutReturn> = {}): UseCheckoutReturn =>
  ({
    tenant: { id: 't-1', slug: 'acme', name: 'Acme' },
    completedOrderData: {
      items: [],
      total: 100,
      deliveryFee: null,
      serviceChargeAmount: 0,
      customerData: {},
      orderTypeName: 'Pickup',
      scheduledForLabel: null,
      paymentMethodName: 'Cash',
      paymentMethodDetails: null,
      messengerMessage: 'Order: 1x Latte',
      messengerUrl: 'https://m.me/acme',
      formFields: [],
    },
    redirectCountdown: 0,
    trackingOrderId: null,
    trackingToken: null,
    messageExpanded: true,
    setMessageExpanded: jest.fn(),
    router: { push: jest.fn() },
    tenantSlug: 'acme',
    messengerEnabled: true,
    isKiosk: false,
    kioskCountdown: null,
    orderSaveFailed: false,
    ...overrides,
  }) as unknown as UseCheckoutReturn

describe('CheckoutConfirmation — the order-save failure notice', () => {
  it('says nothing extra when the order saved normally', () => {
    render(<CheckoutConfirmation checkout={checkoutWith()} />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('warns the customer when the order could not be confirmed with the store', () => {
    render(<CheckoutConfirmation checkout={checkoutWith({ orderSaveFailed: true } as Partial<UseCheckoutReturn>)} />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/could not confirm/i)
  })

  it('tells the customer the specific action that still delivers the order', () => {
    // "Something went wrong" is useless here: the recovery is to send the
    // Messenger message, and the notice has to name it.
    render(<CheckoutConfirmation checkout={checkoutWith({ orderSaveFailed: true } as Partial<UseCheckoutReturn>)} />)

    expect(screen.getByRole('alert')).toHaveTextContent(/messenger/i)
  })
})
