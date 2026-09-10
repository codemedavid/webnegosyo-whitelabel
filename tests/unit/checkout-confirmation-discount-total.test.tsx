/**
 * The confirmation screen's grand total must be the total the customer was
 * actually charged.
 *
 * The screen already reads `computeOrderTotals`, but it was handing it only
 * subtotal + delivery fee + service charge — the discount lines were never
 * carried onto the completed-order snapshot at all. A customer who redeemed a
 * voucher was billed the discounted amount and then shown the full one on the
 * thank-you screen, which is the number they screenshot and dispute with.
 */

import { render, screen } from '@testing-library/react'
import { CheckoutConfirmation } from '@/components/customer/checkout-templates/checkout-shared'
import { computeOrderTotals, type OrderDiscountLine } from '@/lib/order-totals'
import { formatPrice } from '@/lib/cart-utils'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const SUBTOTAL = 500
const DELIVERY_FEE = 60
const SERVICE_CHARGE = 25
const DISCOUNTS: OrderDiscountLine[] = [{ label: 'WELCOME10', amount: 50, code: 'WELCOME10' }]

const COMPLETED_ORDER = {
  items: [
    {
      id: 'ci-1',
      menu_item: { id: 'mi-1', name: 'Corned Beef Silog' },
      quantity: 1,
      subtotal: SUBTOTAL,
      selected_addons: [],
    },
  ],
  total: SUBTOTAL,
  deliveryFee: DELIVERY_FEE,
  serviceChargeAmount: SERVICE_CHARGE,
  discounts: DISCOUNTS,
  customerData: { customer_name: 'Ana' },
  orderTypeName: 'Delivery',
  scheduledForLabel: null,
  paymentMethodName: 'Cash',
  paymentMethodDetails: null,
  messengerMessage: 'Order for Ana',
  messengerUrl: 'https://m.me/luckyjoy',
  formFields: [{ field_name: 'customer_name', field_label: 'Name' }],
}

function checkoutWith(overrides: Record<string, unknown> = {}): UseCheckoutReturn {
  return {
    tenant: { name: 'Lucky Joy' },
    completedOrderData: COMPLETED_ORDER,
    redirectCountdown: null,
    trackingOrderId: 'order-1',
    trackingToken: 'token-1',
    messageExpanded: false,
    setMessageExpanded: jest.fn(),
    router: { push: jest.fn(), replace: jest.fn() },
    tenantSlug: 'lucky-joy',
    messengerEnabled: true,
    isKiosk: false,
    kioskCountdown: null,
    orderSaveFailed: false,
    orderSaveNotice: null,
    ...overrides,
  } as unknown as UseCheckoutReturn
}

describe('CheckoutConfirmation — discounted grand total', () => {
  it('renders the total that computeOrderTotals produces for the discounted order', () => {
    // Arrange
    const expected = computeOrderTotals({
      subtotal: SUBTOTAL,
      deliveryFee: DELIVERY_FEE,
      serviceCharge: SERVICE_CHARGE,
      discounts: DISCOUNTS,
    })

    // Act
    render(<CheckoutConfirmation checkout={checkoutWith()} />)

    // Assert
    expect(expected.grandTotal).toBe(535)
    expect(screen.getByText(formatPrice(expected.grandTotal))).toBeInTheDocument()
  })

  it('names the discount that was taken off', () => {
    // Arrange / Act
    render(<CheckoutConfirmation checkout={checkoutWith()} />)

    // Assert
    expect(screen.getByText('WELCOME10')).toBeInTheDocument()
    expect(screen.getByText(`-${formatPrice(50)}`)).toBeInTheDocument()
  })

  it('leaves an undiscounted order exactly as it was', () => {
    // Arrange
    const undiscounted = { ...COMPLETED_ORDER, discounts: [] }
    const expected = computeOrderTotals({
      subtotal: SUBTOTAL,
      deliveryFee: DELIVERY_FEE,
      serviceCharge: SERVICE_CHARGE,
    })

    // Act
    render(<CheckoutConfirmation checkout={checkoutWith({ completedOrderData: undiscounted })} />)

    // Assert
    expect(expected.grandTotal).toBe(585)
    expect(screen.getByText(formatPrice(expected.grandTotal))).toBeInTheDocument()
  })
})
