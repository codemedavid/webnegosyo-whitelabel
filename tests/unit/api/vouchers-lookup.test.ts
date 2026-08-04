/**
 * @jest-environment node
 *
 * Tests for POST /api/vouchers/lookup
 *
 * The register evaluates vouchers with its own byte-identical copy of the
 * engine, but the vouchers themselves are rows in the platform database. This
 * route is how a code a customer presents at a counter becomes a `Voucher` the
 * register can price.
 *
 * Deliberately NOT gated on the `vouchers` staff permission. That permission
 * governs a MANUAL discount — a cashier inventing money off at will, which is
 * a till-skimming vector. Accepting a voucher the merchant themselves created
 * and the customer presents is ordinary counter work, and requiring a
 * supervisor for it would mean every plain cashier had to fetch one to honour
 * a code the shop is advertising.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

const findByCodesMock = jest.fn()
jest.mock('@/lib/vouchers/repository', () => ({
  createVoucherLookup: jest.fn(() => ({ findByCodes: findByCodesMock })),
}))

function makeRequest(body: unknown, authHeader?: string): NextRequest {
  return new NextRequest('http://localhost/api/vouchers/lookup', {
    method: 'POST',
    headers: authHeader ? { authorization: authHeader } : {},
    body: JSON.stringify(body),
  })
}

const VALID_BODY = { tenantId: 't1', codes: ['WELCOME10'] }

describe('POST /api/vouchers/lookup', () => {
  let getUserMock: jest.Mock
  let appUserSingleMock: jest.Mock

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
      data: { role: 'admin', tenant_id: 't1', permissions: ['pos'] },
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
    ;(createAdminClient as unknown as jest.Mock).mockReturnValue({})

    findByCodesMock.mockResolvedValue([{ id: 'v-1', code: 'WELCOME10' }])
  })

  test('rejects a request with no tenantId', async () => {
    const { POST } = await import('@/app/api/vouchers/lookup/route')
    const res = await POST(makeRequest({ codes: ['X'] }, 'Bearer t'))

    expect(res.status).toBe(400)
  })

  test('rejects a request whose codes are not a non-empty array', async () => {
    const { POST } = await import('@/app/api/vouchers/lookup/route')

    expect((await POST(makeRequest({ tenantId: 't1', codes: [] }, 'Bearer t'))).status).toBe(400)
    expect((await POST(makeRequest({ tenantId: 't1' }, 'Bearer t'))).status).toBe(400)
  })

  test('rejects a request with no Authorization header', async () => {
    const { POST } = await import('@/app/api/vouchers/lookup/route')
    const res = await POST(makeRequest(VALID_BODY))

    expect(res.status).toBe(401)
    expect(findByCodesMock).not.toHaveBeenCalled()
  })

  test('rejects an admin of a different tenant', async () => {
    // The service-role client bypasses RLS, so this check is the only thing
    // stopping one merchant reading another merchant's voucher codes.
    appUserSingleMock.mockResolvedValue({
      data: { role: 'admin', tenant_id: 'other-tenant' },
      error: null,
    })
    const { POST } = await import('@/app/api/vouchers/lookup/route')
    const res = await POST(makeRequest(VALID_BODY, 'Bearer t'))

    expect(res.status).toBe(403)
    expect(findByCodesMock).not.toHaveBeenCalled()
  })

  test('returns the vouchers for the caller-s own tenant', async () => {
    const { POST } = await import('@/app/api/vouchers/lookup/route')
    const res = await POST(makeRequest(VALID_BODY, 'Bearer t'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.vouchers).toEqual([{ id: 'v-1', code: 'WELCOME10' }])
    expect(findByCodesMock).toHaveBeenCalledWith('t1', ['WELCOME10'])
  })

  test('looks up the tenant from the request, never a body-supplied override', async () => {
    // The authorized tenant and the queried tenant must be the same value, or
    // the 403 above could be passed with one tenant and read with another.
    const { POST } = await import('@/app/api/vouchers/lookup/route')
    await POST(makeRequest({ ...VALID_BODY, tenant_id: 'other-tenant' }, 'Bearer t'))

    expect(findByCodesMock).toHaveBeenCalledWith('t1', ['WELCOME10'])
  })

  test('serves a plain cashier without the vouchers permission', async () => {
    // Honouring a code the shop advertises is ordinary counter work; the
    // `vouchers` permission gates inventing a manual discount, not this.
    appUserSingleMock.mockResolvedValue({
      data: { role: 'admin', tenant_id: 't1', permissions: ['pos'] },
      error: null,
    })
    const { POST } = await import('@/app/api/vouchers/lookup/route')
    const res = await POST(makeRequest(VALID_BODY, 'Bearer t'))

    expect(res.status).toBe(200)
  })

  test('upper-cases and trims a code the way the web checkout does', async () => {
    // `findByCodes` does an exact `.in('code', …)`, while the unique index is
    // on `lower(code)` — the codes are case-insensitive by design and
    // `resolveVouchers` normalises before it queries. Passing the cashier's
    // keystrokes through raw means a code typed `welcome10` is refused at the
    // counter while the same code works on the web.
    const { POST } = await import('@/app/api/vouchers/lookup/route')
    await POST(makeRequest({ tenantId: 't1', codes: ['  welcome10  '] }, 'Bearer t'))

    expect(findByCodesMock).toHaveBeenCalledWith('t1', ['WELCOME10'])
  })

  test('collapses codes that differ only by case into one query entry', async () => {
    const { POST } = await import('@/app/api/vouchers/lookup/route')
    await POST(makeRequest({ tenantId: 't1', codes: ['welcome10', 'WELCOME10'] }, 'Bearer t'))

    expect(findByCodesMock).toHaveBeenCalledWith('t1', ['WELCOME10'])
  })

  test('rejects a request whose codes are all blank once trimmed', async () => {
    const { POST } = await import('@/app/api/vouchers/lookup/route')
    const res = await POST(makeRequest({ tenantId: 't1', codes: ['   '] }, 'Bearer t'))

    expect(res.status).toBe(400)
    expect(findByCodesMock).not.toHaveBeenCalled()
  })

  test('drops non-string codes rather than querying with them', async () => {
    const { POST } = await import('@/app/api/vouchers/lookup/route')
    await POST(makeRequest({ tenantId: 't1', codes: ['GOOD', 42, null] }, 'Bearer t'))

    expect(findByCodesMock).toHaveBeenCalledWith('t1', ['GOOD'])
  })
})
