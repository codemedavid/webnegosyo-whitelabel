/**
 * BiteSpeed checkout design: a one-page, fast-food style checkout.
 *
 * Pure presentation over useCheckout(), so these tests drive it with a plain
 * checkout object and assert only what the customer sees and what the design
 * hands back to the hook: the order lines, the empty state, the place-order
 * gate, and the payment-proof notice for methods that need it.
 */

import { render, screen, fireEvent, within } from '@testing-library/react'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'

const SUBTOTAL = 200
const DELIVERY_FEE = 50

const GCASH = {
  id: 'gcash',
  name: 'GCash',
  details: 'Account name: Island Silog\nNumber: 0917 123 4567',
  qr_code_url: null,
  require_payment_proof: true,
}
const CASH = {
  id: 'cash',
  name: 'Cash',
  details: null,
  qr_code_url: null,
  require_payment_proof: false,
  skip_payment_details: true,
}

function makeCheckout(overrides: Partial<UseCheckoutReturn> = {}): UseCheckoutReturn {
  return {
    tenantSlug: 'island-silog',
    router: { push: jest.fn(), back: jest.fn() },
    tenant: { id: 'tenant-1', name: 'Island Silog', slug: 'island-silog' },
    branding: {},
    orderTypes: [],
    orderType: '',
    setOrderType: jest.fn(),
    selectedOrderTypeData: null,
    shouldAskFulfillment: false,
    advanceConfig: { enabled: false, allowAsap: true, leadTimeMinutes: 0 },
    formFields: [],
    customerData: {},
    setCustomerData: jest.fn(),
    items: [
      {
        id: 'line-1',
        menu_item: { name: 'Latte', image_url: '' },
        quantity: 2,
        subtotal: SUBTOTAL,
        selected_variation: null,
        selected_variations: {},
        selected_addons: [],
      },
    ],
    bundleItems: [],
    total: SUBTOTAL,
    deliveryFee: DELIVERY_FEE,
    isFetchingDeliveryFee: false,
    deliveryFeeAddress: null,
    deliveryFeeError: null,
    serviceChargeAmount: 0,
    grandTotal: SUBTOTAL + DELIVERY_FEE,
    paymentMethods: [],
    selectedPaymentMethod: null,
    setSelectedPaymentMethod: jest.fn(),
    openQrDialog: jest.fn(),
    handleCopyText: jest.fn(),
    copiedText: null,
    isProcessing: false,
    handleProceedToPayment: jest.fn(),
    messengerEnabled: false,
    orderMinimum: { meets: true, minimum: 0, shortfall: 0 },
    voucherCodes: [],
    voucherPreview: null,
    isCheckingVoucher: false,
    applyVoucherCode: jest.fn(),
    removeVoucherCode: jest.fn(),
    ...overrides,
  } as unknown as UseCheckoutReturn
}

async function renderBiteSpeed(overrides: Partial<UseCheckoutReturn> = {}) {
  const { BiteSpeedCheckout } = await import(
    '@/components/customer/checkout-templates/bitespeed-checkout'
  )
  const checkout = makeCheckout(overrides)
  render(<BiteSpeedCheckout checkout={checkout} />)
  return checkout
}

function placeOrderButton() {
  return screen.getByRole('button', { name: /complete order|proceed to payment|send order/i })
}

describe('BiteSpeed checkout', () => {
  it('treats a bundle-only cart as an order: lists the bundle and keeps the place-order bar', async () => {
    // Regression: the design once checked `items` alone, so a cart holding only
    // a bundle showed "Your order is empty" and could not be checked out.
    await renderBiteSpeed({
      items: [],
      bundleItems: [{ id: 'b-line', bundleId: 'b1', bundleName: "Founder's Fuel", slots: [], quantity: 1, pricingType: 'fixed', basePrice: 199, subtotal: 199 }],
    } as Partial<UseCheckoutReturn>)

    const order = screen.getByRole('region', { name: 'Your Order' })
    expect(within(order).getByText("Founder's Fuel")).toBeInTheDocument()
    expect(within(order).getByText('×1')).toBeInTheDocument()
    expect(screen.queryByText('Your order is empty')).not.toBeInTheDocument()
    expect(placeOrderButton()).toBeInTheDocument()
  })

  it('names the store in a checkout heading', async () => {
    await renderBiteSpeed()

    expect(screen.getByRole('heading', { level: 1, name: 'Island Silog checkout' })).toBeInTheDocument()
  })

  it('lists the order lines under "Your Order" and shows the total to pay', async () => {
    await renderBiteSpeed()

    const order = screen.getByRole('region', { name: 'Your Order' })
    expect(within(order).getByText('Latte')).toBeInTheDocument()
    expect(within(order).getByText('×2')).toBeInTheDocument()

    const summary = screen.getByRole('region', { name: 'Summary' })
    expect(within(summary).getByText('Subtotal')).toBeInTheDocument()
    expect(within(summary).getByText('₱250.00')).toBeInTheDocument()
    // The item is listed once, in "Your Order", not repeated in the summary.
    expect(within(summary).queryByText('Latte')).not.toBeInTheDocument()

    expect(screen.getByText('Total to Pay')).toBeInTheDocument()
  })

  it('links "Add more" and the back arrow to the menu', async () => {
    await renderBiteSpeed()

    expect(screen.getByRole('link', { name: /add more/i })).toHaveAttribute('href', '/island-silog/menu')
    expect(screen.getByRole('link', { name: /back to menu/i })).toHaveAttribute('href', '/island-silog/menu')
  })

  it('shows an empty state with a way back to the menu when the cart is empty', async () => {
    await renderBiteSpeed({ items: [], total: 0, grandTotal: 0, deliveryFee: null })

    expect(screen.getByText('Your order is empty')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /browse menu/i })).toHaveAttribute('href', '/island-silog/menu')
    // Nothing to place: no payment section and no place-order bar.
    expect(screen.queryByText('Total to Pay')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Payment' })).not.toBeInTheDocument()
  })

  it('hands the place-order tap to the hook', async () => {
    const checkout = await renderBiteSpeed()

    fireEvent.click(placeOrderButton())

    expect(checkout.handleProceedToPayment).toHaveBeenCalledTimes(1)
  })

  it('blocks placing the order while one is already processing', async () => {
    await renderBiteSpeed({ isProcessing: true })

    const button = screen.getByRole('button', { name: /processing order/i })
    expect(button).toBeDisabled()
  })

  it('blocks placing the order below the order minimum and says why', async () => {
    const checkout = await renderBiteSpeed({
      orderMinimum: { meets: false, minimum: 500, shortfall: 300 } as UseCheckoutReturn['orderMinimum'],
    })

    const button = placeOrderButton()
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(checkout.handleProceedToPayment).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('flags proof of payment only for a method that requires it', async () => {
    await renderBiteSpeed({
      paymentMethods: [GCASH, CASH] as unknown as UseCheckoutReturn['paymentMethods'],
      selectedPaymentMethod: 'gcash',
    })

    expect(screen.getByText('Proof required')).toBeInTheDocument()
    expect(placeOrderButton()).toHaveTextContent(/proceed to payment/i)
  })

  it('does not ask for proof of payment for a method that does not need it', async () => {
    await renderBiteSpeed({
      paymentMethods: [GCASH, CASH] as unknown as UseCheckoutReturn['paymentMethods'],
      selectedPaymentMethod: 'cash',
    })

    expect(screen.queryByText('Proof required')).not.toBeInTheDocument()
    expect(placeOrderButton()).toHaveTextContent(/complete order/i)
  })
})
