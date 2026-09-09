/**
 * Per-order-type web availability — the authoritative server-side gate.
 *
 * The storefront query hides `available_on_web = false` types, but a stale tab
 * or a direct action call still reaches `createOrderAction` with the id, so the
 * action must refuse it itself, before any backend dispatch. Same scaffold as
 * create-order-minimum.test.ts.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

interface TableRows {
  tenants?: Record<string, unknown> | null
  order_types?: Record<string, unknown> | null
}

const insertedTables: string[] = []
let tableRows: TableRows = {}

function makeQuery(table: string) {
  const row = (tableRows as Record<string, unknown>)[table] ?? null
  const result = { data: row, error: null }
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
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
const ORDER_TYPE_ID = 'ot-grab'

function platformTenant() {
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
  }
}

const items = [
  { menu_item_id: 'mi-1', menu_item_name: 'Tapsilog', addons: [], quantity: 2, price: 160, subtotal: 320 },
]

describe('createOrderAction — web availability enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    insertedTables.length = 0
    tableRows = {}
  })

  test('refuses an order type hidden from online ordering', async () => {
    tableRows = {
      tenants: platformTenant(),
      order_types: { id: ORDER_TYPE_ID, type: 'grab', name: 'Grab', available_on_web: false },
    }

    const { createOrderAction } = await import('@/app/actions/orders')
    const result = await createOrderAction(TENANT_ID, items, undefined, ORDER_TYPE_ID) as { success: boolean; error?: string }

    expect(result.success).toBe(false)
    expect(result.error).toBe('This order type is not available for online ordering')
    expect(insertedTables).not.toContain('orders')
  })

  test('refuses before the minimum-order check runs', async () => {
    tableRows = {
      tenants: platformTenant(),
      order_types: { id: ORDER_TYPE_ID, type: 'grab', name: 'Grab', available_on_web: false, minimum_order_amount: 500 },
    }

    const { createOrderAction } = await import('@/app/actions/orders')
    const result = await createOrderAction(TENANT_ID, items, undefined, ORDER_TYPE_ID) as { error?: string }

    expect(result.error).not.toMatch(/minimum/i)
    expect(result.error).toMatch(/not available for online ordering/)
  })

  test('lets an order type that predates the column through the gate', async () => {
    tableRows = {
      tenants: platformTenant(),
      order_types: { id: ORDER_TYPE_ID, type: 'pickup', name: 'Pickup' },
    }

    const { createOrderAction } = await import('@/app/actions/orders')
    const result = await createOrderAction(TENANT_ID, items, undefined, ORDER_TYPE_ID) as { error?: string }

    expect(result.error ?? '').not.toMatch(/online ordering/)
  })

  test('lets an explicitly web-available order type through the gate', async () => {
    tableRows = {
      tenants: platformTenant(),
      order_types: { id: ORDER_TYPE_ID, type: 'pickup', name: 'Pickup', available_on_web: true },
    }

    const { createOrderAction } = await import('@/app/actions/orders')
    const result = await createOrderAction(TENANT_ID, items, undefined, ORDER_TYPE_ID) as { error?: string }

    expect(result.error ?? '').not.toMatch(/online ordering/)
  })
})
