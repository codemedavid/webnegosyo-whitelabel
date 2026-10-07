/**
 * A closed or pre-launch store is a REFUSAL, never a lost order.
 *
 * The hours / pre-launch guard used to live only inside the backend writers
 * (`createOrder`, `createOrderConvex`), which THROW its message. The action's
 * catch then classified the throw as a lost order — no `refused: true` — so the
 * optimistic checkout kept its Messenger fallback and the countdown delivered
 * an order to a store that had not launched. The tenant-owned Supabase writer
 * had no guard at all, so a closed shop on that backend took ASAP orders.
 *
 * The guard now runs in `createOrderAction` itself, before any backend write,
 * and answers with `refused: true` on every backend.
 *
 * Same scaffold as create-order-refusal-discriminator.test.ts.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

interface TableRows {
  tenants?: Record<string, unknown> | null
  order_types?: Record<string, unknown> | null
  menu_items?: Array<Record<string, unknown>> | null
}

const insertedTables: string[] = []
let tableRows: TableRows = {}

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

const BACKEND_STOP = 'backend write reached'
type BackendWrite = (...args: unknown[]) => Promise<never>
const stopAtBackend: BackendWrite = async () => {
  throw new Error(BACKEND_STOP)
}
const mockCreateOrder = jest.fn<BackendWrite>(stopAtBackend)
const mockCreateOrderTenantSupabase = jest.fn<BackendWrite>(stopAtBackend)

jest.mock('@/lib/orders-service', () => ({
  getOrdersByTenant: jest.fn(),
  getOrderById: jest.fn(),
  updateOrderStatus: jest.fn(),
  getOrderStats: jest.fn(),
  createOrder: (...args: unknown[]) => mockCreateOrder(...args),
  createOrderConvex: jest.fn(),
}))

jest.mock('@/lib/tenant-supabase-orders', () => ({
  createOrderTenantSupabase: (...args: unknown[]) => mockCreateOrderTenantSupabase(...args),
}))

jest.mock('@/lib/supabase/tenant-order-client', () => ({
  createTenantOrderWriteClient: () => ({}),
}))

const TENANT_ID = 'tenant-1'
const ORDER_TYPE_ID = 'ot-1'
const HOUR_MS = 60 * 60 * 1000

/** Every weekday explicitly closed: closed whatever the clock reads. */
const ALWAYS_CLOSED_HOURS = Object.fromEntries(
  ['0', '1', '2', '3', '4', '5', '6'].map((day) => [day, { closed: true, open: '09:00', close: '17:00' }])
)

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
    is_prelaunch: false,
    enforce_operating_hours: false,
    operating_hours: null,
    timezone: 'Asia/Manila',
    ...overrides,
  }
}

const SCHEDULABLE_PICKUP = {
  id: ORDER_TYPE_ID,
  type: 'pickup',
  name: 'Pickup',
  available_on_web: true,
  advance_order_enabled: true,
  advance_order_lead_time_minutes: 30,
  advance_order_max_days_ahead: 7,
}

const items = [
  { menu_item_id: 'mi-1', menu_item_name: 'Tapsilog', addons: [], quantity: 2, price: 160, subtotal: 320 },
]

type Reply = { success: boolean; refused?: boolean; error?: string }

/** createOrderAction's positional signature; scheduledForISO is the 13th argument. */
async function placeOrder(scheduledForISO?: string): Promise<Reply> {
  const { createOrderAction } = await import('@/app/actions/orders')
  return (await createOrderAction(
    TENANT_ID, items, undefined, ORDER_TYPE_ID, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, undefined, scheduledForISO,
  )) as Reply
}

function inTwoDays(): string {
  return new Date(Date.now() + 48 * HOUR_MS).toISOString()
}

describe('createOrderAction — closed / pre-launch store is refused, not lost', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    insertedTables.length = 0
    tableRows = {}
  })

  test('refuses a SCHEDULED order on a pre-launch store before any backend write', async () => {
    tableRows = { tenants: tenant({ is_prelaunch: true }), menu_items: MENU_ITEMS, order_types: SCHEDULABLE_PICKUP }

    const result = await placeOrder(inTwoDays())

    expect(result.success).toBe(false)
    expect(result.refused).toBe(true)
    expect(result.error).toMatch(/isn't taking orders yet/i)
    expect(mockCreateOrder).not.toHaveBeenCalled()
    expect(insertedTables).not.toContain('orders')
  })

  test('refuses an ASAP order on a pre-launch store', async () => {
    tableRows = { tenants: tenant({ is_prelaunch: true }), menu_items: MENU_ITEMS, order_types: SCHEDULABLE_PICKUP }

    const result = await placeOrder()

    expect(result.refused).toBe(true)
    expect(mockCreateOrder).not.toHaveBeenCalled()
  })

  test('refuses an ASAP order outside operating hours on the platform backend', async () => {
    tableRows = {
      tenants: tenant({ enforce_operating_hours: true, operating_hours: ALWAYS_CLOSED_HOURS }),
      menu_items: MENU_ITEMS,
      order_types: SCHEDULABLE_PICKUP,
    }

    const result = await placeOrder()

    expect(result.refused).toBe(true)
    expect(result.error).toMatch(/ordering is currently closed/i)
    expect(mockCreateOrder).not.toHaveBeenCalled()
  })

  test('refuses an ASAP order outside operating hours on a tenant-owned Supabase backend', async () => {
    // createOrderTenantSupabase has no hours guard of its own.
    tableRows = {
      tenants: tenant({
        order_backend: 'supabase',
        supabase_order_url: 'https://tenant.supabase.co',
        supabase_order_anon_key: 'anon',
        supabase_order_service_key: 'service',
        enforce_operating_hours: true,
        operating_hours: ALWAYS_CLOSED_HOURS,
      }),
      menu_items: MENU_ITEMS,
      order_types: SCHEDULABLE_PICKUP,
    }

    const result = await placeOrder()

    expect(result.refused).toBe(true)
    expect(mockCreateOrderTenantSupabase).not.toHaveBeenCalled()
  })

  test('lets a valid SCHEDULED order through a closed (launched) store', async () => {
    // Pre-ordering while the shop is shut is the point of advance orders.
    tableRows = {
      tenants: tenant({ enforce_operating_hours: true, operating_hours: ALWAYS_CLOSED_HOURS }),
      menu_items: MENU_ITEMS,
      order_types: SCHEDULABLE_PICKUP,
    }

    const result = await placeOrder(inTwoDays())

    expect(mockCreateOrder).toHaveBeenCalledTimes(1)
    // The backend stub throws, which is a lost order — and stays unmarked.
    expect(result.refused).toBeUndefined()
  })

  test('an out-of-policy schedule is judged as ASAP, so a closed store still refuses it', async () => {
    // The schedule the backends store is the VALIDATED one; a past instant
    // validates to "ASAP" and must not borrow the scheduled-order exemption.
    tableRows = {
      tenants: tenant({ enforce_operating_hours: true, operating_hours: ALWAYS_CLOSED_HOURS }),
      menu_items: MENU_ITEMS,
      order_types: SCHEDULABLE_PICKUP,
    }

    const result = await placeOrder(new Date(Date.now() - 24 * HOUR_MS).toISOString())

    expect(result.refused).toBe(true)
    expect(mockCreateOrder).not.toHaveBeenCalled()
  })
})
