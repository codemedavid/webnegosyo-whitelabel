/**
 * The confirmation screen on a counter tablet.
 *
 * This screen is shared by all five checkout designs, so what it does here it
 * does everywhere. On a kiosk it has to answer a different question: not "how
 * do I finish sending this?" but "is it my turn yet?". It says what is about to
 * happen, offers a way to skip the wait, and drops the things that only make
 * sense on a device with one owner — the Messenger handoff, the copyable order
 * text, and the tracking link, which on a shared tablet would hand the next
 * customer a live link to the previous customer's order.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckoutConfirmation } from '@/components/customer/checkout-templates/checkout-shared'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

const push = jest.fn()

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const COMPLETED_ORDER = {
  items: [
    {
      id: 'ci-1',
      menu_item: { id: 'mi-1', name: 'Corned Beef Silog' },
      quantity: 1,
      subtotal: 79,
      selected_addons: [],
    },
  ],
  total: 79,
  deliveryFee: null,
  serviceChargeAmount: 0,
  customerData: { customer_name: 'Ana' },
  orderTypeName: 'Dine In',
  scheduledForLabel: null,
  paymentMethodName: 'Cash',
  paymentMethodDetails: null,
  messengerMessage: 'Order for Ana',
  messengerUrl: 'https://m.me/luckyjoy',
  formFields: [{ field_name: 'customer_name', field_label: 'Name' }],
}

function checkoutWith(overrides: Record<string, unknown>): UseCheckoutReturn {
  return {
    tenant: { name: 'Lucky Joy' },
    completedOrderData: COMPLETED_ORDER,
    redirectCountdown: null,
    trackingOrderId: 'order-1',
    trackingToken: 'token-1',
    messageExpanded: false,
    setMessageExpanded: jest.fn(),
    router: { push, replace: jest.fn() },
    tenantSlug: 'lucky-joy',
    messengerEnabled: true,
    isKiosk: false,
    kioskCountdown: null,
    ...overrides,
  } as unknown as UseCheckoutReturn
}

/** What checkout actually hands the screen on a kiosk: Messenger suppressed. */
const KIOSK = {
  isKiosk: true,
  messengerEnabled: false,
  kioskCountdown: 3,
}

beforeEach(() => {
  push.mockClear()
})

describe('CheckoutConfirmation — kiosk mode', () => {
  it('tells the customer the screen is about to return to the menu', () => {
    // Arrange / Act
    render(<CheckoutConfirmation checkout={checkoutWith(KIOSK)} />)

    // Assert
    expect(screen.getByText(/returning to the menu/i)).toBeInTheDocument()
  })

  it('counts the seconds down on screen', () => {
    render(<CheckoutConfirmation checkout={checkoutWith({ ...KIOSK, kioskCountdown: 2 })} />)

    expect(screen.getByText(/\b2s\b/)).toBeInTheDocument()
  })

  it('still confirms the order was placed', () => {
    render(<CheckoutConfirmation checkout={checkoutWith(KIOSK)} />)

    expect(screen.getByText(/order placed/i)).toBeInTheDocument()
  })

  it('lets the next customer skip the wait', async () => {
    const user = userEvent.setup()
    render(<CheckoutConfirmation checkout={checkoutWith(KIOSK)} />)

    await user.click(screen.getByRole('button', { name: /start a new order/i }))

    expect(push).toHaveBeenCalledWith('/lucky-joy/menu?kiosk=1')
  })

  it('never offers the Messenger handoff', () => {
    render(<CheckoutConfirmation checkout={checkoutWith(KIOSK)} />)

    expect(screen.queryByRole('button', { name: /messenger/i })).not.toBeInTheDocument()
  })

  it('does not leave the order text on screen for the next customer to copy', () => {
    render(<CheckoutConfirmation checkout={checkoutWith(KIOSK)} />)

    expect(screen.queryByText(/order message/i)).not.toBeInTheDocument()
  })

  it('does not hand the next customer a link to the last order', () => {
    // The tracking link needs no login — on a shared tablet it is a leak.
    render(<CheckoutConfirmation checkout={checkoutWith(KIOSK)} />)

    expect(screen.queryByRole('button', { name: /track your order/i })).not.toBeInTheDocument()
  })
})

describe('CheckoutConfirmation — ordinary customer (regression)', () => {
  it('still offers the Messenger handoff', () => {
    render(<CheckoutConfirmation checkout={checkoutWith({ redirectCountdown: 3 })} />)

    expect(screen.getByRole('button', { name: /go to messenger/i })).toBeInTheDocument()
  })

  it('still offers order tracking', () => {
    render(<CheckoutConfirmation checkout={checkoutWith({})} />)

    expect(screen.getByRole('button', { name: /track your order/i })).toBeInTheDocument()
  })

  it('still offers the order message', () => {
    render(<CheckoutConfirmation checkout={checkoutWith({})} />)

    expect(screen.getByText(/order message/i)).toBeInTheDocument()
  })

  it('shows no kiosk countdown', () => {
    render(<CheckoutConfirmation checkout={checkoutWith({})} />)

    expect(screen.queryByText(/returning to the menu/i)).not.toBeInTheDocument()
  })

  it('still goes back to the menu without a kiosk param', async () => {
    const user = userEvent.setup()
    render(<CheckoutConfirmation checkout={checkoutWith({})} />)

    await user.click(screen.getByRole('button', { name: /back to menu/i }))

    expect(push).toHaveBeenCalledWith('/lucky-joy/menu')
  })
})
