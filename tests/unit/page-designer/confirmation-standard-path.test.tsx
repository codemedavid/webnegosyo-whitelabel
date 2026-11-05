/**
 * The thank-you page WITHOUT a published design must render exactly as it did
 * before the Page Designer: same parts, same order, same classes, same words.
 * The snapshots were recorded from CheckoutConfirmation before it was split
 * into blocks (2026-11-04); a diff here means the standard page changed.
 */

import { render } from '@testing-library/react'

import { CheckoutConfirmation } from '@/components/customer/checkout-templates/checkout-shared'
import type { UseCheckoutReturn } from '@/hooks/useCheckout'
import type { CompletedOrderData } from '@/lib/checkout/completed-order'
import type { OrderSaveNotice } from '@/lib/checkout/order-save-outcome'
import type { CartItem } from '@/types/database'

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const ITEMS = [
  {
    id: 'l1',
    menu_item: { id: 'm1', name: 'Chicken Adobo', price: 180 },
    selected_variation: { id: 'v1', name: 'Large', price_modifier: 20 },
    selected_addons: [{ id: 'a1', name: 'Egg', price: 15, quantity: 2 }],
    quantity: 2,
    subtotal: 460,
    special_instructions: 'no onions',
  },
  {
    id: 'l2',
    menu_item: { id: 'm2', name: 'Iced Latte', price: 120 },
    selected_variations: { size: { id: 'o1', name: 'Grande' }, milk: { id: 'o2', name: 'Oat' } },
    selected_addons: [],
    quantity: 1,
    subtotal: 120,
  },
] as unknown as CartItem[]

const ORDER: CompletedOrderData = {
  items: ITEMS,
  total: 580,
  deliveryFee: 49,
  serviceChargeAmount: 29,
  discounts: [{ code: 'SAVE10', label: 'SAVE10', amount: 58 }] as CompletedOrderData['discounts'],
  customerData: { customer_name: 'Maria Santos', customer_phone: '+639171234567', table: '' },
  orderTypeName: 'Delivery',
  scheduledForLabel: 'Fri, Nov 7 · 6:30 PM',
  paymentMethodName: 'GCash',
  paymentMethodDetails: 'Send to 0917 000 0000 (Lola K.)',
  messengerMessage: 'Order: 2x Chicken Adobo\nTotal: ₱600.00',
  messengerUrl: 'https://m.me/lolas.kitchen',
  formFields: [
    { field_name: 'customer_name', field_label: 'Name' },
    { field_name: 'customer_phone', field_label: 'Phone' },
    { field_name: 'table', field_label: 'Table' },
  ],
}

const LOST: OrderSaveNotice = { verdict: 'failed', message: 'We could not confirm your order with the store.', isMessengerRecoverable: true }
const REFUSED: OrderSaveNotice = { verdict: 'refused', message: 'Chicken Adobo just sold out.', isMessengerRecoverable: false }

function checkoutWith(overrides: Partial<Record<keyof UseCheckoutReturn, unknown>> = {}): UseCheckoutReturn {
  return {
    tenant: { id: 't-1', slug: 'lolas', name: 'Lola’s Kitchen' },
    branding: undefined,
    completedOrderData: ORDER,
    redirectCountdown: 3,
    trackingOrderId: 'order-1',
    trackingToken: 'tok-1',
    messageExpanded: false,
    setMessageExpanded: jest.fn(),
    router: { push: jest.fn(), replace: jest.fn() },
    tenantSlug: 'lolas',
    messengerEnabled: true,
    isKiosk: false,
    kioskCountdown: null,
    orderSaveFailed: false,
    orderSaveNotice: null,
    ...overrides,
  } as unknown as UseCheckoutReturn
}

const MINIMAL: CompletedOrderData = {
  ...ORDER,
  items: [ITEMS[0]],
  deliveryFee: null,
  serviceChargeAmount: 0,
  discounts: [],
  orderTypeName: null,
  scheduledForLabel: null,
  paymentMethodName: null,
  paymentMethodDetails: null,
  formFields: [],
}

const CASES: ReadonlyArray<[string, Partial<Record<keyof UseCheckoutReturn, unknown>>]> = [
  ['messenger countdown, saved, collapsed message', {}],
  ['messenger opened, expanded message', { redirectCountdown: 0, messageExpanded: true }],
  ['messenger on without a page link', { completedOrderData: { ...ORDER, messengerUrl: '' }, messageExpanded: true }],
  ['messenger off, saved, no tracking yet', { messengerEnabled: false, trackingOrderId: null, trackingToken: null, messageExpanded: true }],
  ['messenger off, lost order', { messengerEnabled: false, orderSaveFailed: true, orderSaveNotice: LOST }],
  ['messenger on, refused order', { orderSaveFailed: true, orderSaveNotice: REFUSED, trackingOrderId: null }],
  ['lost order without a notice object (legacy flag)', { orderSaveFailed: true, orderSaveNotice: null }],
  ['minimal order: no fees, fields or payment', { completedOrderData: MINIMAL, messengerEnabled: false }],
  ['kiosk, counting down', { isKiosk: true, kioskCountdown: 3, messengerEnabled: false }],
  ['kiosk, before the first tick, lost', { isKiosk: true, kioskCountdown: null, messengerEnabled: false, orderSaveFailed: true, orderSaveNotice: LOST }],
]

describe('CheckoutConfirmation — standard thank-you page is unchanged', () => {
  it.each(CASES)('%s', (_name, overrides) => {
    const { container } = render(<CheckoutConfirmation checkout={checkoutWith(overrides)} />)
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('renders nothing without a completed order', () => {
    const { container } = render(<CheckoutConfirmation checkout={checkoutWith({ completedOrderData: null })} />)
    expect(container.innerHTML).toBe('')
  })
})
