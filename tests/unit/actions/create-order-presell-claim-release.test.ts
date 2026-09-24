/**
 * Presell stock reserved for an order that never happens must come back.
 *
 * `createOrderAction` CLAIMS per-date presell allocation before any order row
 * exists, so an oversold cart is refused with nothing written. Every path that
 * answers the customer after that point owes the stock back — and the one that
 * did not was the outer catch: when a backend threw mid-write (network blip,
 * Convex outage, an RLS refusal) the customer was told the order was lost and
 * the allocation stayed consumed forever. Nobody ever got that bilao.
 *
 * A SUCCESSFUL order must of course keep its claim, and a path that already
 * released through `refuse()` must not release twice.
 *
 * Scaffold mirrors create-order-refusal-discriminator.test.ts. Note the repo
 * gotcha: jest.mock is NOT hoisted here, so the module under test is imported
 * lazily inside each test.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const TENANT_ID = 'tenant-1'
const ORDER_TYPE_ID = 'ot-1'
const MENU_ITEM_ID = 'mi-1'
const PRESELL_DATE = '2026-12-24'

/** Rows each table answers with, per test. */
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
  getTenantSecrets: async () => null,
}))

jest.mock('@/lib/inventory/checkout-stock-guard', () => ({
  findCheckoutStockShortfallMessage: async () => null,
}))

const releasePresellForOrder = jest.fn(async () => {})
const claimPresellForOrder = jest.fn(async () => ({
  ok: true as const,
  lines: [{ menuItemId: MENU_ITEM_ID, presellDate: PRESELL_DATE, quantity: 2 }],
}))

jest.mock('@/lib/presell/order-claim', () => ({
  claimPresellForOrder: (...args: unknown[]) =>
    (claimPresellForOrder as unknown as (...a: unknown[]) => unknown)(...args),
  releasePresellForOrder: (...args: unknown[]) =>
    (releasePresellForOrder as unknown as (...a: unknown[]) => unknown)(...args),
}))

const createOrder = jest.fn()

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

jest.mock('@/lib/vouchers/repository', () => ({
  createVoucherLookup: () => ({}),
}))

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

const presellItems = [
  {
    menu_item_id: MENU_ITEM_ID,
    menu_item_name: 'Bibingka Bilao',
    addons: [] as string[],
    quantity: 2,
    price: 500,
    subtotal: 1000,
    presell_date: PRESELL_DATE,
  },
]

function sellableMenuItems() {
  return [{ id: MENU_ITEM_ID, price: 500, discounted_price: null, is_available: true }]
}

type Reply = { success: boolean; refused?: boolean; error?: string }

async function placeOrder(): Promise<Reply> {
  const { createOrderAction } = await import('@/app/actions/orders')
  return (await createOrderAction(TENANT_ID, presellItems, undefined, ORDER_TYPE_ID)) as Reply
}

describe('createOrderAction — presell claim is never left consumed', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    releasePresellForOrder.mockImplementation(async () => {})
    claimPresellForOrder.mockImplementation(async () => ({
      ok: true as const,
      lines: [{ menuItemId: MENU_ITEM_ID, presellDate: PRESELL_DATE, quantity: 2 }],
    }))
    tableRows = {
      tenants: platformTenant(),
      order_types: { id: ORDER_TYPE_ID, type: 'pickup', name: 'Pickup', available_on_web: true },
      menu_items: sellableMenuItems(),
    }
  })

  test('releases the claim when the order writer throws', async () => {
    createOrder.mockImplementation(async () => {
      throw new Error('network')
    })

    const result = await placeOrder()

    expect(result.success).toBe(false)
    // A lost order, not a refusal — the Messenger fallback must stay offered.
    expect(result.refused).toBeUndefined()
    expect(releasePresellForOrder).toHaveBeenCalledTimes(1)
  })

  test('a failing release does not mask the lost-order answer', async () => {
    createOrder.mockImplementation(async () => {
      throw new Error('rls refusal')
    })
    releasePresellForOrder.mockImplementation(async () => {
      throw new Error('release blew up')
    })

    const result = await placeOrder()

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/could not save your order/i)
  })

  test('keeps the claim when the order is actually saved', async () => {
    createOrder.mockImplementation(async () => ({
      order: { id: 'order-1', total: 1000 },
      orderToken: 'tok',
      deduped: false,
    }))

    const result = await placeOrder()

    expect(result.success).toBe(true)
    expect(releasePresellForOrder).not.toHaveBeenCalled()
  })

  test('releases the duplicate claim a deduped retry just took', async () => {
    // A retried checkout claims stock again under a fresh claim id, then finds
    // the first attempt's order already saved. That second reservation belongs
    // to no order and has to go back.
    createOrder.mockImplementation(async () => ({
      order: { id: 'order-1', total: 1000 },
      orderToken: 'tok',
      deduped: true,
    }))

    const result = await placeOrder()

    expect(result.success).toBe(true)
    expect(releasePresellForOrder).toHaveBeenCalledTimes(1)
  })

  test('still releases exactly once on a deliberate refusal (regression guard)', async () => {
    // A distance-delivery order with no picked coordinates is refused by the
    // delivery-fee step, after the claim already reserved stock.
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
      order_types: { id: ORDER_TYPE_ID, type: 'delivery', name: 'Delivery', available_on_web: true },
    }

    const result = await placeOrder()

    expect(result.refused).toBe(true)
    expect(releasePresellForOrder).toHaveBeenCalledTimes(1)
  })

  test('refuses an unpriceable line before any stock is claimed', async () => {
    // Lines are priced before the presell claim, so a pricing refusal has
    // nothing to hand back.
    tableRows = { ...tableRows, menu_items: [] }

    const result = await placeOrder()

    expect(result.refused).toBe(true)
    expect(claimPresellForOrder).not.toHaveBeenCalled()
    expect(releasePresellForOrder).not.toHaveBeenCalled()
  })
})
