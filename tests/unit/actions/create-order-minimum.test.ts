/**
 * Per-order-type minimum order — the authoritative server-side gate.
 *
 * The checkout UI disables the button, but that is a courtesy. The mobile apps,
 * a stale browser tab, and anyone posting the action directly all bypass it, so
 * `createOrderAction` must reject a below-minimum order itself — and must do so
 * before dispatching to ANY order backend (Convex, tenant Supabase, platform
 * Supabase), or Convex tenants would keep taking the orders their merchant said
 * they don't want.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

// ---- Fake admin Supabase client ------------------------------------------

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

// ---- Fixtures -------------------------------------------------------------

const TENANT_ID = 'tenant-1'
const ORDER_TYPE_ID = 'ot-delivery'

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

/** A ₱320 cart — below a ₱500 delivery minimum. */
const items = [
  {
    menu_item_id: 'mi-1',
    menu_item_name: 'Tapsilog',
    addons: [],
    quantity: 2,
    price: 160,
    subtotal: 320,
  },
]

describe('createOrderAction — minimum order enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    insertedTables.length = 0
    tableRows = {}
  })

  test('rejects an order below the order type minimum', async () => {
    tableRows = {
      tenants: platformTenant(),
      order_types: { id: ORDER_TYPE_ID, type: 'delivery', name: 'Delivery', minimum_order_amount: 500 },
    }

    const { createOrderAction } = await import('@/app/actions/orders')
    const result = await createOrderAction(TENANT_ID, items, undefined, ORDER_TYPE_ID) as never

    expect(result).toMatchObject({ success: false })
    expect((result as { error: string }).error).toMatch(/minimum/i)
  })

  test('never reaches the order backend when the minimum is unmet', async () => {
    tableRows = {
      tenants: platformTenant(),
      order_types: { id: ORDER_TYPE_ID, type: 'delivery', name: 'Delivery', minimum_order_amount: 500 },
    }

    const { createOrderAction } = await import('@/app/actions/orders')
    await createOrderAction(TENANT_ID, items, undefined, ORDER_TYPE_ID)

    expect(insertedTables).not.toContain('orders')
  })

  test('tells the customer how much more to add', async () => {
    tableRows = {
      tenants: platformTenant(),
      order_types: { id: ORDER_TYPE_ID, type: 'delivery', name: 'Delivery', minimum_order_amount: 500 },
    }

    const { createOrderAction } = await import('@/app/actions/orders')
    const result = await createOrderAction(TENANT_ID, items, undefined, ORDER_TYPE_ID) as { error?: string }

    expect(result.error).toContain('180')
  })

  test('lets an order at exactly the minimum through the gate', async () => {
    tableRows = {
      tenants: platformTenant(),
      order_types: { id: ORDER_TYPE_ID, type: 'delivery', name: 'Delivery', minimum_order_amount: 320 },
    }

    const { createOrderAction } = await import('@/app/actions/orders')
    const result = await createOrderAction(TENANT_ID, items, undefined, ORDER_TYPE_ID) as { error?: string }

    // It may still fail further downstream against this fake client — what matters
    // is that it was NOT stopped by the minimum-order gate.
    expect(result.error ?? '').not.toMatch(/minimum/i)
  })

  test('does not gate an order type without a minimum', async () => {
    tableRows = {
      tenants: platformTenant(),
      order_types: { id: ORDER_TYPE_ID, type: 'pickup', name: 'Pickup', minimum_order_amount: 0 },
    }

    const { createOrderAction } = await import('@/app/actions/orders')
    const result = await createOrderAction(TENANT_ID, items, undefined, ORDER_TYPE_ID) as { error?: string }

    expect(result.error ?? '').not.toMatch(/minimum/i)
  })

  test('does not gate a tenant whose order types predate the column', async () => {
    tableRows = {
      tenants: platformTenant(),
      order_types: { id: ORDER_TYPE_ID, type: 'delivery', name: 'Delivery' },
    }

    const { createOrderAction } = await import('@/app/actions/orders')
    const result = await createOrderAction(TENANT_ID, items, undefined, ORDER_TYPE_ID) as { error?: string }

    expect(result.error ?? '').not.toMatch(/minimum/i)
  })
})
