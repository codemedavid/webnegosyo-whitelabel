/**
 * The tracking page polls every 5-10 s per open tab. Each poll used to run
 * five sequential platform queries: the tenant routing row, the order, the
 * order type, the prep promise (the SAME order row again) and the pickup
 * switch (the SAME tenant row again). The platform path now reads two rows —
 * tenant and order — with the order type embedded through its foreign key.
 *
 * The unmigrated-column safety the separate reads existed for is kept: each
 * combined read retries without the optional columns on SQLSTATE 42703.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ORDER_ID = '22222222-2222-4222-8222-222222222222'
const TOKEN = 'a'.repeat(64)

const ORDER_ROW = {
  id: ORDER_ID,
  status: 'preparing',
  total: 250,
  delivery_fee: 0,
  service_charge_amount: 0,
  order_type: 'Counter',
  order_type_id: '33333333-3333-4333-8333-333333333333',
  customer_name: 'Ana',
  customer_contact: '09171234567',
  outlet_id: null,
  source: 'online',
  payment_status: 'pending',
  created_at: '2026-09-21T10:00:00.000Z',
  daily_number: 7,
  scheduled_for: null,
  customer_data: {},
  prep_minutes: 15,
  promised_ready_at: '2026-09-21T10:15:00.000Z',
  order_type_row: { type: 'pickup', tenant_id: TENANT_ID },
  order_items: [
    { menu_item_name: 'Latte', quantity: 1, price: 250, subtotal: 250, variation: null, addons: null },
  ],
}

interface Call { table: string; columns: string }

let calls: Call[] = []
let tenantRow: Record<string, unknown> = {}
let orderRow: Record<string, unknown> = ORDER_ROW
/** Columns the stub database has not migrated yet. */
let missingColumns: string[] = []

function respond(table: string, columns: string) {
  const missing = missingColumns.find((column) => columns.includes(column))
  if (missing) return { data: null, error: { code: '42703', message: `column ${table}.${missing} does not exist` } }
  if (table === 'tenants') return { data: tenantRow, error: null }
  if (table === 'orders') return { data: orderRow, error: null }
  if (table === 'order_types') return { data: { type: 'delivery' }, error: null }
  return { data: null, error: null }
}

function makeAdminClient() {
  return {
    from: (table: string) => {
      let columns = ''
      const builder = {
        select: (cols: string) => {
          columns = cols
          calls.push({ table, columns: cols })
          return builder
        },
        eq: () => builder,
        single: async () => respond(table, columns),
        maybeSingle: async () => respond(table, columns),
      }
      return builder
    },
  }
}

const convexQuery = jest.fn<(name: string, args: unknown) => Promise<unknown>>()

jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdminClient() }))
jest.mock('@/lib/convex/server', () => ({ createConvexServerClient: () => ({ query: convexQuery }) }))
jest.mock('@/lib/tenant-secrets', () => ({ getTenantSecrets: async () => ({ convex_deploy_key: 'deploy-key' }) }))
jest.mock('@/lib/tracking-token', () => ({ verifyTrackingToken: () => true, MIN_TRACKING_TOKEN_HEX: 20 }))

/** next/jest leaves static imports ahead of `jest.mock` — import lazily. */
async function fetchTracking() {
  const { fetchOrderTrackingData } = await import('@/lib/order-tracking-service')
  return fetchOrderTrackingData(ORDER_ID, TOKEN, TENANT_ID)
}

describe('a platform-database tracking poll', () => {
  beforeEach(() => {
    calls = []
    missingColumns = []
    orderRow = ORDER_ROW
    tenantRow = { order_backend: 'platform', convex_deployment_url: null, pickup_scan_enabled: false }
  })

  it('reads the tenant row and the order row, and nothing else', async () => {
    const { data, error } = await fetchTracking()

    expect(error).toBeNull()
    expect(data?.status).toBe('preparing')
    expect(calls.map((call) => call.table)).toEqual(['tenants', 'orders'])
  })

  it('takes the pickup switch from the routing row', async () => {
    const { data } = await fetchTracking()

    expect(calls[0].columns).toContain('pickup_scan_enabled')
    expect(data?.pickupScanEnabled).toBe(false)
  })

  it('takes the prep promise from the order row', async () => {
    const { data } = await fetchTracking()

    expect(data?.promisedReadyAt).toBe('2026-09-21T10:15:00.000Z')
    expect(data?.prepMinutes).toBe(15)
  })

  it('resolves the order type kind from the embedded order-type row', async () => {
    const { data } = await fetchTracking()

    expect(data?.orderTypeKind).toBe('pickup')
  })

  it('ignores an embedded order type that belongs to another store', async () => {
    orderRow = { ...ORDER_ROW, order_type: 'Pickup', order_type_row: { type: 'delivery', tenant_id: 'someone-else' } }

    const { data } = await fetchTracking()

    // Falls back to the snapshot label, exactly as an unresolved lookup did.
    expect(data?.orderTypeKind).toBe('pickup')
  })

  it('keeps finding the store when the pickup column is not migrated yet', async () => {
    missingColumns = ['pickup_scan_enabled']
    tenantRow = { order_backend: 'platform', convex_deployment_url: null }

    const { data, error } = await fetchTracking()

    expect(error).toBeNull()
    expect(data?.status).toBe('preparing')
    // The column's own default: scanning enabled.
    expect(data?.pickupScanEnabled).toBe(true)
  })

  it('keeps finding the order when the prep columns are not migrated yet', async () => {
    missingColumns = ['promised_ready_at']
    orderRow = { ...ORDER_ROW, prep_minutes: undefined, promised_ready_at: undefined }

    const { data, error } = await fetchTracking()

    expect(error).toBeNull()
    expect(data?.status).toBe('preparing')
    expect(data?.promisedReadyAt).toBeNull()
  })
})

describe('a Convex tracking poll', () => {
  beforeEach(() => {
    calls = []
    missingColumns = []
    tenantRow = { order_backend: 'convex', convex_deployment_url: 'https://x.convex.cloud', pickup_scan_enabled: true }
    convexQuery.mockResolvedValue({
      status: 'ready',
      items: [],
      total: 100,
      orderType: 'Delivery',
      orderTypeId: 'ot-1',
      _creationTime: Date.parse('2026-09-21T10:00:00.000Z'),
    })
  })

  it('reads the tenant row once and still resolves the order type from the platform database', async () => {
    const { data } = await fetchTracking()

    expect(calls.filter((call) => call.table === 'tenants')).toHaveLength(1)
    expect(calls.map((call) => call.table)).toContain('order_types')
    expect(data?.orderTypeKind).toBe('delivery')
    expect(data?.pickupScanEnabled).toBe(true)
  })
})
