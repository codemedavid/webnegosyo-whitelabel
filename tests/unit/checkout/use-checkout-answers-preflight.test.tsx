/**
 * The required-questions preflight, as the checkout uses it.
 *
 * `createOrderAction` refuses an order with a required answer missing, but the
 * checkout shows "Order placed!" before that save lands. So the checkout asks
 * the server's CURRENT questions first (a tab opened before the owner made a
 * question required still holds the old form) and, on a refusal, stays on the
 * form: a question the tab shows gets its mistake beside it (aria-invalid via
 * `fieldErrors`); a question the tab has never seen asks for a refresh.
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
jest.mock('@/app/actions/checkout-answers', () => ({ preflightCheckoutAnswersAction: jest.fn() }))
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
import { createOrderAction } from '@/app/actions/orders'
import { preflightCheckoutStockAction } from '@/app/actions/checkout-stock'
import { preflightCheckoutAnswersAction } from '@/app/actions/checkout-answers'
import { toast } from 'sonner'

const TENANT_WITH_ORDERS = { ...TENANT, enable_order_management: true } as Tenant

beforeEach(() => {
  jest.clearAllMocks()
  window.localStorage.clear()
  cartState.items = [UPSELL_LINE, PLAIN_LINE]
  cartState.orderType = 'pickup'
  global.fetch = jest.fn(async () => ({ ok: true })) as unknown as typeof fetch
  jest.mocked(preflightCheckoutStockAction).mockResolvedValue({ ok: true })
  jest.mocked(preflightCheckoutAnswersAction).mockResolvedValue({ ok: true })
  jest.mocked(createOrderAction).mockResolvedValue({
    success: true,
    data: { id: 'order-77' },
    trackingToken: 'track-token',
  } as unknown as Awaited<ReturnType<typeof createOrderAction>>)
})

async function tapPlaceOrder(answers: Record<string, string>) {
  // One config for the life of the hook (a new one per render re-seeds the form forever).
  const config = configWith({})
  const hook = renderHook(() => useCheckout({ tenantSlug: 'acme', initialTenant: TENANT_WITH_ORDERS, config }))
  await act(async () => {
    hook.result.current.setCustomerData(answers)
  })
  await act(async () => {
    await hook.result.current.handleCheckout()
  })
  return hook
}

it('asks the server about the answers it is about to send, then places the order', async () => {
  const hook = await tapPlaceOrder({ customer_name: '  Juan   Cruz ', customer_email: 'JUAN@Example.com' })

  expect(preflightCheckoutAnswersAction).toHaveBeenCalledWith('tenant-1', 'pickup', {
    customer_name: 'Juan Cruz',
    customer_email: 'juan@example.com',
  })
  expect(hook.result.current.checkoutComplete).toBe(true)
})

it('stays on the form and marks a question the tab shows when the server now requires it', async () => {
  jest.mocked(preflightCheckoutAnswersAction).mockResolvedValue({
    ok: false,
    message: 'Email is required',
    fieldErrors: [{ fieldName: 'customer_email', message: 'Email is required' }],
  })

  const hook = await tapPlaceOrder({ customer_name: 'Juan', customer_email: '' })

  expect(hook.result.current.checkoutComplete).toBe(false)
  expect(hook.result.current.isProcessing).toBe(false)
  expect(createOrderAction).not.toHaveBeenCalled()
  expect(clearCart).not.toHaveBeenCalled()
  expect(hook.result.current.fieldErrors).toEqual({ customer_email: 'Email is required' })
  expect(hook.result.current.fieldErrorAttempt).toBeGreaterThan(0)
  expect(toast.error).toHaveBeenCalledWith('Email is required')

  // Answering it clears the mark.
  await act(async () => {
    hook.result.current.setCustomerData({ customer_name: 'Juan', customer_email: 'juan@example.com' })
  })
  expect(hook.result.current.fieldErrors).toEqual({})
})

it('asks for a refresh when the server requires a question this tab has never shown', async () => {
  jest.mocked(preflightCheckoutAnswersAction).mockResolvedValue({
    ok: false,
    message: 'Plate number is required',
    fieldErrors: [{ fieldName: 'plate_number', message: 'Plate number is required' }],
  })

  const hook = await tapPlaceOrder({ customer_name: 'Juan' })

  expect(hook.result.current.checkoutComplete).toBe(false)
  expect(createOrderAction).not.toHaveBeenCalled()
  expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/refresh/i))
})
