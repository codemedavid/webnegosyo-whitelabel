/**
 * @jest-environment node
 *
 * POST /api/customers/sync-order-lifecycle: the app (and the web admin of a
 * store on its own deployment) reporting that an order moved, so the staff
 * activity log, the Senior/PWD sales book and loyalty catch up. Everything it
 * writes runs as the service role, so the route asks three things first:
 *
 * - the caller holds a grant that lets them move an order (ORDER_READ_KEYS,
 *   the keys the orders UPDATE policy asks for);
 * - on a platform store, the order is the store's (and a branch account's own
 *   branch's) and really is in the status the request reports;
 * - which backend that is comes from the store's row, never the request.
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
jest.mock('@/lib/customer-lifecycle-store', () => ({ createSupabaseLifecycleDeps: jest.fn() }))
jest.mock('@/lib/loyalty/lifecycle', () => ({ runLoyaltyForOrder: jest.fn() }))
jest.mock('@/lib/gov-discount-ledger/reverse-on-cancel', () => ({ reverseGovGrantsBestEffort: jest.fn() }))
jest.mock('@/lib/staff-activity/record-order-event', () => ({
  createSupabaseOrderEventStore: jest.fn(() => ({})),
  recordOrderEventBestEffort: jest.fn(),
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
  return new NextRequest('http://localhost/api/customers/sync-order-lifecycle', {
    method: 'POST',
    headers: withAuth ? { authorization: 'Bearer token-1' } : {},
    body: JSON.stringify(body),
  })
}

const platformBody = (patch: Row = {}) => ({
  tenantId: TENANT,
  backend: 'platform_supabase',
  externalOrderId: ORDER,
  status: 'ready',
  ...patch,
})

const convexBody = (patch: Row = {}) => ({
  tenantId: TENANT,
  backend: 'convex',
  externalOrderId: CONVEX_ORDER,
  status: 'ready',
  ...patch,
})

describe('POST /api/customers/sync-order-lifecycle', () => {
  let tenantRow: Row
  let orderRow: Row | null
  let outletRows: Row[]
  let recordEvent: AnyMock
  let reverseGrants: AnyMock
  let runLoyalty: AnyMock
  let findLedgerOrder: AnyMock

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
    orderRow = { id: ORDER, tenant_id: TENANT, outlet_id: NORTH, status: 'ready', source: 'online', total: 480 }
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
    recordEvent = events.recordOrderEventBestEffort as unknown as AnyMock
    const gov = await import('@/lib/gov-discount-ledger/reverse-on-cancel')
    reverseGrants = gov.reverseGovGrantsBestEffort as unknown as AnyMock
    const loyalty = await import('@/lib/loyalty/lifecycle')
    runLoyalty = loyalty.runLoyaltyForOrder as unknown as AnyMock
    runLoyalty.mockResolvedValue({ ran: false, reason: 'disabled' })
    findLedgerOrder = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(null)
    const store = await import('@/lib/customer-lifecycle-store')
    ;(store.createSupabaseLifecycleDeps as unknown as jest.Mock).mockReturnValue({
      findLedgerOrder,
      updateLedgerOrder: jest.fn(),
    })
  })

  async function post(body: unknown, withAuth = true) {
    const { POST } = await import('@/app/api/customers/sync-order-lifecycle/route')
    return POST(makeRequest(body, withAuth))
  }

  function expectNothingWritten() {
    expect(recordEvent).not.toHaveBeenCalled()
    expect(reverseGrants).not.toHaveBeenCalled()
    expect(runLoyalty).not.toHaveBeenCalled()
    expect(findLedgerOrder).not.toHaveBeenCalled()
  }

  const recordedDraft = () => recordEvent.mock.calls[0]?.[1] as Row

  describe('who may call', () => {
    test('refuses a request with no token', async () => {
      const res = await post(platformBody(), false)

      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: 'Unauthorized' })
      expectNothingWritten()
    })

    test('refuses a member of another store', async () => {
      await asCaller({ tenant_id: OTHER_TENANT, is_owner: true })

      const res = await post(platformBody())

      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: 'Forbidden' })
      expectNothingWritten()
    })

    test.each([['menu'], ['customers'], ['store_setup'], ['vouchers'], ['approve_requests']])(
      'refuses staff who hold no grant that moves an order (only %s)',
      async (key) => {
        await asStaff([key])

        const res = await post(platformBody())

        expect(res.status).toBe(403)
        expect(await res.json()).toEqual({ error: 'Forbidden' })
        expectNothingWritten()
      },
    )

    test('refuses the same account on a store that keeps orders in its own deployment', async () => {
      onConvex()
      await asStaff(['menu'])

      const res = await post(convexBody())

      expect(res.status).toBe(403)
      expectNothingWritten()
    })

    test.each(ORDER_READ_KEYS.map((key) => [key]))('lets staff holding only %s report a move', async (key) => {
      await asStaff([key])

      const res = await post(platformBody())

      expect(res.status).toBe(200)
      expect(recordEvent).toHaveBeenCalledTimes(1)
    })

    test('lets a kitchen-only account report its bump on a store with its own deployment', async () => {
      onConvex()
      await asStaff(['kitchen'])

      const res = await post(convexBody())

      expect(res.status).toBe(200)
      expect(recordEvent).toHaveBeenCalledTimes(1)
    })

    test('lets a legacy full-access account and a superadmin through', async () => {
      await asCaller({ permissions: null })
      expect((await post(platformBody())).status).toBe(200)

      await asCaller({ role: 'superadmin', tenant_id: null, permissions: null })
      expect((await post(platformBody())).status).toBe(200)
    })
  })

  describe('a platform store: the saved order decides', () => {
    test('answers as before for a move the saved order confirms', async () => {
      const res = await post(platformBody())

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        success: true,
        result: 'no_ledger',
        loyalty: { ran: false, reason: 'disabled' },
      })
      expect(runLoyalty).toHaveBeenCalledWith(expect.anything(), {
        tenantId: TENANT,
        backend: 'platform_supabase',
        externalOrderId: ORDER,
      })
    })

    test('refuses an order the store does not hold', async () => {
      orderRow = { ...orderRow, tenant_id: OTHER_TENANT }

      const res = await post(platformBody())

      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'Order not found' })
      expectNothingWritten()
    })

    test('refuses a branch account reporting another branch\'s order', async () => {
      await asStaff(['orders'], SOUTH)

      const res = await post(platformBody())

      expect(res.status).toBe(404)
      expectNothingWritten()
    })

    test('lets a branch account report its own branch\'s order', async () => {
      await asStaff(['kitchen'], NORTH)

      const res = await post(platformBody())

      expect(res.status).toBe(200)
      expect(recordedDraft()).toMatchObject({ outletId: NORTH, status: 'ready' })
    })

    test('refuses a cancel the saved order does not show', async () => {
      const res = await post(platformBody({ status: 'cancelled', reason: 'customer_changed_mind' }))

      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: 'The order is not in that status.' })
      expectNothingWritten()
    })

    test('refuses a move to a step the saved order has not reached', async () => {
      const res = await post(platformBody({ status: 'delivered' }))

      expect(res.status).toBe(409)
      expectNothingWritten()
    })

    // Staff tap an order through its steps about a second apart, and the report
    // travels behind the write: by the time "preparing" lands the order is "ready".
    test.each([['confirmed'], ['preparing']])(
      'keeps the line for a move to %s the order has already passed',
      async (status) => {
        const res = await post(platformBody({ status }))

        expect(res.status).toBe(200)
        expect(recordedDraft()).toMatchObject({ status, outletId: NORTH, orderTotal: 480 })
        expect(reverseGrants).not.toHaveBeenCalled()
      },
    )

    test('refuses an earlier step once the order is cancelled', async () => {
      orderRow = { ...orderRow, status: 'cancelled' }

      const res = await post(platformBody({ status: 'preparing' }))

      expect(res.status).toBe(409)
      expectNothingWritten()
    })

    test('takes the order back out of the sales book for a cancel the saved order shows', async () => {
      orderRow = { ...orderRow, status: 'cancelled' }

      const res = await post(platformBody({ status: 'cancelled' }))

      expect(res.status).toBe(200)
      expect(reverseGrants).toHaveBeenCalledWith(
        expect.anything(),
        { tenantId: TENANT, backend: 'platform_supabase', externalOrderId: ORDER },
        { userId: 'u1', name: 'ana@store.ph' },
      )
    })

    test('looks the order up whatever backend the request names', async () => {
      const res = await post(platformBody({ backend: 'convex', status: 'cancelled' }))

      expect(res.status).toBe(409)
      expectNothingWritten()
    })

    test('files the event under the saved order\'s branch, source and total, not the request\'s', async () => {
      await post(platformBody({ outletId: SOUTH, source: 'pos', orderTotal: 1 }))

      expect(recordedDraft()).toMatchObject({
        tenantId: TENANT,
        backend: 'platform_supabase',
        externalOrderId: ORDER,
        event: 'status_changed',
        status: 'ready',
        outletId: NORTH,
        source: 'online',
        orderTotal: 480,
        actorUserId: 'u1',
      })
    })

    test('a payment-only report carries no status to check and still reaches loyalty', async () => {
      const res = await post(platformBody({ status: undefined, paymentStatus: 'paid' }))

      expect(res.status).toBe(200)
      expect(recordEvent).not.toHaveBeenCalled()
      expect(runLoyalty).toHaveBeenCalledTimes(1)
    })

    test('a payment-only report still needs an order the store holds', async () => {
      orderRow = null

      const res = await post(platformBody({ status: undefined, paymentStatus: 'paid' }))

      expect(res.status).toBe(404)
      expectNothingWritten()
    })

    test('answers 503 and writes nothing when the order cannot be checked', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined)
      const admin = await import('@/lib/supabase/admin')
      ;(admin.createAdminClient as unknown as jest.Mock).mockImplementation(
        () => fakeSupabaseTables({ tenants: [tenantRow] }, { orders: 'timeout' }).client,
      )

      const res = await post(platformBody())

      expect(res.status).toBe(503)
      expectNothingWritten()
      jest.restoreAllMocks()
    })
  })

  describe('a store on its own deployment: the order cannot be read here', () => {
    beforeEach(() => onConvex())

    test('takes the reported status as sent and syncs the ledger', async () => {
      const res = await post(convexBody({ status: 'cancelled' }))

      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ success: true, result: 'not_found', loyalty: null })
      expect(findLedgerOrder).toHaveBeenCalledWith({ tenantId: TENANT, backend: 'convex', externalOrderId: CONVEX_ORDER })
      expect(reverseGrants).toHaveBeenCalledTimes(1)
    })

    test('keeps the total the device reported', async () => {
      await post(convexBody({ orderTotal: 320 }))

      expect(recordedDraft()).toMatchObject({ backend: 'convex', orderTotal: 320, status: 'ready' })
    })

    test('files a branch account\'s event under its own branch whatever the request names', async () => {
      await asStaff(['kitchen'], NORTH)

      await post(convexBody({ outletId: SOUTH }))

      expect(recordedDraft()).toMatchObject({ outletId: NORTH })
    })

    test('drops a branch a store-wide account names when it is not the store\'s', async () => {
      outletRows = [{ id: NORTH, tenant_id: TENANT }, { id: SOUTH, tenant_id: OTHER_TENANT }]

      await post(convexBody({ outletId: SOUTH }))
      expect(recordedDraft()).toMatchObject({ outletId: null })

      recordEvent.mockClear()
      await post(convexBody({ outletId: NORTH }))
      expect(recordedDraft()).toMatchObject({ outletId: NORTH })
    })
  })

  describe('what the request must look like', () => {
    test.each([
      [{}, 'A valid tenantId is required.'],
      [{ tenantId: TENANT, backend: 'nowhere', externalOrderId: ORDER, status: 'ready' }, 'backend must be one of: convex, tenant_supabase, platform_supabase.'],
      [{ tenantId: TENANT, backend: 'convex', externalOrderId: ORDER }, 'At least one of status or paymentStatus is required.'],
      [{ ...platformBody(), customerId: 'c1' }, 'customerId is resolved server-side and must not be supplied.'],
    ])('answers 400 with the parser\'s own sentence', async (body, message) => {
      const res = await post(body)

      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: message })
      expectNothingWritten()
    })

    test('answers 400 for a body that is not JSON', async () => {
      const { POST } = await import('@/app/api/customers/sync-order-lifecycle/route')
      const res = await POST(
        new NextRequest('http://localhost/api/customers/sync-order-lifecycle', {
          method: 'POST',
          headers: { authorization: 'Bearer token-1' },
          body: 'not json',
        }),
      )

      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'A JSON object body is required.' })
    })
  })
})
