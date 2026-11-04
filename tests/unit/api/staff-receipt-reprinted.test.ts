/**
 * @jest-environment node
 *
 * POST /api/staff/receipt-reprinted — a manual reprint becomes ONE Store
 * Activity line ("Ana reprinted #12 receipt"), written as the service role for
 * a caller who may read the store's orders, about an order the store really
 * owns, deduped per order per minute.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/queries/fetch-app-user-scope', () => ({
  asAppUserQueryClient: (client: unknown) => client,
  fetchAppUserScope: jest.fn(),
}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: jest.fn() }))

const TENANT = '11111111-1111-4111-8111-111111111111'
const ORDER_ID = '7d1c3a2e-5b4f-4c8d-9e0a-1b2c3d4e5f60'
const OUTLET = '22222222-2222-4222-8222-222222222222'
const OTHER_OUTLET = '33333333-3333-4333-8333-333333333333'

type RpcCall = { fn: string; params: Record<string, unknown> }

function makeRequest(body: unknown, withAuth = true): NextRequest {
  return new NextRequest('http://localhost/api/staff/receipt-reprinted', {
    method: 'POST',
    headers: withAuth ? { authorization: 'Bearer token-1' } : {},
    body: JSON.stringify(body),
  })
}

const PLATFORM_BODY = { tenantId: TENANT, backend: 'platform_supabase', orderId: ORDER_ID }

describe('POST /api/staff/receipt-reprinted', () => {
  let rpcCalls: RpcCall[]
  let orderRow: Record<string, unknown> | null
  let rpcResult: { data: unknown; error: { message: string } | null }
  let rateAllowed: boolean

  async function asCaller(appUser: Record<string, unknown>) {
    const scope = await import('@/lib/queries/fetch-app-user-scope')
    ;(scope.fetchAppUserScope as unknown as jest.Mock<() => Promise<unknown>>).mockResolvedValue({
      appUser: { role: 'admin', tenant_id: TENANT, is_owner: false, outlet_id: null, ...appUser },
    })
  }

  beforeEach(async () => {
    jest.resetModules()
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    rpcCalls = []
    orderRow = { id: ORDER_ID, outlet_id: OUTLET, daily_number: 12 }
    rpcResult = { data: true, error: null }
    rateAllowed = true

    const { createClient } = await import('@supabase/supabase-js')
    ;(createClient as unknown as jest.Mock).mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'ana@store.ph' } }, error: null }) },
    })
    await asCaller({ is_owner: true, permissions: null })

    const rate = await import('@/lib/distributed-rate-limit')
    ;(rate.checkRateLimit as unknown as jest.Mock<() => Promise<unknown>>).mockImplementation(async () => ({
      allowed: rateAllowed,
      remaining: 0,
      retryAfterSec: 30,
    }))

    const admin = await import('@/lib/supabase/admin')
    ;(admin.createAdminClient as unknown as jest.Mock).mockReturnValue({
      from: () => {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: orderRow, error: null }),
        }
        return chain
      },
      rpc: async (fn: string, params: Record<string, unknown>) => {
        rpcCalls.push({ fn, params })
        return rpcResult
      },
    })
  })

  async function post(body: unknown, withAuth = true) {
    const { POST } = await import('@/app/api/staff/receipt-reprinted/route')
    return POST(makeRequest(body, withAuth))
  }

  test('writes one receipt.reprinted row with the order, actor and branch', async () => {
    const res = await post(PLATFORM_BODY)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, recorded: true })
    expect(rpcCalls).toHaveLength(1)
    const { fn, params } = rpcCalls[0]!
    expect(fn).toBe('store_activity_write')
    expect(params).toMatchObject({
      p_tenant_id: TENANT,
      p_kind: 'receipt.reprinted',
      p_source_table: 'receipt_reprints',
      p_source_id: ORDER_ID,
      p_outlet_id: OUTLET,
      p_actor_user_id: 'u1',
      p_actor_name: 'ana',
      p_subject_type: 'order',
      p_subject_ref: ORDER_ID,
      p_order_number: '#12',
      p_backend: 'platform',
      p_external_order_id: ORDER_ID,
      p_summary: { title: 'Reprinted #12 receipt' },
    })
  })

  test('dedupes per order per minute through the event key', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 10, 4, 9, 15, 10))
    await post(PLATFORM_BODY)
    jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 10, 4, 9, 15, 50))
    await post(PLATFORM_BODY)
    jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 10, 4, 9, 16, 5))
    await post(PLATFORM_BODY)
    const keys = rpcCalls.map((call) => call.params.p_event_key)
    expect(keys[0]).toBe(keys[1])
    expect(keys[2]).not.toBe(keys[0])
    expect(String(keys[0])).toContain(`${TENANT}:${ORDER_ID}:`)
    jest.restoreAllMocks()
  })

  test('says recorded:false when the minute already has its row', async () => {
    rpcResult = { data: false, error: null }
    const res = await post(PLATFORM_BODY)
    expect(await res.json()).toEqual({ success: true, recorded: false })
  })

  test('401 without a token, and nothing is written', async () => {
    const res = await post(PLATFORM_BODY, false)
    expect(res.status).toBe(401)
    expect(rpcCalls).toHaveLength(0)
  })

  test('403 for a member of another store', async () => {
    await asCaller({ tenant_id: '99999999-9999-4999-8999-999999999999', is_owner: true })
    const res = await post(PLATFORM_BODY)
    expect(res.status).toBe(403)
    expect(rpcCalls).toHaveLength(0)
  })

  test.each([['menu'], ['settings'], ['customers']])('403 for staff holding only %s', async (key) => {
    await asCaller({ permissions: [key] })
    const res = await post(PLATFORM_BODY)
    expect(res.status).toBe(403)
    expect(rpcCalls).toHaveLength(0)
  })

  test.each([['orders'], ['pos'], ['kitchen'], ['tables']])('lets %s staff record a reprint', async (key) => {
    await asCaller({ permissions: [key] })
    expect((await post(PLATFORM_BODY)).status).toBe(200)
  })

  test('404 for an order the store does not hold', async () => {
    orderRow = null
    const res = await post(PLATFORM_BODY)
    expect(res.status).toBe(404)
    expect(rpcCalls).toHaveLength(0)
  })

  test("404 when a branch account reports another branch's order", async () => {
    await asCaller({ permissions: ['pos'], outlet_id: OTHER_OUTLET })
    const res = await post(PLATFORM_BODY)
    expect(res.status).toBe(404)
    expect(rpcCalls).toHaveLength(0)
  })

  test("a branch account's Convex reprint is filed under its own branch, whatever the body says", async () => {
    await asCaller({ permissions: ['pos'], outlet_id: OUTLET })
    const res = await post({ tenantId: TENANT, backend: 'convex', orderId: 'k57convexid', outletId: OTHER_OUTLET, dailyNumber: 3 })
    expect(res.status).toBe(200)
    expect(rpcCalls[0]!.params).toMatchObject({ p_outlet_id: OUTLET, p_backend: 'convex', p_order_number: '#03' })
  })

  test('400 when the body names the actor or is malformed', async () => {
    expect((await post({ ...PLATFORM_BODY, actorUserId: 'someone' })).status).toBe(400)
    expect((await post({ tenantId: 'nope', backend: 'platform_supabase', orderId: ORDER_ID })).status).toBe(400)
    expect((await post({ ...PLATFORM_BODY, backend: 'mysql' })).status).toBe(400)
    expect(rpcCalls).toHaveLength(0)
  })

  test('429 past the per-person limit', async () => {
    rateAllowed = false
    const res = await post(PLATFORM_BODY)
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
    expect(rpcCalls).toHaveLength(0)
  })

  test('500 (logged) when the write fails — the app only logs it', async () => {
    rpcResult = { data: null, error: { message: 'boom' } }
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const res = await post(PLATFORM_BODY)
    expect(res.status).toBe(500)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
