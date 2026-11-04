/**
 * `placeOrder` is the order engine behind both the web checkout
 * (`createOrderAction`) and the customer app. Its answer is a union the app
 * API maps without guessing:
 *
 *  - `refused` — the store said no on purpose (customer copy);
 *  - `lost`    — the write broke; the order may not exist;
 *  - `placed`  — with the backend that wrote it, whether a retry deduped onto
 *    the first order, and the server-priced figures the order was saved with.
 *
 * `channel: 'app'` is the only difference an app order carries: it is stored
 * as `orders.source = 'mobile'` (Reports: "Customer app"), never as a key a
 * client could put in customerData.
 *
 * Scaffold mirrors tests/unit/actions/create-order-presell-claim-release.test.ts.
 * jest.mock is NOT hoisted in this runner, so the engine is imported lazily.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const TENANT_ID = 'tenant-1'
const ORDER_TYPE_ID = 'ot-1'
const MENU_ITEM_ID = 'mi-1'

let tableRows: Record<string, unknown> = {}

function makeQuery(table: string) {
  const result = { data: tableRows[table] ?? null, error: null }
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    single: async () => result,
    maybeSingle: async () => result,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  }
  return chain
}

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => makeQuery(table),
  }),
}))

jest.mock('@/lib/tenant-secrets', () => ({
  getTenantSecrets: async () => ({ convex_deploy_key: 'deploy-key' }),
}))

jest.mock('@/lib/inventory/checkout-stock-guard', () => ({
  findCheckoutStockShortfallMessage: async () => null,
}))

jest.mock('@/lib/presell/order-claim', () => ({
  claimPresellForOrder: async () => ({ ok: true, lines: [] }),
  releasePresellForOrder: async () => {},
}))

const createOrder = jest.fn()
const createOrderConvex = jest.fn()

jest.mock('@/lib/orders-service', () => ({
  getOrdersByTenant: async () => [],
  getOrderById: async () => null,
  updateOrderStatus: async () => null,
  getOrderStats: async () => null,
  createOrder: (...args: unknown[]) => (createOrder as unknown as (...a: unknown[]) => unknown)(...args),
  createOrderConvex: (...args: unknown[]) =>
    (createOrderConvex as unknown as (...a: unknown[]) => unknown)(...args),
}))

jest.mock('@/lib/vouchers/order-pricing', () => ({
  priceOrderWithVouchers: async () => ({
    application: { discountLines: [] },
    discountPayload: null,
    redemptions: [],
  }),
}))

jest.mock('@/lib/vouchers/repository', () => ({ createVoucherLookup: () => ({}) }))

jest.mock('@/lib/vouchers/order-voucher-flow', () => ({
  burnRedemptions: async () => ({ failures: [] }),
  loadCategoryMap: async () => ({}),
}))

function tenant(overrides: Record<string, unknown> = {}) {
  return {
    order_backend: 'platform',
    is_active: true,
    name: 'Island Silog',
    slug: 'island-silog',
    inventory_enabled: false,
    convex_deployment_url: null,
    multi_branch_enabled: false,
    lalamove_enabled: false,
    distance_delivery_enabled: false,
    email_notifications_enabled: false,
    ...overrides,
  }
}

const tapsilog = { id: MENU_ITEM_ID, name: 'Tapsilog', price: 160, discounted_price: null, is_available: true }

function line(overrides: Record<string, unknown> = {}) {
  return {
    menu_item_id: MENU_ITEM_ID,
    menu_item_name: 'Tapsilog',
    addons: [] as string[],
    quantity: 2,
    // A forged price: the engine must answer with the store's own.
    price: 1,
    subtotal: 2,
    ...overrides,
  }
}

type PlaceOrderInput = import('@/lib/checkout/place-order').PlaceOrderInput

async function place(overrides: Partial<PlaceOrderInput> = {}) {
  const { placeOrder } = await import('@/lib/checkout/place-order')
  return placeOrder({
    tenantId: TENANT_ID,
    items: [line()],
    customerInfo: { name: 'Ana', contact: '09171234567' },
    orderTypeId: ORDER_TYPE_ID,
    ...overrides,
  })
}

/** The parity options (last, 17th argument) the platform writer received. */
const platformParityOptions = () => (createOrder.mock.calls[0] as unknown[])[16] as Record<string, unknown>
/** The source (17th argument) the Convex writer received. */
const convexSource = () => (createOrderConvex.mock.calls[0] as unknown[])[16]

describe('placeOrder — result kinds', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    tableRows = {
      tenants: tenant(),
      order_types: { id: ORDER_TYPE_ID, type: 'pickup', name: 'Pickup', available_on_web: true },
      menu_items: [tapsilog],
    }
    createOrder.mockImplementation(async () => ({ order: { id: 'order-1', total: 320 }, orderToken: 'tok' }))
    createOrderConvex.mockImplementation(async () => ({ order: { id: 'cx-1' }, orderToken: undefined }))
  })

  test('refuses an invalid tenant id before reading anything', async () => {
    const result = await place({ tenantId: '' })

    expect(result).toEqual({ kind: 'refused', error: 'Invalid tenant ID' })
    expect(createOrder).not.toHaveBeenCalled()
  })

  test('refuses malformed lines', async () => {
    const result = await place({ items: [line({ quantity: -3 })] })

    expect(result.kind).toBe('refused')
    expect(createOrder).not.toHaveBeenCalled()
  })

  test('refuses an inactive or unknown store', async () => {
    tableRows = { ...tableRows, tenants: null }

    const result = await place()

    expect(result).toEqual({ kind: 'refused', error: 'Restaurant not found or is currently inactive' })
  })

  test('places a platform order with the server-priced lines and figures', async () => {
    const result = await place()

    expect(result.kind).toBe('placed')
    if (result.kind !== 'placed') return
    expect(result.backend).toBe('platform')
    expect(result.deduped).toBe(false)
    expect(result.order.id).toBe('order-1')
    expect(result.orderToken).toBe('tok')
    expect(result.lines).toEqual([
      expect.objectContaining({ menu_item_id: MENU_ITEM_ID, name: 'Tapsilog', quantity: 2, price: 160, subtotal: 320 }),
    ])
    expect(result.pricing).toEqual({
      itemsSubtotal: 320,
      discountTotal: 0,
      serviceCharge: 0,
      deliveryFee: 0,
      total: 320,
    })
  })

  test('reports a platform retry that deduped onto the first order', async () => {
    createOrder.mockImplementation(async () => ({
      order: { id: 'order-1', total: 320 },
      orderToken: 'tok',
      deduped: true,
    }))

    const result = await place({ clientOrderId: 'attempt-1' })

    expect(result).toEqual(expect.objectContaining({ kind: 'placed', deduped: true, backend: 'platform' }))
    expect(platformParityOptions()).toEqual(expect.objectContaining({ clientOrderId: 'attempt-1' }))
  })

  test('reports a Convex store as written by Convex', async () => {
    tableRows = { ...tableRows, tenants: tenant({ order_backend: 'convex', convex_deployment_url: 'https://cx.example' }) }

    const result = await place()

    expect(result).toEqual(expect.objectContaining({ kind: 'placed', backend: 'convex', deduped: false }))
    expect(createOrder).not.toHaveBeenCalled()
  })

  test('answers lost, with the generic copy, when the backend write throws', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    createOrder.mockImplementation(async () => {
      throw Object.assign(new Error('permission denied'), { code: '42501' })
    })

    const result = await place()

    expect(result).toEqual({
      kind: 'lost',
      error: 'We could not save your order. Please try again or contact the store.',
    })
    expect(consoleError).toHaveBeenCalledWith(
      '[createOrderAction] ORDER LOST — creation threw',
      expect.objectContaining({ tenantId: TENANT_ID, code: '42501' })
    )
    consoleError.mockRestore()
  })
})

describe('placeOrder — channel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    tableRows = {
      tenants: tenant(),
      order_types: { id: ORDER_TYPE_ID, type: 'pickup', name: 'Pickup', available_on_web: true },
      menu_items: [tapsilog],
    }
    createOrder.mockImplementation(async () => ({ order: { id: 'order-1', total: 320 }, orderToken: 'tok' }))
    createOrderConvex.mockImplementation(async () => ({ order: { id: 'cx-1' }, orderToken: undefined }))
  })

  test('an app order is stored with source mobile on the platform', async () => {
    await place({ channel: 'app' })

    expect(platformParityOptions().source).toBe('mobile')
  })

  test('a web order keeps source web — also when no channel is given', async () => {
    await place({ channel: 'web' })
    expect(platformParityOptions().source).toBe('web')

    createOrder.mockClear()
    await place()
    expect(platformParityOptions().source).toBe('web')
  })

  test('an app order is stored with source mobile on Convex', async () => {
    tableRows = { ...tableRows, tenants: tenant({ order_backend: 'convex', convex_deployment_url: 'https://cx.example' }) }

    await place({ channel: 'app' })

    expect(convexSource()).toBe('mobile')
  })

  test('a client cannot claim a channel through customerData', async () => {
    // Nothing in the blob decides the channel: it rides through as data and
    // the stored source stays the server's.
    await place({ customerData: { source: 'mobile', order_channel: 'app' } })

    expect(platformParityOptions().source).toBe('web')
  })
})
