/**
 * useCheckout now renders from server-read data. These pin the behaviours the
 * browser fetch chain used to get wrong or leave slow:
 *  - nothing is fetched on mount;
 *  - the customer's chosen order type survives a hard refresh (the old chain
 *    resolved it from a closure captured BEFORE the cart was read from
 *    storage, and replaced it with the tenant's first order type);
 *  - switching order type keeps what the customer already typed;
 *  - the payment selection follows the order type;
 *  - only the newest voucher check may write its answer.
 */
import { act, renderHook } from '@testing-library/react'
import type { CheckoutConfig } from '@/lib/checkout/checkout-config'
import type { CustomerFormField, OrderType, PaymentMethod, Tenant } from '@/types/database'

const cartState = {
  isHydrated: false,
  items: [{ id: 'l1', menu_item: { id: 'm1', name: 'Adobo', price: 100 }, selected_addons: [], quantity: 1, subtotal: 100 }],
  orderType: null as string | null,
}
const setOrderType = jest.fn((next: string | null) => {
  cartState.orderType = next
})
const clearCart = jest.fn()
const NO_BUNDLES: never[] = []

jest.mock('@/hooks/useCart', () => ({
  useCart: () => ({
    isHydrated: cartState.isHydrated,
    items: cartState.items,
    bundleItems: NO_BUNDLES,
    total: 100,
    clearCart,
    orderType: cartState.orderType,
    setOrderType,
    messengerPsid: null,
  }),
}))

const ROUTER = { push: jest.fn(), replace: jest.fn() }
const SEARCH_PARAMS = new URLSearchParams()
jest.mock('next/navigation', () => ({
  useRouter: () => ROUTER,
  useSearchParams: () => SEARCH_PARAMS,
  usePathname: () => '/acme/checkout',
}))

const fetchActiveOutlets = jest.fn(async () => [])
jest.mock('@/lib/outlets/outlets-client', () => ({ fetchActiveOutlets: () => fetchActiveOutlets() }))
jest.mock('@/app/actions/orders', () => ({ createOrderAction: jest.fn() }))
const validateVoucherAction = jest.fn()
jest.mock('@/app/actions/vouchers', () => ({
  validateVoucherAction: (...args: unknown[]) => validateVoucherAction(...args),
}))
jest.mock('@/app/actions/checkout-stock', () => ({ preflightCheckoutStockAction: jest.fn() }))
jest.mock('@/app/actions/presell-checkout', () => ({ preflightPresellAction: jest.fn() }))
jest.mock('@/app/actions/analytics', () => ({ trackAnalyticsEventAction: jest.fn() }))
jest.mock('@/app/actions/lalamove', () => ({ createQuotationAction: jest.fn() }))
jest.mock('@/app/actions/delivery', () => ({ calculateDistanceDeliveryFeeAction: jest.fn() }))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))

const TENANT = { id: 'tenant-1', slug: 'acme', name: 'Acme' } as unknown as Tenant

const orderType = (id: string, type: string): OrderType => ({ id, type, name: id }) as unknown as OrderType
const field = (orderTypeId: string, fieldName: string): CustomerFormField =>
  ({ id: `${orderTypeId}-${fieldName}`, order_type_id: orderTypeId, field_name: fieldName, field_label: fieldName }) as unknown as CustomerFormField
const method = (id: string): PaymentMethod => ({ id, name: id }) as unknown as PaymentMethod

const CONFIG: CheckoutConfig = {
  orderTypes: [orderType('pickup', 'pickup'), orderType('delivery', 'delivery')],
  formFieldsByOrderType: {
    pickup: [field('pickup', 'customer_name'), field('pickup', 'customer_phone')],
    delivery: [field('delivery', 'customer_name'), field('delivery', 'delivery_address')],
  },
  paymentMethodsByOrderType: {
    pickup: [method('cash')],
    delivery: [method('cash'), method('gcash')],
  },
  outlets: null,
  facebookPageId: null,
}

// Imported after the mocks so the hook picks them up.
import { useCheckout } from '@/hooks/useCheckout'
import { preflightCheckoutStockAction } from '@/app/actions/checkout-stock'
import { createQuotationAction } from '@/app/actions/lalamove'
import { toast } from 'sonner'

function renderCheckout(tenant = TENANT) {
  return renderHook(() => useCheckout({ tenantSlug: 'acme', initialTenant: tenant, config: CONFIG }))
}

beforeEach(() => {
  jest.clearAllMocks()
  cartState.isHydrated = false
  cartState.orderType = null
  setOrderType.mockClear()
  ROUTER.push.mockClear()
  fetchActiveOutlets.mockClear()
  window.localStorage.clear()
})

describe('useCheckout with server-read data', () => {
  it('stays loading until the cart has been read from storage, and never redirects meanwhile', () => {
    const { result } = renderCheckout()

    expect(result.current.isLoading).toBe(true)
    expect(setOrderType).not.toHaveBeenCalled()
    expect(ROUTER.push).not.toHaveBeenCalled()
  })

  it('keeps the order type the customer chose once the cart hydrates (hard refresh)', () => {
    const { result, rerender } = renderCheckout()

    // The cart provider reads storage after the page's own first effects.
    cartState.orderType = 'delivery'
    cartState.isHydrated = true
    rerender()

    expect(result.current.isLoading).toBe(false)
    expect(setOrderType).not.toHaveBeenCalled()
    expect(result.current.orderType).toBe('delivery')
    expect(result.current.formFields.map((f) => f.field_name)).toEqual(['customer_name', 'delivery_address'])
  })

  it('replaces an order type that belongs to another store with this store’s first', () => {
    const { rerender } = renderCheckout()

    cartState.orderType = 'other-store-order-type'
    cartState.isHydrated = true
    rerender()

    expect(setOrderType).toHaveBeenCalledWith('pickup')
  })

  it('keeps what the customer typed when they switch order type', () => {
    cartState.orderType = 'pickup'
    cartState.isHydrated = true
    const { result, rerender } = renderCheckout()

    act(() => {
      result.current.setCustomerData({ customer_name: 'Ana', customer_phone: '09171234567' })
    })
    act(() => {
      result.current.setOrderType('delivery')
    })
    rerender()

    expect(result.current.customerData).toEqual({ customer_name: 'Ana', delivery_address: '' })
  })

  it('preselects a sole payment method and drops a choice the next order type does not offer', () => {
    cartState.orderType = 'delivery'
    cartState.isHydrated = true
    const { result, rerender } = renderCheckout()

    expect(result.current.selectedPaymentMethod).toBeNull()
    act(() => result.current.setSelectedPaymentMethod('gcash'))
    expect(result.current.selectedPaymentMethod).toBe('gcash')

    act(() => result.current.setOrderType('pickup'))
    rerender()

    expect(result.current.paymentMethods.map((m) => m.id)).toEqual(['cash'])
    expect(result.current.selectedPaymentMethod).toBe('cash')
  })

  it('does not fetch branches for a single-location tenant', () => {
    cartState.isHydrated = true
    renderCheckout()

    expect(fetchActiveOutlets).not.toHaveBeenCalled()
  })
})

describe('Lalamove checkout', () => {
  const deliveryTenant = {
    ...TENANT,
    lalamove_enabled: true,
    restaurant_latitude: 14.6,
    restaurant_longitude: 121,
  }

  it('does not open payment details without a delivery quotation', () => {
    cartState.orderType = 'delivery'
    cartState.isHydrated = true
    const { result } = renderCheckout({
      ...TENANT,
      lalamove_enabled: true,
      restaurant_latitude: 14.6,
      restaurant_longitude: 121,
    })
    act(() => result.current.setSelectedPaymentMethod('cash'))

    act(() => result.current.handleProceedToPayment())

    expect(result.current.showPaymentDetails).toBe(false)
    expect(clearCart).not.toHaveBeenCalled()
  })

  it.each(['handleCheckout', 'handleQrHandoff'] as const)('blocks %s without a quotation before changing the cart', async (handler) => {
    cartState.orderType = 'delivery'
    cartState.isHydrated = true
    const { result } = renderCheckout(deliveryTenant)

    await act(async () => { await result.current[handler]() })

    expect(preflightCheckoutStockAction).not.toHaveBeenCalled()
    expect(clearCart).not.toHaveBeenCalled()
    expect(result.current.checkoutComplete).toBe(false)
  })

  it('keeps a quoted Lalamove delivery out of the QR flow that cannot carry its booking details', async () => {
    cartState.orderType = 'delivery'
    cartState.isHydrated = true
    jest.mocked(createQuotationAction).mockResolvedValueOnce({
      success: true,
      data: { quotationId: 'quote-1', price: 80, currency: 'PHP', expiresAt: new Date(Date.now() + 300_000), quoteSignature: 'signed-quote' },
    })
    const { result } = renderCheckout({ ...deliveryTenant, qr_handoff_enabled: true })
    await act(async () => result.current.setCustomerData({ delivery_address: 'Manila', delivery_lat: '14.7', delivery_lng: '121.1' }))

    await act(async () => result.current.handleQrHandoff())

    expect(clearCart).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/QR.*Lalamove|Lalamove.*QR/i))
  })

  it('rechecks expiry on submit even when a background tab has not run its timers', async () => {
    jest.useFakeTimers()
    cartState.orderType = 'delivery'
    cartState.isHydrated = true
    jest.mocked(createQuotationAction).mockResolvedValueOnce({
      success: true,
      data: { quotationId: 'quote-1', price: 80, currency: 'PHP', expiresAt: new Date(Date.now() + 300_000), quoteSignature: 'signed-quote' },
    })
    const { result, unmount } = renderCheckout(deliveryTenant)
    await act(async () => {
      result.current.setSelectedPaymentMethod('cash')
      result.current.setCustomerData({ delivery_address: 'Manila', delivery_lat: '14.7', delivery_lng: '121.1' })
    })
    expect(result.current.deliveryFee).toBe(80)
    jest.setSystemTime(Date.now() + 300_001)

    act(() => result.current.handleProceedToPayment())

    expect(result.current.showPaymentDetails).toBe(false)
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/expired/i))
    unmount()
    jest.useRealTimers()
  })
})

describe('voucher checks', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((r) => (resolve = r))
    return { promise, resolve }
  }

  const preview = (code: string, amount: number) => ({
    success: true,
    data: { accepted: [{ code, name: code, amount }], rejected: [], discountTotal: amount, deliveryDiscount: 0 },
  })

  it('ignores a slower reply for an older set of codes', async () => {
    cartState.orderType = 'pickup'
    cartState.isHydrated = true
    const first = deferred<ReturnType<typeof preview>>()
    const second = deferred<ReturnType<typeof preview>>()
    validateVoucherAction.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result } = renderCheckout()

    await act(async () => {
      void result.current.applyVoucherCode('AAA')
    })
    await act(async () => {
      void result.current.applyVoucherCode('BBB')
    })
    // The newer request answers first; the older one straggles in after it.
    await act(async () => second.resolve(preview('BBB', 20)))
    await act(async () => first.resolve(preview('AAA', 10)))

    expect(result.current.voucherCodes).toEqual(['AAA', 'BBB'])
    expect(result.current.voucherPreview).toEqual(preview('BBB', 20).data)
    expect(result.current.isCheckingVoucher).toBe(false)
  })

  it('clears the spinner when the check throws', async () => {
    cartState.orderType = 'pickup'
    cartState.isHydrated = true
    validateVoucherAction.mockRejectedValueOnce(new Error('network down'))
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const { result } = renderCheckout()

    await act(async () => {
      await result.current.applyVoucherCode('AAA')
    })

    expect(result.current.isCheckingVoucher).toBe(false)
  })
})
