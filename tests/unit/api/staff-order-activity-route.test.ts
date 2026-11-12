/**
 * @jest-environment node
 *
 * POST /api/staff/order-activity: the register reporting that it rang a sale,
 * so "punched through POS" sits in the same log as confirms and cancels. The
 * line is written as the service role, so the route decides for itself:
 *
 * - who may report one: a member holding a grant that lets them place an order
 *   (ORDER_READ_KEYS, the keys the orders INSERT policy asks for);
 * - on a platform store, that the order is the store's (and a branch account's
 *   own branch's), and it takes the branch, source and total from that order;
 * - elsewhere the order cannot be read: a branch account's line goes under its
 *   own branch, a store-wide account may name one of the store's branches, and
 *   the total is the amount the device reported.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'
import { ORDER_READ_KEYS } from '@/lib/staff-permissions'
import { fakeSupabaseTables } from '../../fixtures/fake-supabase-tables'

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/queries/fetch-app-user-scope', () => ({
  asAppUserQueryClient: (client: unknown) => client,
  fetchAppUserScope: jest.fn(),
}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/staff-activity/record-order-event', () => ({
  createSupabaseOrderEventStore: jest.fn(() => ({})),
  recordOrderEvent: jest.fn(),
}))

const TENANT = '11111111-1111-4111-8111-111111111111'
const OTHER_TENANT = '99999999-9999-4999-8999-999999999999'
const ORDER = '7d1c3a2e-5b4f-4c8d-9e0a-1b2c3d4e5f60'
const NORTH = '22222222-2222-4222-8222-222222222222'
const SOUTH = '33333333-3333-4333-8333-333333333333'
const CONVEX_ORDER = 'jd7f3k2m9x'

type Row = Record<string, unknown>
type AnyMock = jest.Mock<(...args: unknown[]) => Promise<unknown>>

function makeRequest(body: unknown, withAuth = true): NextRequest {
  return new NextRequest('http://localhost/api/staff/order-activity', {
    method: 'POST',
    headers: withAuth ? { authorization: 'Bearer token-1' } : {},
    body: JSON.stringify(body),
  })
}

/** What the register sends today (`report-pos-sale.ts`). */
const platformBody = (patch: Row = {}) => ({
  tenantId: TENANT,
  backend: 'platform_supabase',
  externalOrderId: ORDER,
  status: 'pending',
  source: 'pos',
  orderTotal: 480,
  outletId: NORTH,
  ...patch,
})

const convexBody = (patch: Row = {}) => ({
  ...platformBody(),
  backend: 'convex',
  externalOrderId: CONVEX_ORDER,
  outletId: null,
  ...patch,
})

describe('POST /api/staff/order-activity', () => {
  let tenantRow: Row
  let orderRow: Row | null
  let outletRows: Row[]
  let recordEvent: AnyMock

  async function asCaller(appUser: Row) {
    const scope = await import('@/lib/queries/fetch-app-user-scope')
    ;(scope.fetchAppUserScope as unknown as AnyMock).mockResolvedValue({
      appUser: { role: 'admin', tenant_id: TENANT, is_owner: false, outlet_id: null, ...appUser },
    })
  }

  const asStaff = (permissions: string[], outletId: string | null = null) =>
    asCaller({ permissions, outlet_id: outletId })

  function onConvex() {
    tenantRow = { id: TENANT, order_backend: 'auto', convex_deployment_url: 'https://calm-owl-1.convex.cloud' }
    orderRow = null
  }

  beforeEach(async () => {
    jest.resetModules()
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    tenantRow = { id: TENANT, order_backend: 'auto', convex_deployment_url: null }
    orderRow = { id: ORDER, tenant_id: TENANT, outlet_id: NORTH, status: 'pending', source: 'pos', total: 480 }
    outletRows = [{ id: NORTH, tenant_id: TENANT }, { id: SOUTH, tenant_id: TENANT }]

    const { createClient } = await import('@supabase/supabase-js')
    ;(createClient as unknown as jest.Mock).mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'ana@store.ph' } }, error: null }) },
    })
    await asCaller({ is_owner: true, permissions: null })

    const admin = await import('@/lib/supabase/admin')
    ;(admin.createAdminClient as unknown as jest.Mock).mockImplementation(
      () => fakeSupabaseTables({ tenants: [tenantRow], orders: orderRow ? [orderRow] : [], outlets: outletRows }).client,
    )

    const events = await import('@/lib/staff-activity/record-order-event')
    recordEvent = events.recordOrderEvent as unknown as AnyMock
    recordEvent.mockResolvedValue('recorded')
  })

  async function post(body: unknown, withAuth = true) {
    const { POST } = await import('@/app/api/staff/order-activity/route')
    return POST(makeRequest(body, withAuth))
  }

  const recordedDraft = () => recordEvent.mock.calls[0]?.[1] as Row

  describe('who may call', () => {
    test('refuses a request with no token', async () => {
      const res = await post(platformBody(), false)

      expect(res.status).toBe(401)
      expect(recordEvent).not.toHaveBeenCalled()
    })

    test('refuses a member of another store', async () => {
      await asCaller({ tenant_id: OTHER_TENANT, is_owner: true })

      const res = await post(platformBody())

      expect(res.status).toBe(403)
      expect(recordEvent).not.toHaveBeenCalled()
    })

    test.each([['menu'], ['customers'], ['store_setup'], ['activity_view']])(
      'refuses staff who hold no grant that places an order (only %s)',
      async (key) => {
        await asStaff([key])

        const res = await post(platformBody())

        expect(res.status).toBe(403)
        expect(await res.json()).toEqual({ error: 'Forbidden' })
        expect(recordEvent).not.toHaveBeenCalled()
      },
    )

    test.each(ORDER_READ_KEYS.map((key) => [key]))('lets staff holding only %s report a sale', async (key) => {
      await asStaff([key])

      const res = await post(platformBody())

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ success: true, outcome: 'recorded' })
    })

    test('lets a host with only the floor grant report a table\'s sale on a store with its own deployment', async () => {
      onConvex()
      await asStaff(['tables'])

      expect((await post(convexBody())).status).toBe(200)
    })
  })

  describe('a platform store: the saved order decides', () => {
    test('records the sale under the order\'s own branch, source and total', async () => {
      orderRow = { ...orderRow, outlet_id: SOUTH, total: '512.25', source: 'pos' }

      const res = await post(platformBody({ outletId: NORTH, orderTotal: 9_999_999 }))

      expect(res.status).toBe(200)
      expect(recordedDraft()).toEqual({
        tenantId: TENANT,
        outletId: SOUTH,
        backend: 'platform_supabase',
        externalOrderId: ORDER,
        event: 'placed',
        status: 'pending',
        source: 'pos',
        orderTotal: 512.25,
        actorUserId: 'u1',
        actorName: 'ana@store.ph',
      })
    })

    test('refuses an order the store does not hold', async () => {
      orderRow = { ...orderRow, tenant_id: OTHER_TENANT }

      const res = await post(platformBody())

      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'Order not found' })
      expect(recordEvent).not.toHaveBeenCalled()
    })

    test('refuses a branch account reporting another branch\'s order', async () => {
      await asStaff(['pos'], SOUTH)

      const res = await post(platformBody({ outletId: SOUTH }))

      expect(res.status).toBe(404)
      expect(recordEvent).not.toHaveBeenCalled()
    })

    test('lets a branch cashier report their own branch\'s sale', async () => {
      await asStaff(['pos'], NORTH)

      const res = await post(platformBody())

      expect(res.status).toBe(200)
      expect(recordedDraft()).toMatchObject({ outletId: NORTH, orderTotal: 480 })
    })

    test('looks the order up whatever backend the request names', async () => {
      orderRow = null

      const res = await post(platformBody({ backend: 'convex' }))

      expect(res.status).toBe(404)
      expect(recordEvent).not.toHaveBeenCalled()
    })

    test('answers 503 and records nothing when the order cannot be checked', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined)
      const admin = await import('@/lib/supabase/admin')
      ;(admin.createAdminClient as unknown as jest.Mock).mockImplementation(
        () => fakeSupabaseTables({ tenants: [tenantRow] }, { orders: 'timeout' }).client,
      )

      const res = await post(platformBody())

      expect(res.status).toBe(503)
      expect(recordEvent).not.toHaveBeenCalled()
      jest.restoreAllMocks()
    })
  })

  describe('a store on its own deployment: the order cannot be read here', () => {
    beforeEach(() => onConvex())

    test('records the sale with the total the device reported', async () => {
      const res = await post(convexBody({ orderTotal: 320 }))

      expect(res.status).toBe(200)
      expect(recordedDraft()).toMatchObject({
        backend: 'convex',
        externalOrderId: CONVEX_ORDER,
        event: 'placed',
        source: 'pos',
        orderTotal: 320,
        outletId: null,
      })
    })

    test('files a branch cashier\'s sale under their own branch whatever the request names', async () => {
      await asStaff(['pos'], NORTH)

      await post(convexBody({ outletId: SOUTH }))

      expect(recordedDraft()).toMatchObject({ outletId: NORTH })
    })

    test('lets a store-wide account name a branch of the store, and drops one that is not', async () => {
      outletRows = [{ id: NORTH, tenant_id: TENANT }, { id: SOUTH, tenant_id: OTHER_TENANT }]

      await post(convexBody({ outletId: NORTH }))
      expect(recordedDraft()).toMatchObject({ outletId: NORTH })

      recordEvent.mockClear()
      const res = await post(convexBody({ outletId: SOUTH }))
      expect(res.status).toBe(200)
      expect(recordedDraft()).toMatchObject({ outletId: null })
    })
  })

  describe('what the request must look like', () => {
    test.each([
      [{}, 'A valid tenantId is required.'],
      [platformBody({ source: 'kiosk' }), 'source must be pos or online.'],
      [platformBody({ actorUserId: 'someone-else' }), 'The actor is resolved from the session and must not be supplied.'],
      [platformBody({ outletId: 'north' }), 'outletId must be a uuid.'],
    ])('answers 400 with the parser\'s own sentence', async (body, message) => {
      const res = await post(body)

      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: message })
      expect(recordEvent).not.toHaveBeenCalled()
    })
  })

  test('answers 500 with its own sentence when the write fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    recordEvent.mockRejectedValue(new Error('insert failed'))

    const res = await post(platformBody())

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Could not record the sale.' })
    jest.restoreAllMocks()
  })
})
