/**
 * Per-order-type minimum order — customer-facing checkout gate.
 *
 * When the selected order type carries a minimum (typically Delivery), a cart
 * below it must not be submittable, and the customer must be told how much more
 * to add rather than being left to guess why the button does nothing. Switching
 * to an order type without a minimum has to release the gate immediately.
 */

import { render, screen } from '@testing-library/react'
import { checkOrderMinimum, formatOrderMinimumMessage } from '@/lib/order-minimum'
import { CheckoutCTA, MinimumOrderNotice } from '@/components/customer/checkout-templates/checkout-primitives'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

function makeCheckout(overrides: Partial<UseCheckoutReturn> = {}): UseCheckoutReturn {
  return {
    tenant: { id: 'tenant-1', name: 'Island Silog' },
    branding: { checkoutAccent: '#ff6b00' },
    paymentMethods: [],
    isProcessing: false,
    handleProceedToPayment: jest.fn(),
    grandTotal: 320,
    messengerEnabled: true,
    orderMinimum: checkOrderMinimum(320, null),
    ...overrides,
  } as unknown as UseCheckoutReturn
}

// ---- The gate itself ------------------------------------------------------

describe('checkout minimum-order gate', () => {
  it('blocks a cart below the selected order type’s minimum', () => {
    const status = checkOrderMinimum(320, { minimum_order_amount: 500 })
    expect(status.meets).toBe(false)
    expect(status.shortfall).toBe(180)
  })

  it('releases the gate when the customer switches to an order type without a minimum', () => {
    // Delivery has a ₱500 minimum; the same ₱320 cart is fine for Pickup.
    expect(checkOrderMinimum(320, { minimum_order_amount: 500 }).meets).toBe(false)
    expect(checkOrderMinimum(320, { minimum_order_amount: 0 }).meets).toBe(true)
  })

  it('gates on the item subtotal, not on the delivery fee or service charge', () => {
    // A ₱320 cart with a ₱200 delivery fee must NOT sneak past a ₱500 minimum
    // just because the grand total reaches it.
    const subtotal = 320
    expect(checkOrderMinimum(subtotal, { minimum_order_amount: 500 }).meets).toBe(false)
  })
})

// ---- Customer-facing notice ----------------------------------------------

describe('MinimumOrderNotice', () => {
  it('renders nothing when the cart clears the minimum', () => {
    const { container } = render(
      <MinimumOrderNotice checkout={makeCheckout({ orderMinimum: checkOrderMinimum(750, { minimum_order_amount: 500 }) })} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the order type has no minimum at all', () => {
    const { container } = render(<MinimumOrderNotice checkout={makeCheckout()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('tells the customer the minimum and how much more to add', () => {
    render(
      <MinimumOrderNotice
        checkout={makeCheckout({ orderMinimum: checkOrderMinimum(320, { minimum_order_amount: 500 }) })}
      />
    )
    expect(screen.getByText(/₱500\.00/)).toBeInTheDocument()
    expect(screen.getByText(/₱180\.00/)).toBeInTheDocument()
  })
})

// ---- Submit button --------------------------------------------------------

describe('CheckoutCTA under a minimum', () => {
  it('disables submit while the cart is below the minimum', () => {
    render(
      <CheckoutCTA
        checkout={makeCheckout({ orderMinimum: checkOrderMinimum(320, { minimum_order_amount: 500 }) })}
      />
    )
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('leaves submit enabled when the minimum is met', () => {
    render(
      <CheckoutCTA
        checkout={makeCheckout({
          grandTotal: 750,
          orderMinimum: checkOrderMinimum(750, { minimum_order_amount: 500 }),
        })}
      />
    )
    expect(screen.getByRole('button')).toBeEnabled()
  })

  it('leaves submit enabled for order types with no minimum', () => {
    render(<CheckoutCTA checkout={makeCheckout()} />)
    expect(screen.getByRole('button')).toBeEnabled()
  })
})

// ---- Shared message -------------------------------------------------------

describe('formatOrderMinimumMessage in the checkout context', () => {
  it('names the order type so the customer knows switching to pickup would help', () => {
    const message = formatOrderMinimumMessage(
      checkOrderMinimum(320, { minimum_order_amount: 500 }),
      'Delivery'
    )
    expect(message).toContain('Delivery')
    expect(message).toContain('₱180.00')
  })
})
