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

describe('CheckoutConfirmation — the notice reaches every confirmation variant', () => {
  // The notice used to live inside the Messenger-redirect block, so the three
  // screens below claimed "your order has been sent" with nothing written and
  // no way for the customer to tell. A lost order must be visible on every
  // design and every configuration, not only on the one that has a fallback.

  it('warns when the tenant has Messenger turned off', () => {
    render(
      <CheckoutConfirmation
        checkout={checkoutWith({
          orderSaveFailed: true,
          messengerEnabled: false,
        } as Partial<UseCheckoutReturn>)}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/could not confirm/i)
  })

  it('warns when Messenger is on but no page is connected to redirect to', () => {
    render(
      <CheckoutConfirmation
        checkout={checkoutWith({
          orderSaveFailed: true,
          completedOrderData: {
            ...checkoutWith().completedOrderData!,
            messengerUrl: '',
          },
        } as Partial<UseCheckoutReturn>)}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/could not confirm/i)
  })

  it('warns on the kiosk confirmation screen', () => {
    render(
      <CheckoutConfirmation
        checkout={checkoutWith({
          orderSaveFailed: true,
          isKiosk: true,
        } as Partial<UseCheckoutReturn>)}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/could not confirm/i)
  })

  it('stops the hero from claiming the order was placed', () => {
    // The green "Order Placed!" headline is the loudest thing on the screen.
    // Leaving it intact under a warning is how a merchant reads the warning as
    // a minor hiccup rather than a lost sale.
    render(
      <CheckoutConfirmation
        checkout={checkoutWith({ orderSaveFailed: true } as Partial<UseCheckoutReturn>)}
      />
    )

    expect(screen.queryByText('Order Placed!')).not.toBeInTheDocument()
  })

  it('names a recovery even when there is no Messenger message to send', () => {
    render(
      <CheckoutConfirmation
        checkout={checkoutWith({
          orderSaveFailed: true,
          messengerEnabled: false,
        } as Partial<UseCheckoutReturn>)}
      />
    )

    // Without Messenger the only remaining route to the merchant is contacting
    // them directly, so the notice has to say so rather than trail off.
    expect(screen.getByRole('alert')).toHaveTextContent(/contact/i)
  })
})

describe('CheckoutConfirmation — a refusal is not a lost order', () => {
  // The store saying "below the minimum" or "just went out of stock" is not the
  // same event as the order going missing, and the customer needs opposite
  // advice for each. Telling a refused customer to send the Messenger message
  // hands the merchant an order the platform deliberately rejected.

  const refused = (message: string) =>
    checkoutWith({
      orderSaveNotice: {
        verdict: 'refused',
        message,
        isMessengerRecoverable: false,
      },
    } as Partial<UseCheckoutReturn>)

  it("shows the store's own sentence instead of the generic one", () => {
    render(
      <CheckoutConfirmation
        checkout={refused('Sorry, Adobo just went out of stock. Please remove it from your cart and try again.')}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/Adobo just went out of stock/i)
  })

  it('does not tell a refused customer to send the Messenger message', () => {
    render(<CheckoutConfirmation checkout={refused('This order is below the minimum for checkout')} />)

    expect(screen.getByRole('alert')).not.toHaveTextContent(/send the Messenger message/i)
  })

  it('does not claim the order was placed', () => {
    render(<CheckoutConfirmation checkout={refused('This order is below the minimum for checkout')} />)

    expect(screen.queryByText('Order Placed!')).not.toBeInTheDocument()
  })

  it('still names Messenger as the recovery for a genuinely lost order', () => {
    // The failure case is unchanged: that message is the merchant's last copy.
    render(
      <CheckoutConfirmation
        checkout={checkoutWith({
          orderSaveNotice: {
            verdict: 'failed',
            message: 'We could not confirm your order with the store.',
            isMessengerRecoverable: true,
          },
        } as Partial<UseCheckoutReturn>)}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/messenger/i)
  })

  it('keeps working for a caller that has no notice yet', () => {
    // orderSaveFailed alone still drives the banner, so a design or a code path
    // that has not been given the notice degrades to the generic wording
    // rather than rendering an empty alert.
    render(<CheckoutConfirmation checkout={checkoutWith({ orderSaveFailed: true } as Partial<UseCheckoutReturn>)} />)

    expect(screen.getByRole('alert')).toHaveTextContent(/could not confirm/i)
  })
})
