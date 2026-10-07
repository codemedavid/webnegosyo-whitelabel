/**
 * Characterisation of the full submit path through useCheckout.
 *
 * handleCheckout used to be one ~400-line function; it is now composed of pure
 * builders (src/lib/checkout/*). These tests render the real hook and pin what
 * leaves it — the preflight lines, every positional argument of
 * createOrderAction, the confirmation snapshot, the upsell analytics event, the
 * proactive Messenger send and the tracking hand-off — so a refactor of the
 * internals cannot quietly change any of them.
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
    formFieldsByOrderType: { pickup: [field('pickup', 'customer_name'), field('pickup', 'customer_email', 'email')] },
    paymentMethodsByOrderType: { pickup: [GCASH] },
    outlets: null,
    facebookPageId: 'acme.page',
  }
}

import { useCheckout } from '@/hooks/useCheckout'
import { createOrderAction } from '@/app/actions/orders'
import { preflightCheckoutStockAction } from '@/app/actions/checkout-stock'
import { preflightPresellAction } from '@/app/actions/presell-checkout'
import { trackAnalyticsEventAction } from '@/app/actions/analytics'
import { validateVoucherAction } from '@/app/actions/vouchers'

const fetchMock = jest.fn(async () => ({ ok: true }))

beforeEach(() => {
  jest.clearAllMocks()
  window.localStorage.clear()
  cartState.items = [UPSELL_LINE, PLAIN_LINE]
  cartState.orderType = 'pickup'
  global.fetch = fetchMock as unknown as typeof fetch
  jest.mocked(preflightCheckoutStockAction).mockResolvedValue({ ok: true })
  jest.mocked(createOrderAction).mockResolvedValue({
    success: true,
    data: { id: 'order-77' },
    orderToken: 'order-token',
    trackingToken: 'track+token',
  } as unknown as Awaited<ReturnType<typeof createOrderAction>>)
})

async function submit(config: CheckoutConfig, tenant: Tenant = TENANT) {
  const hook = renderHook(() => useCheckout({ tenantSlug: 'acme', initialTenant: tenant, config }))
  await act(async () => {
    hook.result.current.setCustomerData({ customer_name: '  Juan   Cruz ', customer_email: 'JUAN@Example.com' })
    hook.result.current.setIsSmsOptedIn(true)
    hook.result.current.setPaymentProofReference('REF-1')
  })
  await act(async () => {
    await hook.result.current.handleCheckout()
  })
  // Let the background save and its follow-ups settle.
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  return hook
}

describe('useCheckout submit — Messenger order', () => {
  const config = configWith({ messenger_enabled: true })

  it('asks the stock preflight about every cart line, and skips the presell one for a non-presell cart', async () => {
    await submit(config)

    expect(preflightPresellAction).not.toHaveBeenCalled()
    expect(preflightCheckoutStockAction).toHaveBeenCalledWith(
      'tenant-1',
      [{ menuItemId: 'm1', quantity: 2 }, { menuItemId: 'm2', quantity: 1 }],
      null,
    )
  })

  it('sends createOrderAction exactly the payload it always has', async () => {
    await submit(config)

    expect(createOrderAction).toHaveBeenCalledTimes(1)
    const args = jest.mocked(createOrderAction).mock.calls[0] as unknown[]
    expect(args).toEqual([
      'tenant-1',
      [
        {
          menu_item_id: 'm1',
          menu_item_name: 'Adobo',
          variation: 'Large',
          addons: ['Egg ×2'],
          quantity: 2,
          price: 150,
          subtotal: 300,
          special_instructions: 'no onions',
          option_ids: ['v1'],
          addon_ids: ['a1'],
          addon_quantities: { a1: 2 },
          isUpsellItem: true,
        },
        {
          menu_item_id: 'm2',
          menu_item_name: 'Rice',
          variation: undefined,
          addons: [],
          quantity: 1,
          price: 30,
          subtotal: 30,
          special_instructions: undefined,
          option_ids: [],
          addon_ids: [],
        },
      ],
      { name: 'Juan Cruz', contact: 'juan@example.com' },
      'pickup',
      expect.objectContaining({
        customer_name: 'Juan Cruz',
        customer_email: 'juan@example.com',
        messenger_psid: 'psid-9',
      }),
      undefined,
      undefined,
      'gcash',
      'GCash',
      '0917 000 0000',
      'https://qr.example/g.png',
      undefined,
      undefined,
      { url: null, publicId: null, reference: 'REF-1' },
      undefined,
      [],
      expect.any(String),
      undefined,
    ])
    expect(args[4]).not.toHaveProperty('scheduled_for')
  })

  it('freezes the confirmation snapshot before the cart is cleared', async () => {
    const { result } = await submit(config)

    expect(clearCart).toHaveBeenCalledTimes(1)
    expect(result.current.checkoutComplete).toBe(true)
    const snapshot = result.current.completedOrderData
    expect(snapshot).toEqual(expect.objectContaining({
      items: [UPSELL_LINE, PLAIN_LINE],
      total: 330,
      deliveryFee: null,
      serviceChargeAmount: 0,
      discounts: [],
      customerData: { customer_name: 'Juan Cruz', customer_email: 'juan@example.com' },
      orderTypeName: 'pickup name',
      scheduledForLabel: null,
      paymentMethodName: 'GCash',
      paymentMethodDetails: '0917 000 0000',
      formFields: [
        { field_name: 'customer_name', field_label: 'customer_name label' },
        { field_name: 'customer_email', field_label: 'customer_email label' },
      ],
    }))
    expect(snapshot?.messengerUrl).toMatch(/^https:\/\/m\.me\/acme\.page\?text=/)
    expect(snapshot?.messengerMessage).toContain('Adobo')
  })

  it('reports upsell conversions, sends the order to Messenger and remembers it for tracking', async () => {
    const { result } = await submit(config)

    expect(trackAnalyticsEventAction).toHaveBeenCalledWith('tenant-1', 'upsell_converted', {
      orderId: 'order-77',
      upsellItemCount: 1,
      upsellRevenue: 300,
      sources: { post_add: 1 },
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/messenger/send-order-public', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ orderId: 'order-77', tenantId: 'tenant-1', orderToken: 'order-token' }),
    }))
    expect(result.current.trackingOrderId).toBe('order-77')
    expect(result.current.trackingToken).toBe('track+token')
    expect(window.localStorage.length).toBe(1)
    // A Messenger hand-off keeps the thank-you screen.
    expect(ROUTER.replace).not.toHaveBeenCalled()
  })

  it('reuses one client order id for the life of the checkout', async () => {
    jest.mocked(createOrderAction).mockResolvedValueOnce({ success: false, error: 'boom' } as never)
    const { result } = await submit(config)
    const firstId = (jest.mocked(createOrderAction).mock.calls[0] as unknown[])[16]

    await act(async () => {
      await result.current.handleCheckout()
    })
    const secondId = (jest.mocked(createOrderAction).mock.calls.at(-1) as unknown[])[16]
    expect(typeof firstId).toBe('string')
    expect(secondId).toBe(firstId)
  })
})

describe('useCheckout submit — direct-mode Messenger', () => {
  it('opens the page without a prefilled message and never sends the order proactively', async () => {
    const { result } = await submit(configWith({ messenger_enabled: true }), {
      ...TENANT,
      messenger_redirect_mode: 'direct',
    } as Tenant)

    expect(result.current.completedOrderData?.messengerUrl).toBe('https://www.messenger.com/t/acme.page')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('useCheckout submit — no Messenger', () => {
  it('builds no Messenger link and goes straight to live tracking once saved', async () => {
    const { result } = await submit(configWith({ messenger_enabled: false }))

    expect(result.current.completedOrderData?.messengerUrl).toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(ROUTER.replace).toHaveBeenCalledWith('/acme/order/order-77?t=track%2Btoken')
  })
})

describe('useCheckout submit — QR hand-off', () => {
  // Hoisted: the page hands the hook ONE config object, never a fresh one per render.
  const config = configWith({})
  const tenant = { ...TENANT, qr_handoff_enabled: true } as Tenant

  it('stores the pending order, clears the cart and opens the QR page', async () => {
    const { result } = renderHook(() => useCheckout({ tenantSlug: 'acme', initialTenant: tenant, config }))
    await act(async () => {
      result.current.setCustomerData({ customer_name: 'Juan', customer_email: 'juan@example.com' })
    })

    await act(async () => {
      await result.current.handleQrHandoff()
    })

    expect(createOrderAction).not.toHaveBeenCalled()
    expect(clearCart).toHaveBeenCalledTimes(1)
    expect(ROUTER.push).toHaveBeenCalledWith(expect.stringMatching(/^\/acme\/order\/qr\/[0-9a-f-]{36}$/))
    const stored = Object.keys(window.localStorage).find(key => key.includes('acme'))
    expect(stored).toBeDefined()
  })
})

describe('useCheckout submit — applied voucher', () => {
  const config = configWith({ messenger_enabled: false })

  it('does not re-price the voucher against the emptied cart behind the confirmation', async () => {
    jest.mocked(validateVoucherAction).mockResolvedValue({
      success: true,
      data: { accepted: [{ code: 'TEN', name: 'TEN', amount: 10 }], rejected: [], discountTotal: 10, deliveryDiscount: 0 },
    } as never)
    const { result } = renderHook(() => useCheckout({ tenantSlug: 'acme', initialTenant: TENANT, config }))
    await act(async () => {
      result.current.setCustomerData({ customer_name: 'Juan', customer_email: 'juan@example.com' })
      result.current.setPaymentProofReference('REF-1')
    })
    await act(async () => {
      await result.current.applyVoucherCode('TEN')
    })
    expect(validateVoucherAction).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.handleCheckout()
    })
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(result.current.checkoutComplete).toBe(true)
    expect(result.current.completedOrderData?.discounts).toEqual([expect.objectContaining({ amount: 10 })])
    expect((jest.mocked(createOrderAction).mock.calls[0] as unknown[])[15]).toEqual(['TEN'])
    expect(validateVoucherAction).toHaveBeenCalledTimes(1)
  })
})
