/**
 * @jest-environment node
 *
 * Tests for POST /api/lalamove
 *
 * The merchant app books, syncs and cancels Lalamove deliveries. Those four
 * operations only ever existed as Convex actions, so a store on the shared
 * platform Supabase — which has no Convex deployment — could not run any of
 * them. This route is the platform-side equivalent.
 *
 * It has to live on a server: the tenant's `lalamove_api_key` and
 * `lalamove_secret_key` sign every Lalamove request, and shipping them to a
 * phone would hand a merchant's delivery account to anyone who unpacks the app.
 *
 * Authenticated via the caller's own Supabase access token, the same trust
 * level as /api/vouchers/redeem, then authorised against `app_users` so one
 * merchant cannot book riders on another merchant's account.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

jest.mock('@/lib/lalamove-service', () => ({
  createLalamoveOrder: jest.fn(),
  getLalamoveOrder: jest.fn(),
  cancelLalamoveOrder: jest.fn(),
  addLalamovePriorityFee: jest.fn(),
}))

const TENANT = {
  id: 't1',
  name: 'Retiro',
  lalamove_enabled: true,
  lalamove_api_key: 'key',
  lalamove_secret_key: 'secret',
  lalamove_market: 'PH',
  lalamove_sender_phone: '09170000000',
}

// The platform `orders` table has NO `delivery_address` column — the address
// lives inside the `customer_data` JSON blob (see orders-service.ts, which
// reads customer_data.delivery_address). The fixture mirrors the real row
// shape so a select against a nonexistent column cannot pass silently.
const ORDER = {
  id: 'order-1',
  tenant_id: 't1',
  customer_name: 'Ana',
  customer_contact: '09171234567',
  customer_data: { delivery_address: '12 Mabini St' },
  lalamove_quotation_id: 'quote-1',
  lalamove_order_id: null,
  lalamove_status: null,
}

/**
 * Columns that actually exist on the platform `orders` table (the subset this
 * route could plausibly ask for). PostgREST rejects a select naming any other
 * column with a 42703 error and no data — which is exactly how the real
 * delivery_address bug manifested: every op returned "Order not found".
 */
const PLATFORM_ORDER_COLUMNS = new Set([
  'id',
  'tenant_id',
  'status',
  'total',
  'customer_name',
  'customer_contact',
  'customer_data',
  'delivery_fee',
  'lalamove_quotation_id',
  'lalamove_order_id',
  'lalamove_status',
  'lalamove_driver_id',
  'lalamove_driver_name',
  'lalamove_driver_phone',
  'lalamove_tracking_url',
])

function unknownOrderColumn(select: string): string | null {
  for (const raw of select.split(',')) {
    const column = raw.trim()
    if (column && !PLATFORM_ORDER_COLUMNS.has(column)) return column
  }
  return null
}

function makeRequest(body: unknown, authHeader?: string): NextRequest {
  return new NextRequest('http://localhost/api/lalamove', {
    method: 'POST',
    headers: authHeader ? { authorization: authHeader } : {},
    body: JSON.stringify(body),
  })
}

describe('POST /api/lalamove', () => {
  let getUserMock: jest.Mock
  let appUserSingleMock: jest.Mock
  let adminUpdateMock: jest.Mock
  let tenantRow: Record<string, unknown> | null
  let orderRow: Record<string, unknown> | null

  beforeEach(async () => {
    jest.resetModules()
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

    tenantRow = { ...TENANT }
    orderRow = { ...ORDER }

    const { createClient } = await import('@supabase/supabase-js')
    const mockCreateClient = createClient as unknown as jest.Mock

    getUserMock = jest.fn()
    appUserSingleMock = jest.fn()
    getUserMock.mockResolvedValue({ data: { user: { id: 'merchant-1' } }, error: null })
    appUserSingleMock.mockResolvedValue({
      data: { role: 'admin', tenant_id: 't1', outlet_id: null },
      error: null,
    })

    mockCreateClient.mockReturnValue({
      auth: { getUser: getUserMock },
      from: jest.fn(() => {
        const builder: Record<string, unknown> = { single: appUserSingleMock }
        builder.select = jest.fn(() => builder)
        builder.eq = jest.fn(() => builder)
        return builder
      }),
    })

    adminUpdateMock = jest.fn()

    const { createAdminClient } = await import('@/lib/supabase/admin')
    ;(createAdminClient as unknown as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        const builder: Record<string, unknown> = {}
        let selectedColumns: string | null = null
        builder.select = jest.fn((columns?: string) => {
          selectedColumns = typeof columns === 'string' ? columns : null
          return builder
        })
        builder.eq = jest.fn(() => builder)
        builder.is = jest.fn(() => builder)
        builder.update = jest.fn((patch: unknown) => {
          adminUpdateMock(table, patch)
          return builder
        })
        builder.maybeSingle = jest.fn(async () => {
          // Emulate PostgREST: selecting a column the table does not have
          // yields an error and no row — it never resolves to data.
          if (table === 'orders' && selectedColumns && selectedColumns !== '*') {
            const missing = unknownOrderColumn(selectedColumns)
            if (missing) {
              return {
                data: null,
                error: { code: '42703', message: `column orders.${missing} does not exist` },
              }
            }
          }
          return {
            data: table === 'tenants' ? tenantRow : orderRow,
            error: null,
          }
        })
        builder.single = builder.maybeSingle
        // An update chain is awaited directly rather than read back.
        builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null })
        return builder
      }),
    })

    const service = await import('@/lib/lalamove-service')
    ;(service.createLalamoveOrder as unknown as jest.Mock).mockResolvedValue({
      orderId: 'lala-1',
      status: 'ASSIGNING_DRIVER',
      shareLink: 'https://share.lalamove.com/lala-1',
    })
    ;(service.getLalamoveOrder as unknown as jest.Mock).mockResolvedValue({
      status: 'ON_GOING',
      shareLink: 'https://share.lalamove.com/lala-1',
      driver: { name: 'Rico', phone: '09998887777' },
    })
    ;(service.cancelLalamoveOrder as unknown as jest.Mock).mockResolvedValue(true)
    ;(service.addLalamovePriorityFee as unknown as jest.Mock).mockResolvedValue({})
  })

  test('refuses an unauthenticated caller', async () => {
    const { POST } = await import('@/app/api/lalamove/route')
    const res = await POST(makeRequest({ op: 'book', tenantId: 't1', orderId: 'order-1' }))

    expect(res.status).toBe(401)
  })

  test('refuses a merchant booking on another tenant', async () => {
    // A rider booked on someone else's Lalamove account is billed to them.
    appUserSingleMock.mockResolvedValue({
      data: { role: 'admin', tenant_id: 'other-tenant', outlet_id: null },
      error: null,
    })

    const { POST } = await import('@/app/api/lalamove/route')
    const res = await POST(
      makeRequest({ op: 'book', tenantId: 't1', orderId: 'order-1' }, 'Bearer t'),
    )

    expect(res.status).toBe(403)
  })

  test('rejects an unknown operation', async () => {
    const { POST } = await import('@/app/api/lalamove/route')
    const res = await POST(
      makeRequest({ op: 'refund', tenantId: 't1', orderId: 'order-1' }, 'Bearer t'),
    )

    expect(res.status).toBe(400)
  })

  test('books a rider and records the tracking link on the order', async () => {
    const { POST } = await import('@/app/api/lalamove/route')
    const res = await POST(
      makeRequest({ op: 'book', tenantId: 't1', orderId: 'order-1' }, 'Bearer t'),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true })

    // The tracking url is the whole point for the merchant — without it
    // persisted, the card shows a booked delivery with no way to follow it.
    const [, patch] = adminUpdateMock.mock.calls.at(-1) as [string, Record<string, unknown>]
    expect(patch).toMatchObject({
      lalamove_order_id: 'lala-1',
      lalamove_status: 'ASSIGNING_DRIVER',
      lalamove_tracking_url: 'https://share.lalamove.com/lala-1',
    })
  })

  test('reads the delivery address from customer_data, not a nonexistent column', async () => {
    // The platform orders table has no delivery_address column; selecting one
    // makes PostgREST error, the row comes back null, and every op — book,
    // sync, cancel, priority fee — dies with "Order not found".
    const { POST } = await import('@/app/api/lalamove/route')
    const res = await POST(
      makeRequest({ op: 'book', tenantId: 't1', orderId: 'order-1' }, 'Bearer t'),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ success: true })
  })

  test('refuses to book when customer_data carries no delivery address', async () => {
    orderRow = { ...ORDER, customer_data: {} }

    const { POST } = await import('@/app/api/lalamove/route')
    const res = await POST(
      makeRequest({ op: 'book', tenantId: 't1', orderId: 'order-1' }, 'Bearer t'),
    )

    const body = (await res.json()) as { success: boolean; error?: string }
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/address/i)

    const service = await import('@/lib/lalamove-service')
    expect(service.createLalamoveOrder).not.toHaveBeenCalled()
  })

  test('refuses to book a second rider for an order that already has one', async () => {
    // Double booking sends two riders and bills the merchant twice.
    orderRow = { ...ORDER, lalamove_order_id: 'lala-existing' }

    const { POST } = await import('@/app/api/lalamove/route')
    const res = await POST(
      makeRequest({ op: 'book', tenantId: 't1', orderId: 'order-1' }, 'Bearer t'),
    )

    const body = (await res.json()) as { success: boolean; error?: string }
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/already/i)

    const service = await import('@/lib/lalamove-service')
    expect(service.createLalamoveOrder).not.toHaveBeenCalled()
  })

  test('refuses to book an order that was never quoted', async () => {
    orderRow = { ...ORDER, lalamove_quotation_id: null }

    const { POST } = await import('@/app/api/lalamove/route')
    const res = await POST(
      makeRequest({ op: 'book', tenantId: 't1', orderId: 'order-1' }, 'Bearer t'),
    )

    const body = (await res.json()) as { success: boolean; error?: string }
    expect(body.success).toBe(false)
  })

  test('refuses when Lalamove is switched off for the tenant', async () => {
    tenantRow = { ...TENANT, lalamove_enabled: false }

    const { POST } = await import('@/app/api/lalamove/route')
    const res = await POST(
      makeRequest({ op: 'book', tenantId: 't1', orderId: 'order-1' }, 'Bearer t'),
    )

    const body = (await res.json()) as { success: boolean; error?: string }
    expect(body.success).toBe(false)
  })

  test('syncs the live driver details onto the order', async () => {
    orderRow = { ...ORDER, lalamove_order_id: 'lala-1', lalamove_status: 'ASSIGNING_DRIVER' }

    const { POST } = await import('@/app/api/lalamove/route')
    const res = await POST(
      makeRequest({ op: 'sync', tenantId: 't1', orderId: 'order-1' }, 'Bearer t'),
    )

    expect(res.status).toBe(200)
    const [, patch] = adminUpdateMock.mock.calls.at(-1) as [string, Record<string, unknown>]
    expect(patch).toMatchObject({
      lalamove_status: 'ON_GOING',
      lalamove_driver_name: 'Rico',
      lalamove_driver_phone: '09998887777',
    })
  })

  test('cancels a booked delivery and records the cancellation', async () => {
    orderRow = { ...ORDER, lalamove_order_id: 'lala-1', lalamove_status: 'ASSIGNING_DRIVER' }

    const { POST } = await import('@/app/api/lalamove/route')
    const res = await POST(
      makeRequest({ op: 'cancel', tenantId: 't1', orderId: 'order-1' }, 'Bearer t'),
    )

    expect(res.status).toBe(200)
    const service = await import('@/lib/lalamove-service')
    expect(service.cancelLalamoveOrder).toHaveBeenCalled()

    const [, patch] = adminUpdateMock.mock.calls.at(-1) as [string, Record<string, unknown>]
    expect(patch).toMatchObject({ lalamove_status: 'CANCELLED' })
  })

  test('adds a priority fee to speed up driver matching', async () => {
    orderRow = { ...ORDER, lalamove_order_id: 'lala-1' }

    const { POST } = await import('@/app/api/lalamove/route')
    const res = await POST(
      makeRequest(
        { op: 'priority_fee', tenantId: 't1', orderId: 'order-1', amount: '50' },
        'Bearer t',
      ),
    )

    expect(res.status).toBe(200)
    const service = await import('@/lib/lalamove-service')
    expect(service.addLalamovePriorityFee).toHaveBeenCalledWith(
      expect.anything(),
      'lala-1',
      '50',
    )
  })

  test('rejects a priority fee that is not a positive amount', async () => {
    orderRow = { ...ORDER, lalamove_order_id: 'lala-1' }

    const { POST } = await import('@/app/api/lalamove/route')
    const res = await POST(
      makeRequest(
        { op: 'priority_fee', tenantId: 't1', orderId: 'order-1', amount: '-5' },
        'Bearer t',
      ),
    )

    expect(res.status).toBe(400)
    const service = await import('@/lib/lalamove-service')
    expect(service.addLalamovePriorityFee).not.toHaveBeenCalled()
  })

  test('reports the Lalamove reason rather than a generic failure', async () => {
    // "Quotation expired" tells a merchant to re-quote from the web dashboard.
    // "Something went wrong" leaves them tapping a button that will never work.
    const service = await import('@/lib/lalamove-service')
    ;(service.createLalamoveOrder as unknown as jest.Mock).mockRejectedValue(
      new Error('Quotation expired'),
    )

    const { POST } = await import('@/app/api/lalamove/route')
    const res = await POST(
      makeRequest({ op: 'book', tenantId: 't1', orderId: 'order-1' }, 'Bearer t'),
    )

    const body = (await res.json()) as { success: boolean; error?: string }
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/expired/i)
  })

  test('never books against an order belonging to another tenant', async () => {
    // The order is fetched with the service key, which bypasses RLS — the
    // tenant filter here is the only thing standing between a merchant and
    // another store's order.
    orderRow = null

    const { POST } = await import('@/app/api/lalamove/route')
    const res = await POST(
      makeRequest({ op: 'book', tenantId: 't1', orderId: 'order-1' }, 'Bearer t'),
    )

    expect(res.status).toBe(404)
    const service = await import('@/lib/lalamove-service')
    expect(service.createLalamoveOrder).not.toHaveBeenCalled()
  })
})
