/**
 * "Order Not Found" on a tracking link the customer had just been handed.
 *
 * Checkout routes the write through `resolveOrderBackend`, which is a THREE-way
 * decision: a deliberate `order_backend` pin wins, and only an unpinned row
 * derives the backend from the credentials on it. The tracking read routed on
 * the credentials alone — `convex_deployment_url` present means Convex — so a
 * tenant pinned to `platform` that still carried a Convex deployment had its
 * orders written to the platform database and looked up in Convex.
 *
 * Convex answers "no such order", the page falls through to its localStorage
 * fallback, that fallback asks the same API and gets the same 404, and the
 * customer is told their order does not exist seconds after placing it.
 *
 * These tests pin the read to the same resolver the write uses: whatever
 * backend checkout chose for a tenant is the backend tracking must look in.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ORDER_ID = '22222222-2222-4222-8222-222222222222'
const TOKEN = 'a'.repeat(64)
const CONVEX_URL = 'https://robust-bass-874.convex.cloud'

/** A platform-database order row, as `fetchFromSupabase` projects it. */
const PLATFORM_ORDER = {
  id: ORDER_ID,
  status: 'preparing',
  total: 250,
  delivery_fee: 0,
  service_charge_amount: 0,
  order_type: 'Pickup',
  order_type_id: null,
  customer_name: 'Ana',
  customer_contact: '09171234567',
  outlet_id: null,
  source: 'online',
  payment_status: 'pending',
  created_at: '2026-09-13T10:00:00.000Z',
  scheduled_for: null,
  customer_data: {},
  order_items: [
    { menu_item_name: 'Latte', quantity: 1, price: 250, subtotal: 250, variation: null, addons: null },
  ],
}

/** A Convex order document, as `fetchFromConvex` projects it. */
const CONVEX_ORDER = {
  status: 'ready',
  items: [{ menuItemName: 'Latte', quantity: 1, price: 250, subtotal: 250 }],
  total: 250,
  orderType: 'Pickup',
  customerName: 'Ana',
  customerContact: '09171234567',
  _creationTime: Date.parse('2026-09-13T10:00:00.000Z'),
}

/** Which table a stubbed query is reading, plus the columns it asked for. */
type TableReader = (table: string, columns: string) => Record<string, unknown> | null

/**
 * A Supabase client stub covering the exact chain shapes the tracking service
 * uses: `.from(t).select(c).eq(...).eq(...).single()` and `.maybeSingle()`.
 */
function makeAdminClient(read: TableReader) {
  const from = jest.fn((table: string) => {
    let columns = ''
    const builder = {
      select: (cols: string) => {
        columns = cols
        return builder
      },
      eq: () => builder,
      single: async () => ({ data: read(table, columns), error: null }),
      maybeSingle: async () => ({ data: read(table, columns), error: null }),
    }
    return builder
  })
  return { from }
}

const createAdminClient = jest.fn()
const createConvexServerClient = jest.fn()
const convexQuery = jest.fn<(name: string, args: unknown) => Promise<unknown>>()

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: (...args: unknown[]) => createAdminClient(...args),
}))

jest.mock('@/lib/convex/server', () => ({
  createConvexServerClient: (...args: unknown[]) => {
    createConvexServerClient(...args)
    return { query: convexQuery }
  },
}))

jest.mock('@/lib/tenant-secrets', () => ({
  getTenantSecrets: async () => ({ convex_deploy_key: 'deploy-key' }),
}))

jest.mock('@/lib/tracking-token', () => ({
  verifyTrackingToken: () => true,
  MIN_TRACKING_TOKEN_HEX: 20,
}))

/**
 * Point the stubbed platform database at one tenant row. Everything else the
 * service reads (order types, the pickup switch, prep promise) answers null,
 * which is the shape of a store that has not configured those.
 */
function arrangeTenant(tenantRow: Record<string, unknown>, orderRow: Record<string, unknown> | null) {
  createAdminClient.mockReturnValue(
    makeAdminClient((table, columns) => {
      if (table === 'tenants') {
        return columns.includes('pickup_scan_enabled') ? { pickup_scan_enabled: true } : tenantRow
      }
      if (table === 'orders') return orderRow
      return null
    })
  )
}

/**
 * next/jest's SWC transform leaves static imports ahead of `jest.mock`, so the
 * module under test has to be pulled in after the mocks are registered.
 */
async function fetchTracking() {
  const { fetchOrderTrackingData } = await import('@/lib/order-tracking-service')
  return fetchOrderTrackingData(ORDER_ID, TOKEN, TENANT_ID)
}

describe('order tracking reads the backend checkout wrote to', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    convexQuery.mockResolvedValue(null)
  })

  it('reads the platform database for a tenant pinned to platform that still has a Convex deployment', async () => {
    // Arrange — the shape 13 live tenants are in: pinned `platform`, Convex URL
    // left on the row from an earlier setup. Checkout wrote here.
    arrangeTenant(
      { order_backend: 'platform', convex_deployment_url: CONVEX_URL },
      PLATFORM_ORDER
    )

    // Act
    const { data, error } = await fetchTracking()

    // Assert — the customer sees their order, and Convex was never asked.
    expect(error).toBeNull()
    expect(data?.status).toBe('preparing')
    expect(createConvexServerClient).not.toHaveBeenCalled()
  })

  it('reads Convex for an unpinned tenant that has a Convex deployment', async () => {
    // Arrange — no deliberate pin, so the credentials decide; checkout agrees.
    arrangeTenant({ order_backend: 'auto', convex_deployment_url: CONVEX_URL }, null)
    convexQuery.mockResolvedValue(CONVEX_ORDER)

    // Act
    const { data, error } = await fetchTracking()

    // Assert
    expect(error).toBeNull()
    expect(data?.status).toBe('ready')
    expect(createConvexServerClient).toHaveBeenCalledWith(CONVEX_URL, 'deploy-key')
  })

  it('reads Convex for a tenant deliberately pinned to Convex', async () => {
    arrangeTenant({ order_backend: 'convex', convex_deployment_url: CONVEX_URL }, null)
    convexQuery.mockResolvedValue(CONVEX_ORDER)

    const { data } = await fetchTracking()

    expect(data?.status).toBe('ready')
    expect(createConvexServerClient).toHaveBeenCalled()
  })

  it('reads the platform database for a tenant with no per-tenant backend at all', async () => {
    arrangeTenant({ order_backend: null, convex_deployment_url: null }, PLATFORM_ORDER)

    const { data, error } = await fetchTracking()

    expect(error).toBeNull()
    expect(data?.status).toBe('preparing')
    expect(createConvexServerClient).not.toHaveBeenCalled()
  })

  it('reports the order missing rather than guessing when the tenant row cannot be read', async () => {
    arrangeTenant({}, null)
    createAdminClient.mockReturnValue(makeAdminClient(() => null))

    const { data, error } = await fetchTracking()

    expect(data).toBeNull()
    expect(error).toBe('Restaurant not found')
  })
})
