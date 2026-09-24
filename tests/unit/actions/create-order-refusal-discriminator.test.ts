/**
 * A refusal has to be recognisable as one.
 *
 * `createOrderAction` answers a rejected order and a broken one with the same
 * `{ success: false }` shape, and the checkout — which has already rendered
 * "Order Placed!" and cleared the cart — has nothing else to go on. It used to
 * assume every failure was a lost order, so a customer whose order the store
 * deliberately turned down was told to send the merchant the Messenger message
 * anyway, and the countdown sent it for them.
 *
 * `refused: true` is what makes the two tellable apart. It must be present on
 * every deterministic refusal and ABSENT on anything that means the order went
 * missing, because the consumer fails closed: no flag reads as "lost", which
 * keeps the Messenger fallback that still delivers the order.
 *
 * Same scaffold as create-order-web-availability.test.ts.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

interface TableRows {
  tenants?: Record<string, unknown> | null
  order_types?: Record<string, unknown> | null
  menu_items?: Array<Record<string, unknown>> | null
}

const insertedTables: string[] = []
let tableRows: TableRows = {}

/**
 * The dish the carts below order. The minimum is measured against the
 * SERVER-priced subtotal, so every test needs the menu row to price against.
 */
const MENU_ITEMS = [{ id: 'mi-1', name: 'Tapsilog', price: 160, discounted_price: null, is_available: true }]

function makeQuery(table: string) {
  const row = (tableRows as Record<string, unknown>)[table] ?? null
  const result = { data: row, error: null }
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
    from: (table: string) => ({
      ...makeQuery(table),
      insert: () => {
        insertedTables.push(table)
        return makeQuery(table)
      },
    }),
  }),
}))

const TENANT_ID = 'tenant-1'
const ORDER_TYPE_ID = 'ot-1'

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

const items = [
  { menu_item_id: 'mi-1', menu_item_name: 'Tapsilog', addons: [], quantity: 2, price: 160, subtotal: 320 },
]

type Reply = { success: boolean; refused?: boolean; error?: string }

describe('createOrderAction — deterministic refusals are marked', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    insertedTables.length = 0
    tableRows = {}
  })

  test('marks an order type hidden from online ordering', async () => {
    tableRows = {
      tenants: platformTenant(),
      menu_items: MENU_ITEMS,
      order_types: { id: ORDER_TYPE_ID, type: 'grab', name: 'Grab', available_on_web: false },
    }

    const { createOrderAction } = await import('@/app/actions/orders')
    const result = (await createOrderAction(TENANT_ID, items, undefined, ORDER_TYPE_ID)) as Reply

    expect(result.success).toBe(false)
    expect(result.refused).toBe(true)
    expect(insertedTables).not.toContain('orders')
  })

  test('marks a below-minimum order', async () => {
    tableRows = {
      tenants: platformTenant(),
      menu_items: MENU_ITEMS,
      order_types: {
        id: ORDER_TYPE_ID,
        type: 'delivery',
        name: 'Delivery',
        available_on_web: true,
        minimum_order_amount: 500,
      },
    }

    const { createOrderAction } = await import('@/app/actions/orders')
    const result = (await createOrderAction(TENANT_ID, items, undefined, ORDER_TYPE_ID)) as Reply

    expect(result.refused).toBe(true)
    expect(result.error).toMatch(/minimum/i)
  })

  test('marks a deactivated store', async () => {
    // The tenants read filters on is_active, so a suspended merchant returns no
    // row. That is the store being closed for business, not a broken save.
    tableRows = { tenants: null }

    const { createOrderAction } = await import('@/app/actions/orders')
    const result = (await createOrderAction(TENANT_ID, items, undefined, ORDER_TYPE_ID)) as Reply

    expect(result.refused).toBe(true)
    expect(result.error).toMatch(/not found or is currently inactive/i)
  })

  test('marks an empty cart', async () => {
    const { createOrderAction } = await import('@/app/actions/orders')
    const result = (await createOrderAction(TENANT_ID, [], undefined, ORDER_TYPE_ID)) as Reply

    expect(result.refused).toBe(true)
  })

  test('carries a sentence the customer can act on, never a bare flag', async () => {
    tableRows = {
      tenants: platformTenant(),
      menu_items: MENU_ITEMS,
      order_types: {
        id: ORDER_TYPE_ID,
        type: 'delivery',
        name: 'Delivery',
        available_on_web: true,
        minimum_order_amount: 500,
      },
    }

    const { createOrderAction } = await import('@/app/actions/orders')
    const result = (await createOrderAction(TENANT_ID, items, undefined, ORDER_TYPE_ID)) as Reply

    expect((result.error ?? '').trim().length).toBeGreaterThan(0)
  })
})

describe('createOrderAction — a lost order is NOT marked refused', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    insertedTables.length = 0
    tableRows = {}
  })

  test('a thrown backend error stays unmarked so Messenger remains the recovery', async () => {
    // assertOrderBackendReady throws for a tenant configured for Convex with no
    // deployment URL. That is the platform failing, not the store refusing —
    // the order really is lost, and withholding the Messenger message would
    // lose it on the second channel too.
    tableRows = {
      tenants: platformTenant({ order_backend: 'convex', convex_deployment_url: null }),
      menu_items: MENU_ITEMS,
      order_types: { id: ORDER_TYPE_ID, type: 'pickup', name: 'Pickup', available_on_web: true },
    }

    const { createOrderAction } = await import('@/app/actions/orders')
    const result = (await createOrderAction(TENANT_ID, items, undefined, ORDER_TYPE_ID)) as Reply

    expect(result.success).toBe(false)
    expect(result.refused).toBeUndefined()
  })
})
