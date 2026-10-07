/**
 * The checkout must judge an order the way the server bills and accepts it.
 *
 * 1. Pre-launch. `isOrderingClosed` exempted every scheduled order, but the
 *    server (`getClosedOrderError`) refuses a pre-launch store's scheduled
 *    orders too. The checkout rendered "Order Placed!" optimistically and the
 *    save was refused behind it — the preflight must trip first.
 * 2. Service charge. The hook carried its own copy of the formula; the server
 *    bills `computeServiceCharge(orderType, itemsSubtotal)`. The copy did not
 *    round a fixed charge and passed a negative one straight through, so the
 *    summary could show a figure the customer is never billed.
 *
 * Imports of the module under test are lazy: in this repo `jest.mock` is not
 * hoisted above static imports.
 */
import { act, renderHook } from '@testing-library/react'
import type { CheckoutConfig } from '@/lib/checkout/checkout-config'
import type { CartItem, CustomerFormField, OrderType, PaymentMethod, Tenant } from '@/types/database'

const CART_TOTAL = 330

const LINE = {
  id: 'l1',
  menu_item: { id: 'm1', name: 'Adobo', price: 165 },
  selected_addons: [],
  quantity: 2,
  subtotal: CART_TOTAL,
} as unknown as CartItem

const CART_ITEMS: CartItem[] = [LINE]
const NO_BUNDLES: never[] = []

jest.mock('@/hooks/useCart', () => ({
  useCart: () => ({
    isHydrated: true,
    items: CART_ITEMS,
    bundleItems: NO_BUNDLES,
    total: CART_TOTAL,
    clearCart: jest.fn(),
    orderType: 'pickup',
    setOrderType: jest.fn(),
    messengerPsid: null,
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
jest.mock('@/app/actions/checkout-stock', () => ({ preflightCheckoutStockAction: jest.fn(async () => ({ ok: true })) }))
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

const CASH = { id: 'cash', name: 'Cash', details: null, qr_code_url: null } as unknown as PaymentMethod

function configWith(pickup: Partial<OrderType>): CheckoutConfig {
  return {
    orderTypes: [{ id: 'pickup', type: 'pickup', name: 'Pickup', ...pickup } as unknown as OrderType],
    formFieldsByOrderType: {
      pickup: [{ id: 'f1', order_type_id: 'pickup', field_name: 'customer_name', field_label: 'Name', field_type: 'text' } as unknown as CustomerFormField],
    },
    paymentMethodsByOrderType: { pickup: [CASH] },
    outlets: null,
    facebookPageId: 'acme.page',
  }
}

async function renderCheckout(config: CheckoutConfig, tenant: Tenant = TENANT) {
  const { useCheckout } = await import('@/hooks/useCheckout')
  const hook = renderHook(() => useCheckout({ tenantSlug: 'acme', initialTenant: tenant, config }))
  // Let mount effects settle (open status, order type, schedule seeding).
  await act(async () => {
    await Promise.resolve()
  })
  return hook
}

beforeEach(() => {
  jest.clearAllMocks()
  window.localStorage.clear()
  global.fetch = jest.fn(async () => ({ ok: true })) as unknown as typeof fetch
})

describe('useCheckout — a pre-launch store refuses scheduled orders too', () => {
  test('a scheduled checkout on a pre-launch store is blocked before any optimistic confirmation', async () => {
    const { toast } = await import('sonner')
    const { createOrderAction } = await import('@/app/actions/orders')
    const { STORE_PRELAUNCH_MESSAGE } = await import('@/lib/store-open-status')

    // Schedule-only pickup: the checkout opens in scheduled mode with a slot seeded.
    const hook = await renderCheckout(
      configWith({ advance_order_enabled: true, advance_order_allow_asap: false } as Partial<OrderType>),
      { ...TENANT, is_prelaunch: true } as unknown as Tenant,
    )
    expect(hook.result.current.isScheduling).toBe(true)

    await act(async () => {
      hook.result.current.setCustomerData({ customer_name: 'Juan' })
      hook.result.current.setSelectedPaymentMethod('cash')
    })
    await act(async () => {
      await hook.result.current.handleCheckout()
    })

    expect(toast.error).toHaveBeenCalledWith(STORE_PRELAUNCH_MESSAGE)
    expect(createOrderAction).not.toHaveBeenCalled()
    expect(hook.result.current.checkoutComplete).toBe(false)
  })
})

describe('useCheckout — the displayed service charge is the billed one', () => {
  test.each([
    ['a fractional fixed charge', { service_charge_type: 'fixed', service_charge_value: 12.345 }],
    ['a negative fixed charge', { service_charge_type: 'fixed', service_charge_value: -50 }],
    ['a string fixed charge', { service_charge_type: 'fixed', service_charge_value: '25' }],
    ['a percentage charge', { service_charge_type: 'percentage', service_charge_value: 10 }],
  ])('%s matches computeServiceCharge on the item subtotal', async (_label, rule) => {
    const { computeServiceCharge } = await import('@/lib/order-service-charge')
    const pickup = { service_charge_enabled: true, ...rule } as unknown as Partial<OrderType>

    const hook = await renderCheckout(configWith(pickup))

    // The server bills against the server-priced ITEM subtotal (the cart total
    // here), before discounts and without the delivery fee.
    const billed = computeServiceCharge(pickup as Parameters<typeof computeServiceCharge>[0], CART_TOTAL)
    expect(hook.result.current.serviceChargeAmount).toBe(billed)
    expect(typeof hook.result.current.serviceChargeAmount).toBe('number')
  })
})
