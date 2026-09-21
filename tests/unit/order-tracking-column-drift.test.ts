/**
 * "Order is still being processed. Please wait..." on every platform-database
 * store's tracking link.
 *
 * The tracking read projects an explicit column list, and PostgREST rejects the
 * WHOLE query when a single projected column is absent. `daily_number` shipped
 * in code before its migration reached production, so on the shared platform
 * database every tracking read failed with SQLSTATE 42703 — which the service
 * reported as "Order not found". The page then fell through to its localStorage
 * fallback, that fallback asked the same API, got the same 404, and told the
 * customer their order was "still being processed" forever.
 *
 * Tenants on their own Supabase project were untouched: that read selects `*`.
 *
 * A projection that is one deploy ahead of the database must degrade to a
 * missing FIELD, never to a missing ORDER. These tests pin that: on an
 * undefined-column error the read is repeated with `*`, which cannot go stale.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ORDER_ID = '22222222-2222-4222-8222-222222222222'
const TOKEN = 'a'.repeat(64)

/** The columns that existed before `daily_number` was added. */
const LEGACY_ORDER_ROW = {
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
  created_at: '2026-09-21T10:00:00.000Z',
  scheduled_for: null,
  customer_data: {},
  order_items: [
    { menu_item_name: 'Latte', quantity: 1, price: 250, subtotal: 250, variation: null, addons: null },
  ],
}

const UNDEFINED_COLUMN_ERROR = {
  code: '42703',
  message: 'column orders.daily_number does not exist',
}

const NO_ROWS_ERROR = { code: 'PGRST116', message: 'no rows returned' }

/** Every projection the service sent to `orders`, in order. */
let orderProjections: string[] = []

/** The row the unmigrated table holds, or null when the order is genuinely gone. */
let orderRow: Record<string, unknown> | null = LEGACY_ORDER_ROW

/**
 * A platform-database stub whose `orders` table has not been migrated: any
 * projection naming `daily_number` fails the way PostgREST fails it.
 */
function makeAdminClient() {
  return {
    from: (table: string) => {
      let columns = ''
      const builder = {
        select: (cols: string) => {
          columns = cols
          if (table === 'orders') orderProjections.push(cols)
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

function respond(table: string, columns: string) {
  if (table === 'tenants') {
    return columns.includes('pickup_scan_enabled')
      ? { data: { pickup_scan_enabled: true }, error: null }
      : { data: { order_backend: 'platform', convex_deployment_url: null }, error: null }
  }
  if (table === 'orders') {
    if (columns.includes('daily_number')) return { data: null, error: UNDEFINED_COLUMN_ERROR }
    if (!orderRow) return { data: null, error: NO_ROWS_ERROR }
    return { data: orderRow, error: null }
  }
  return { data: null, error: null }
}

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => makeAdminClient(),
}))

jest.mock('@/lib/tracking-token', () => ({
  verifyTrackingToken: () => true,
  MIN_TRACKING_TOKEN_HEX: 20,
}))

/**
 * next/jest's SWC transform leaves static imports ahead of `jest.mock`, so the
 * module under test has to be pulled in after the mocks are registered.
 */
async function fetchTracking() {
  const { fetchOrderTrackingData } = await import('@/lib/order-tracking-service')
  return fetchOrderTrackingData(ORDER_ID, TOKEN, TENANT_ID)
}

describe('platform order tracking survives a projection the database has not caught up to', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    orderProjections = []
    orderRow = LEGACY_ORDER_ROW
  })

  it('returns the order when an unmigrated column fails the first projection', async () => {
    // Act
    const { data, error } = await fetchTracking()

    // Assert — the customer sees their order, not "Order not found"
    expect(error).toBeNull()
    expect(data?.status).toBe('preparing')
    expect(data?.items).toHaveLength(1)
    expect(data?.total).toBe(250)
  })

  it('retries with a projection that cannot name a missing column', async () => {
    // Act
    await fetchTracking()

    // Assert — first attempt asks for the new column, the retry asks for `*`
    expect(orderProjections[0]).toContain('daily_number')
    expect(orderProjections[1]).toContain('*')
    expect(orderProjections[1]).not.toContain('daily_number')
  })

  it('degrades the unread column to a missing field, not a missing order', async () => {
    // Act
    const { data } = await fetchTracking()

    // Assert — the receipt falls back to the UUID display, which is its rule
    expect(data?.dailyNumber).toBeNull()
  })

  it('still reports a genuinely absent order as not found', async () => {
    // Arrange — the row is gone, which is not a projection problem
    orderRow = null

    // Act
    const { data, error } = await fetchTracking()

    // Assert — the retry must not turn "no such order" into a blank order
    expect(data).toBeNull()
    expect(error).toBe('Order not found')
  })
})
