/**
 * @jest-environment node
 *
 * Tests for POST /api/vouchers/redeem
 *
 * The register prices vouchers locally so it keeps working on a flaky counter
 * connection, but it cannot burn a redemption: `redeem_voucher()` is
 * SECURITY DEFINER and executable by `service_role` only — deliberately, after
 * a security review found PostgREST had published it to anon. The phone holds
 * an anon key, so the burn has to happen on a server that holds the service
 * key.
 *
 * Without this route a POS voucher's `used_count` never moves, which means a
 * usage-limited code can be reused at a counter indefinitely.
 *
 * Authenticated via the caller's own Supabase access token — the same trust
 * level as /api/inventory/order-stock, which the register already calls.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'
import { fakeSupabaseTables } from '../../fixtures/fake-supabase-tables'

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

jest.mock('@/lib/vouchers/repository', () => ({
  redeemVoucher: jest.fn(),
}))

/** A platform order id is a uuid; the store in these tests keeps its orders on the platform. */
const ORDER_ID = '7d1c3a2e-5b4f-4c8d-9e0a-1b2c3d4e5f60'

const VALID_BODY = {
  tenantId: 't1',
  orderId: ORDER_ID,
  channel: 'pos',
  redemptions: [{ voucherId: 'v-1', amount: 20 }],
}

function makeRequest(body: unknown, authHeader?: string): NextRequest {
  return new NextRequest('http://localhost/api/vouchers/redeem', {
    method: 'POST',
    headers: authHeader ? { authorization: authHeader } : {},
    body: JSON.stringify(body),
  })
}

describe('POST /api/vouchers/redeem', () => {
  let getUserMock: jest.Mock<(...args: unknown[]) => Promise<unknown>>
  let appUserSingleMock: jest.Mock<(...args: unknown[]) => Promise<unknown>>
  let redeemMock: jest.Mock<(...args: unknown[]) => Promise<unknown>>
  let storeOutletIds: string[]
  let tenantRow: Record<string, unknown>
  let orderRows: Record<string, unknown>[]
  let adminFailures: Record<string, string>
  let adminTablesRead: string[]

  beforeEach(async () => {
    jest.resetModules()
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

    const { createClient } = await import('@supabase/supabase-js')
    const mockCreateClient = createClient as unknown as jest.Mock

    getUserMock = jest.fn<(...args: unknown[]) => Promise<unknown>>()
    appUserSingleMock = jest.fn<(...args: unknown[]) => Promise<unknown>>()

    getUserMock.mockResolvedValue({ data: { user: { id: 'cashier-1' } }, error: null })
    appUserSingleMock.mockResolvedValue({
      data: { role: 'admin', tenant_id: 't1', outlet_id: 'outlet-9' },
      error: null,
    })

    mockCreateClient.mockReturnValue({
      auth: { getUser: getUserMock },
      from: jest.fn(() => {
        const builder: Record<string, unknown> = { single: appUserSingleMock, maybeSingle: appUserSingleMock }
        builder.select = jest.fn(() => builder)
        builder.eq = jest.fn(() => builder)
        return builder
      }),
    })

    const { createAdminClient } = await import('@/lib/supabase/admin')
    storeOutletIds = ['outlet-2', 'outlet-9']
    tenantRow = { id: 't1', order_backend: 'auto', convex_deployment_url: null }
    orderRows = [{ id: ORDER_ID, tenant_id: 't1', outlet_id: 'outlet-9', status: 'pending', source: 'pos', total: 200 }]
    adminFailures = {}
    adminTablesRead = []
    ;(createAdminClient as unknown as jest.Mock).mockImplementation(() => {
      const fake = fakeSupabaseTables(
        {
          tenants: [tenantRow],
          orders: orderRows,
          outlets: storeOutletIds.map((id) => ({ id, tenant_id: 't1' })),
        },
        adminFailures,
      )
      adminTablesRead = fake.seen
      return { rpc: jest.fn(), from: fake.client.from }
    })

    const repo = await import('@/lib/vouchers/repository')
    redeemMock = repo.redeemVoucher as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>
    redeemMock.mockResolvedValue({ redeemed: true })
  })

  test('rejects a request missing tenantId or orderId', async () => {
    const { POST } = await import('@/app/api/vouchers/redeem/route')
    const res = await POST(makeRequest({ redemptions: [] }, 'Bearer t'))

    expect(res.status).toBe(400)
  })

  test('rejects a request with no redemptions to burn', async () => {
    const { POST } = await import('@/app/api/vouchers/redeem/route')
    const res = await POST(makeRequest({ ...VALID_BODY, redemptions: [] }, 'Bearer t'))

    expect(res.status).toBe(400)
  })

  test('rejects a request with no Authorization header', async () => {
    const { POST } = await import('@/app/api/vouchers/redeem/route')
    const res = await POST(makeRequest(VALID_BODY))

    expect(res.status).toBe(401)
    expect(redeemMock).not.toHaveBeenCalled()
  })

  test('rejects when the token does not resolve to a user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: new Error('invalid') })
    const { POST } = await import('@/app/api/vouchers/redeem/route')
    const res = await POST(makeRequest(VALID_BODY, 'Bearer bad'))

    expect(res.status).toBe(401)
    expect(redeemMock).not.toHaveBeenCalled()
  })

  test('rejects an admin of a different tenant', async () => {
    // Otherwise any merchant could exhaust a competitor's voucher budget.
    appUserSingleMock.mockResolvedValue({
      data: { role: 'admin', tenant_id: 'other-tenant' },
      error: null,
    })
    const { POST } = await import('@/app/api/vouchers/redeem/route')
    const res = await POST(makeRequest(VALID_BODY, 'Bearer t'))

    expect(res.status).toBe(403)
    expect(redeemMock).not.toHaveBeenCalled()
  })

  test('burns each presented redemption', async () => {
    const { POST } = await import('@/app/api/vouchers/redeem/route')
    const res = await POST(
      makeRequest(
        {
          ...VALID_BODY,
          redemptions: [
            { voucherId: 'v-1', amount: 20 },
            { voucherId: 'v-2', amount: 5 },
          ],
        },
        'Bearer t',
      ),
    )

    expect(res.status).toBe(200)
    expect(redeemMock).toHaveBeenCalledTimes(2)
    expect(redeemMock.mock.calls[0][1]).toMatchObject({
      tenantId: 't1',
      voucherId: 'v-1',
      orderId: ORDER_ID,
      amount: 20,
      channel: 'pos',
    })
  })

  test('credits the burn to the authenticated user, never the request body', async () => {
    // The audit trail is the whole defence against a forced discount at the
    // counter. A cashier who could name someone else in the body could take
    // money off and pin it on a colleague.
    const { POST } = await import('@/app/api/vouchers/redeem/route')
    await POST(
      makeRequest({ ...VALID_BODY, redeemedBy: 'someone-else' }, 'Bearer t'),
    )

    expect(redeemMock.mock.calls[0][1]).toMatchObject({ redeemedBy: 'cashier-1' })
  })

  test('reports a burn that did not happen instead of claiming success', async () => {
    // An exhausted voucher must surface, or the merchant believes a usage
    // limit is being enforced when it is not.
    redeemMock.mockResolvedValue({ redeemed: false, error: 'usage limit reached' })
    const { POST } = await import('@/app/api/vouchers/redeem/route')
    const res = await POST(makeRequest(VALID_BODY, 'Bearer t'))
    const json = await res.json()

    expect(json.results).toEqual([
      { voucherId: 'v-1', redeemed: false, error: 'usage limit reached' },
    ])
  })

  test('skips a redemption whose amount is not a positive number', async () => {
    const { POST } = await import('@/app/api/vouchers/redeem/route')
    const res = await POST(
      makeRequest(
        { ...VALID_BODY, redemptions: [{ voucherId: 'v-1', amount: 0 }] },
        'Bearer t',
      ),
    )

    expect(res.status).toBe(400)
    expect(redeemMock).not.toHaveBeenCalled()
  })

  test('attributes a branch-locked cashier\'s burn to their own branch', async () => {
    const { POST } = await import('@/app/api/vouchers/redeem/route')
    await POST(makeRequest({ ...VALID_BODY, outletId: 'outlet-9' }, 'Bearer t'))

    expect(redeemMock.mock.calls[0][1]).toMatchObject({ outletId: 'outlet-9' })
  })

  test('uses the cashier\'s own branch when the body names none', async () => {
    const { POST } = await import('@/app/api/vouchers/redeem/route')
    await POST(makeRequest({ ...VALID_BODY, outletId: null }, 'Bearer t'))

    expect(redeemMock.mock.calls[0][1]).toMatchObject({ outletId: 'outlet-9' })
  })

  test('refuses a branch-locked cashier naming another branch', async () => {
    const { POST } = await import('@/app/api/vouchers/redeem/route')
    const res = await POST(makeRequest({ ...VALID_BODY, outletId: 'outlet-2' }, 'Bearer t'))

    expect(res.status).toBe(403)
    expect(redeemMock).not.toHaveBeenCalled()
  })

  test('lets a store-wide account attribute the burn to one of the store\'s branches', async () => {
    appUserSingleMock.mockResolvedValue({ data: { role: 'admin', tenant_id: 't1', is_owner: true, outlet_id: null }, error: null })
    const { POST } = await import('@/app/api/vouchers/redeem/route')
    await POST(makeRequest({ ...VALID_BODY, outletId: 'outlet-2' }, 'Bearer t'))

    expect(redeemMock.mock.calls[0][1]).toMatchObject({ outletId: 'outlet-2' })
  })

  test('burns a store-wide sale naming a branch outside the store under no branch', async () => {
    // The burn runs after the customer paid; refusing it would leave the code
    // unspent. The branch is attribution only, so a stale one is dropped.
    appUserSingleMock.mockResolvedValue({ data: { role: 'admin', tenant_id: 't1', is_owner: true, outlet_id: null }, error: null })
    const { POST } = await import('@/app/api/vouchers/redeem/route')
    const res = await POST(makeRequest({ ...VALID_BODY, outletId: 'other-store-branch' }, 'Bearer t'))

    expect(res.status).toBe(200)
    expect(redeemMock.mock.calls[0][1]).toMatchObject({ outletId: null })
  })

  test.each([['menu'], ['orders'], ['customers']])('refuses staff without pos (holding %s)', async (key) => {
    appUserSingleMock.mockResolvedValue({
      data: { role: 'admin', tenant_id: 't1', is_owner: false, permissions: [key], outlet_id: null },
      error: null,
    })
    const { POST } = await import('@/app/api/vouchers/redeem/route')
    const res = await POST(makeRequest(VALID_BODY, 'Bearer t'))

    expect(res.status).toBe(403)
    expect(redeemMock).not.toHaveBeenCalled()
  })

  describe('the order the burn is recorded against', () => {
    const asStoreWide = () =>
      appUserSingleMock.mockResolvedValue({
        data: { role: 'admin', tenant_id: 't1', is_owner: true, outlet_id: null },
        error: null,
      })

    test('refuses an order the store does not hold', async () => {
      orderRows = [{ ...orderRows[0], tenant_id: 'other-tenant' }]
      const { POST } = await import('@/app/api/vouchers/redeem/route')
      const res = await POST(makeRequest(VALID_BODY, 'Bearer t'))

      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'Order not found' })
      expect(redeemMock).not.toHaveBeenCalled()
    })

    test('refuses an order id the store has never written', async () => {
      orderRows = []
      const { POST } = await import('@/app/api/vouchers/redeem/route')

      const unknown = await POST(makeRequest(VALID_BODY, 'Bearer t'))
      const notAnId = await POST(makeRequest({ ...VALID_BODY, orderId: 'order-1' }, 'Bearer t'))

      expect(unknown.status).toBe(404)
      expect(notAnId.status).toBe(404)
      expect(redeemMock).not.toHaveBeenCalled()
    })

    test('refuses a branch-locked cashier burning against another branch\'s order', async () => {
      orderRows = [{ ...orderRows[0], outlet_id: 'outlet-2' }]
      const { POST } = await import('@/app/api/vouchers/redeem/route')
      const res = await POST(makeRequest(VALID_BODY, 'Bearer t'))

      expect(res.status).toBe(404)
      expect(redeemMock).not.toHaveBeenCalled()
    })

    test('lets a store-wide account burn against any branch\'s order, or one with no branch', async () => {
      asStoreWide()
      const { POST } = await import('@/app/api/vouchers/redeem/route')

      orderRows = [{ ...orderRows[0], outlet_id: 'outlet-2' }]
      expect((await POST(makeRequest(VALID_BODY, 'Bearer t'))).status).toBe(200)

      orderRows = [{ ...orderRows[0], outlet_id: null }]
      expect((await POST(makeRequest(VALID_BODY, 'Bearer t'))).status).toBe(200)
      expect(redeemMock).toHaveBeenCalledTimes(2)
    })

    test('answers 503 and burns nothing when the order cannot be checked', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined)
      adminFailures = { orders: 'timeout' }
      const { POST } = await import('@/app/api/vouchers/redeem/route')
      const res = await POST(makeRequest(VALID_BODY, 'Bearer t'))

      expect(res.status).toBe(503)
      expect(redeemMock).not.toHaveBeenCalled()
      jest.restoreAllMocks()
    })

    test('a store on its own deployment burns as before: its orders cannot be read here', async () => {
      tenantRow = { id: 't1', order_backend: 'auto', convex_deployment_url: 'https://calm-owl-1.convex.cloud' }
      orderRows = []
      const { POST } = await import('@/app/api/vouchers/redeem/route')
      const res = await POST(makeRequest({ ...VALID_BODY, orderId: 'jd7f3k2m9x' }, 'Bearer t'))

      expect(res.status).toBe(200)
      expect(redeemMock.mock.calls[0][1]).toMatchObject({ orderId: 'jd7f3k2m9x', outletId: 'outlet-9' })
      expect(adminTablesRead).not.toContain('orders')
    })
  })

  test('lets pos staff burn', async () => {
    appUserSingleMock.mockResolvedValue({
      data: { role: 'admin', tenant_id: 't1', is_owner: false, permissions: ['pos'], outlet_id: null },
      error: null,
    })
    const { POST } = await import('@/app/api/vouchers/redeem/route')
    const res = await POST(makeRequest(VALID_BODY, 'Bearer t'))

    expect(res.status).toBe(200)
    expect(redeemMock).toHaveBeenCalledTimes(1)
  })
})
