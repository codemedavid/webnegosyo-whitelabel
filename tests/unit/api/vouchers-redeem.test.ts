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

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

jest.mock('@/lib/vouchers/repository', () => ({
  redeemVoucher: jest.fn(),
}))

const VALID_BODY = {
  tenantId: 't1',
  orderId: 'order-1',
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
  let getUserMock: jest.Mock
  let appUserSingleMock: jest.Mock
  let redeemMock: jest.Mock

  beforeEach(async () => {
    jest.resetModules()
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

    const { createClient } = await import('@supabase/supabase-js')
    const mockCreateClient = createClient as unknown as jest.Mock

    getUserMock = jest.fn()
    appUserSingleMock = jest.fn()

    getUserMock.mockResolvedValue({ data: { user: { id: 'cashier-1' } }, error: null })
    appUserSingleMock.mockResolvedValue({
      data: { role: 'admin', tenant_id: 't1', outlet_id: 'outlet-9' },
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

    const { createAdminClient } = await import('@/lib/supabase/admin')
    ;(createAdminClient as unknown as jest.Mock).mockReturnValue({ rpc: jest.fn() })

    const repo = await import('@/lib/vouchers/repository')
    redeemMock = repo.redeemVoucher as unknown as jest.Mock
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
      orderId: 'order-1',
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

  test('passes the branch through so a burn is attributed to the shop', async () => {
    const { POST } = await import('@/app/api/vouchers/redeem/route')
    await POST(makeRequest({ ...VALID_BODY, outletId: 'outlet-2' }, 'Bearer t'))

    expect(redeemMock.mock.calls[0][1]).toMatchObject({ outletId: 'outlet-2' })
  })
})
