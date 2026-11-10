/**
 * A tap on "Place order" with mistakes shows each one beside its question
 * (`fieldErrors`, first mistake per field) and counts the tap
 * (`fieldErrorAttempt`, the form scrolls to the first); the toast stays.
 * Before any tap nothing is shown, and a fixed answer clears its mistake.
 */

import { act, renderHook } from '@testing-library/react'
import type { CheckoutConfig } from '@/lib/checkout/checkout-config'
import type { CartItem, CustomerFormField, OrderType, PaymentMethod, Tenant } from '@/types/database'

const UPSELL_LINE = {
  id: 'l1',
  menu_item: { id: 'm1', name: 'Adobo', price: 100 },
  selected_variation: { id: 'v1', name: 'Large', price_modifier: 20 },
  selected_addons: [{ id: 'a1', name: 'Egg', price: 15, quantity: 2 }],
  quantity: 2,
  subtotal: 300,
  special_instructions: 'no onions',
  upsellSource: 'post_add',
} as unknown as CartItem

const PLAIN_LINE = {
  id: 'l2',
  menu_item: { id: 'm2', name: 'Rice', price: 30 },
  selected_addons: [],
  quantity: 1,
  subtotal: 30,
} as unknown as CartItem

const cartState = {
  items: [UPSELL_LINE, PLAIN_LINE] as CartItem[],
  orderType: 'pickup' as string | null,
}
const NO_ITEMS: CartItem[] = []
// Empties the cart the way the real one does, so effects keyed on it re-run.
const clearCart = jest.fn(() => {
  cartState.items = NO_ITEMS
})
const NO_BUNDLES: never[] = []

jest.mock('@/hooks/useCart', () => ({
  useCart: () => ({
    isHydrated: true,
    items: cartState.items,
    bundleItems: NO_BUNDLES,
    total: 330,
    clearCart,
    orderType: cartState.orderType,
    setOrderType: jest.fn(),
    messengerPsid: 'psid-9',
  }),
}))

const ROUTER = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }
const SEARCH_PARAMS = new URLSearchParams()
jest.mock('next/navigation', () => ({
  useRouter: () => ROUTER,
  useSearchParams: () => SEARCH_PARAMS,
  usePathname: () => '/acme/checkout',
}))

jest.mock('@/lib/outlets/outlets-client', () => ({ fetchActiveOutlets: async () => [] }))
jest.mock('@/app/actions/orders', () => ({ createOrderAction: jest.fn() }))
jest.mock('@/app/actions/vouchers', () => ({ validateVoucherAction: jest.fn() }))
jest.mock('@/app/actions/checkout-stock', () => ({ preflightCheckoutStockAction: jest.fn() }))
jest.mock('@/app/actions/presell-checkout', () => ({ preflightPresellAction: jest.fn() }))
jest.mock('@/app/actions/analytics', () => ({ trackAnalyticsEventAction: jest.fn() }))
jest.mock('@/app/actions/lalamove', () => ({ createQuotationAction: jest.fn() }))
jest.mock('@/app/actions/delivery', () => ({ calculateDistanceDeliveryFeeAction: jest.fn() }))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))

const TENANT = {
  id: 'tenant-1',
  slug: 'acme',
  name: 'Acme',
  enable_order_management: true,
  order_backend: 'platform',
  facebook_page_id: 'fb-page-row',
  messenger_username: null,
  messenger_page_id: null,
  messenger_redirect_mode: 'prefill',
} as unknown as Tenant

const orderType = (id: string, extra: Partial<OrderType> = {}): OrderType =>
  ({ id, type: id, name: `${id} name`, ...extra }) as unknown as OrderType
const field = (orderTypeId: string, fieldName: string, fieldType = 'text'): CustomerFormField =>
  ({ id: `${orderTypeId}-${fieldName}`, order_type_id: orderTypeId, field_name: fieldName, field_label: `${fieldName} label`, field_type: fieldType }) as unknown as CustomerFormField

const GCASH = { id: 'gcash', name: 'GCash', details: '0917 000 0000', qr_code_url: 'https://qr.example/g.png' } as unknown as PaymentMethod

function configWith(pickup: Partial<OrderType>): CheckoutConfig {
  return {
    orderTypes: [orderType('pickup', pickup)],
    formFieldsByOrderType: { pickup: [{ ...field('pickup', 'customer_name'), is_required: true }, field('pickup', 'customer_email', 'email')] },
    paymentMethodsByOrderType: { pickup: [GCASH] },
    outlets: null,
    facebookPageId: 'acme.page',
  }
}

import { useCheckout } from '@/hooks/useCheckout'

import { toast } from 'sonner'

beforeEach(() => {
  jest.clearAllMocks()
  window.localStorage.clear()
  cartState.items = [UPSELL_LINE, PLAIN_LINE]
  cartState.orderType = 'pickup'
})

it('shows each mistake beside its question only after a failed tap, and follows the answers after', async () => {
  const config = configWith({})
  const hook = renderHook(() => useCheckout({ tenantSlug: 'acme', initialTenant: TENANT, config }))
  await act(async () => {
    hook.result.current.setCustomerData({ customer_email: 'not-an-email' })
  })
  expect(hook.result.current.fieldErrors).toEqual({})
  expect(hook.result.current.fieldErrorAttempt).toBe(0)

  await act(async () => {
    hook.result.current.handleProceedToPayment()
  })
  expect(hook.result.current.fieldErrorAttempt).toBe(1)
  expect(hook.result.current.fieldErrors).toEqual({
    customer_name: 'customer_name label is required',
    customer_email: 'customer_email label doesn’t look like a valid email address',
  })
  expect(toast.error).toHaveBeenCalled()

  await act(async () => {
    hook.result.current.setCustomerData({ customer_name: 'Juan', customer_email: 'juan@example.com' })
  })
  expect(hook.result.current.fieldErrors).toEqual({})
})
