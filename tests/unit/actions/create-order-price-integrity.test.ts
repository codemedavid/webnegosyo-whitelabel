/**
 * `createOrderAction` is a public server action. Everything the browser sends
 * is a claim, and every money-bearing claim must be re-derived on the server:
 *
 *  - a NaN / string price used to walk past the price floor and keep the
 *    client's subtotal, so a cart could be checked out for ₱0;
 *  - the minimum-order gate summed the CLIENT subtotals, before any line was
 *    re-priced, so a forged subtotal carried a small cart over it;
 *  - `serviceChargeAmount` was stored as sent — a negative one was a discount;
 *  - a negative or NaN delivery fee was stored as sent;
 *  - options and add-ons were never priced, so "Large + Extra cheese" at the
 *    base price was accepted;
 *  - presell / discount keys in customerData survived when the cart had no
 *    presell lines, and a cancel then released claims that never existed.
 *
 * Scaffold mirrors create-order-presell-claim-release.test.ts. jest.mock is NOT
 * hoisted in this runner, so the module under test is imported lazily.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const TENANT_ID = 'tenant-1'
const ORDER_TYPE_ID = 'ot-1'

let tableRows: Record<string, unknown> = {}
const fromCalls: string[] = []

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
    from: (table: string) => {
      fromCalls.push(table)
      return makeQuery(table)
    },
  }),
}))

jest.mock('@/lib/tenant-secrets', () => ({ getTenantSecrets: async () => null }))

jest.mock('@/lib/inventory/checkout-stock-guard', () => ({
  findCheckoutStockShortfallMessage: async () => null,
}))

jest.mock('@/lib/presell/order-claim', () => ({
  claimPresellForOrder: async () => ({ ok: true, lines: [] }),
  releasePresellForOrder: async () => {},
}))

jest.mock('@/lib/loyverse/push-service', () => ({
  pushOrderToLoyverseBestEffort: async () => {},
}))

const createOrder = jest.fn(async () => ({ order: { id: 'order-1' }, orderToken: 'tok' }))

jest.mock('@/lib/orders-service', () => ({
  getOrdersByTenant: async () => [],
  getOrderById: async () => null,
  updateOrderStatus: async () => null,
  getOrderStats: async () => null,
  createOrder: (...args: unknown[]) => (createOrder as unknown as (...a: unknown[]) => unknown)(...args),
  createOrderConvex: async () => {
    throw new Error('not used')
  },
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

function platformTenant(overrides: Record<string, unknown> = {}) {
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

const tapsilog = {
  id: 'mi-1',
  name: 'Tapsilog',
  price: 160,
  discounted_price: null,
  is_available: true,
  variations: [
    { id: 'v-reg', name: 'Regular', price_modifier: 0 },
    { id: 'v-large', name: 'Large', price_modifier: 40 },
  ],
  addons: [{ id: 'a-egg', name: 'Egg', price: 20 }],
  variation_types: [],
  modifier_groups: [],
}

const pickup = { id: ORDER_TYPE_ID, name: 'Pickup', type: 'pickup', available_on_web: true, minimum_order_amount: 0 }

function line(overrides: Record<string, unknown> = {}) {
  return {
    menu_item_id: 'mi-1',
    menu_item_name: 'Tapsilog',
    addons: [] as string[],
    quantity: 2,
    price: 160,
    subtotal: 320,
    option_ids: [] as string[],
    addon_ids: [] as string[],
    ...overrides,
  }
}

type Reply = { success: boolean; refused?: boolean; error?: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyArgs = any[]

async function place(args: AnyArgs): Promise<Reply> {
  const { createOrderAction } = await import('@/app/actions/orders')
  return (await (createOrderAction as unknown as (...a: AnyArgs) => Promise<Reply>)(...args)) as Reply
}

/** Positional arguments of createOrderAction, by name, so tests read clearly. */
function orderArgs(over: {
  items?: unknown[]
  orderTypeId?: string
  customerData?: Record<string, unknown>
  deliveryFee?: number
  lalamoveQuotationId?: string
  serviceChargeAmount?: number
  scheduledForISO?: string
  paymentProof?: unknown
} = {}): AnyArgs {
  return [
    TENANT_ID,
    over.items ?? [line()],
    { name: 'Ana', contact: '09171234567' },
    over.orderTypeId ?? ORDER_TYPE_ID,
    over.customerData,
    over.deliveryFee,
    over.lalamoveQuotationId,
    undefined,
    undefined,
    undefined,
    undefined,
    over.serviceChargeAmount,
    over.scheduledForISO,
    over.paymentProof,
  ]
}

const savedArg = (index: number) => (createOrder.mock.calls[0] as unknown[])[index]
const savedItems = () => savedArg(1) as Array<Record<string, unknown>>

describe('createOrderAction — price integrity', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    fromCalls.length = 0
    tableRows = { tenants: platformTenant(), order_types: pickup, menu_items: [tapsilog] }
  })

  test('refuses a NaN price instead of saving a free line', async () => {
    const result = await place(orderArgs({ items: [line({ price: Number.NaN, subtotal: 0 })] }))

    expect(result).toMatchObject({ success: false, refused: true })
    expect(createOrder).not.toHaveBeenCalled()
  })

  test('refuses a string price', async () => {
    const result = await place(orderArgs({ items: [line({ price: '1' })] }))

    expect(result.refused).toBe(true)
    expect(createOrder).not.toHaveBeenCalled()
  })

  test('derives every subtotal on the server', async () => {
    await place(orderArgs({ items: [line({ subtotal: 1 })] }))

    expect(savedItems()[0]).toMatchObject({ price: 160, quantity: 2, subtotal: 320 })
  })

  test('stores the dish name from the menu, not the one the browser sent', async () => {
    await place(orderArgs({ items: [line({ menu_item_name: 'Wagyu steak' })] }))

    expect(savedItems()[0].menu_item_name).toBe('Tapsilog')
  })

  test('prices options and add-ons from the dish JSON', async () => {
    await place(
      orderArgs({
        items: [line({ option_ids: ['v-large'], addon_ids: ['a-egg'], variation: 'Large', addons: ['Egg'] })],
      })
    )

    expect(savedItems()[0]).toMatchObject({ price: 220, subtotal: 440 })
  })

  test('prices a selection named only in the text', async () => {
    await place(orderArgs({ items: [line({ variation: 'Large', option_ids: undefined, addon_ids: undefined })] }))

    expect(savedItems()[0]).toMatchObject({ price: 200, subtotal: 400 })
  })

  test('measures the minimum order against server-priced subtotals', async () => {
    tableRows = { ...tableRows, order_types: { ...pickup, minimum_order_amount: 500 } }

    // One ₱160 plate claimed at ₱10 with a ₱1,000 subtotal: the client sum
    // clears ₱500, the price the server will actually charge does not.
    const result = await place(orderArgs({ items: [line({ quantity: 1, price: 10, subtotal: 1000 })] }))

    expect(result.refused).toBe(true)
    expect(result.error).toMatch(/minimum/i)
    expect(createOrder).not.toHaveBeenCalled()
  })

  test('recomputes the service charge from the order type and ignores the sent one', async () => {
    tableRows = {
      ...tableRows,
      order_types: { ...pickup, service_charge_enabled: true, service_charge_type: 'percentage', service_charge_value: 10 },
    }

    await place(orderArgs({ serviceChargeAmount: -500 }))

    expect(savedArg(11)).toBe(32)
  })

  test('charges no service charge the order type does not have', async () => {
    await place(orderArgs({ serviceChargeAmount: 75 }))

    expect(savedArg(11)).toBe(0)
  })

  test('refuses a negative delivery fee', async () => {
    const result = await place(orderArgs({ deliveryFee: -100 }))

    expect(result.refused).toBe(true)
    expect(createOrder).not.toHaveBeenCalled()
  })

  test('refuses a NaN delivery fee', async () => {
    const result = await place(orderArgs({ deliveryFee: Number.NaN }))

    expect(result.refused).toBe(true)
  })

  test('drops a delivery fee from an order that is not a delivery', async () => {
    await place(orderArgs({ deliveryFee: 90 }))

    expect(savedArg(5)).toBeUndefined()
  })

  test('keeps a Lalamove quotation fee on a delivery order', async () => {
    tableRows = {
      ...tableRows,
      tenants: platformTenant({ lalamove_enabled: true }),
      order_types: { ...pickup, name: 'Delivery', type: 'delivery' },
    }

    await place(orderArgs({ deliveryFee: 185, lalamoveQuotationId: 'q-1' }))

    expect(savedArg(5)).toBe(185)
  })

  test('strips forged presell and discount keys from customerData', async () => {
    await place(
      orderArgs({
        customerData: {
          customer_name: 'Ana',
          presell_date: '2026-12-24',
          presell_claim_id: 'forged-claim',
          presell_lines: [{ menuItemId: 'mi-9', presellDate: '2026-12-24', quantity: 50 }],
          discount: { total: 999 },
        },
      })
    )

    const saved = savedArg(4) as Record<string, unknown>
    expect(saved).toMatchObject({ customer_name: 'Ana' })
    expect(saved).not.toHaveProperty('presell_claim_id')
    expect(saved).not.toHaveProperty('presell_lines')
    expect(saved).not.toHaveProperty('presell_date')
    expect(saved).not.toHaveProperty('discount')
  })

  test('drops a payment proof URL that is not an ImageKit URL', async () => {
    await place(orderArgs({ paymentProof: { url: 'javascript:alert(1)', publicId: null, reference: 'GC1' } }))

    expect(savedArg(13)).toMatchObject({ url: null, reference: 'GC1' })
  })

  test('reads the order type once, even when every consumer needs it', async () => {
    // Minimum, web availability, advance schedule, distance fee and service
    // charge all read the order type; this used to be four separate queries.
    tableRows = {
      ...tableRows,
      tenants: platformTenant({
        distance_delivery_enabled: true,
        delivery_price_per_km: 10,
        delivery_min_fee: 50,
        delivery_radius_km: 5,
        restaurant_latitude: 14.5995,
        restaurant_longitude: 120.9842,
      }),
      order_types: { ...pickup, name: 'Delivery', type: 'delivery', advance_order_enabled: true, advance_order_max_days_ahead: 7 },
    }

    await place(
      orderArgs({
        customerData: { delivery_lat: 14.6, delivery_lng: 120.99 },
        scheduledForISO: new Date(Date.now() + 2 * 24 * 60 * 60_000).toISOString(),
      })
    )

    expect(createOrder).toHaveBeenCalled()

    expect(fromCalls.filter((table) => table === 'order_types')).toHaveLength(1)
  })
})
