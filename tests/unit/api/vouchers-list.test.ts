/**
 * @jest-environment node
 *
 * Tests for POST /api/vouchers/list
 *
 * The register's discount sheet lists a merchant's live promotions so a cashier
 * can tap one instead of remembering its code. That list is the whole of the
 * merchant's current pricing strategy, read under the service-role client which
 * bypasses RLS — so the tenant check in this route is the only thing standing
 * between one shop and every other shop's codes. Where the lookup route leaks
 * one code at a time to somebody who already knew it, this one would hand over
 * the lot.
 *
 * Not gated on the `vouchers` staff permission, for the same reason the lookup
 * is not: honouring a code the shop is advertising is ordinary counter work.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

const findActiveVouchersMock = jest.fn()
jest.mock('@/lib/vouchers/repository', () => ({
  findActiveVouchers: findActiveVouchersMock,
}))

function makeRequest(body: unknown, authHeader?: string): NextRequest {
  return new NextRequest('http://localhost/api/vouchers/list', {
    method: 'POST',
    headers: authHeader ? { authorization: authHeader } : {},
    body: JSON.stringify(body),
  })
}

describe('POST /api/vouchers/list', () => {
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

    findActiveVouchersMock.mockResolvedValue([{ id: 'v-1', code: 'SAVE20' }])
  })

  test('rejects a request with no tenantId', async () => {
    const { POST } = await import('@/app/api/vouchers/list/route')
    const res = await POST(makeRequest({}, 'Bearer t'))

    expect(res.status).toBe(400)
    expect(findActiveVouchersMock).not.toHaveBeenCalled()
  })

  test('rejects a request with no Authorization header', async () => {
    const { POST } = await import('@/app/api/vouchers/list/route')
    const res = await POST(makeRequest({ tenantId: 't1' }))

    expect(res.status).toBe(401)
    expect(findActiveVouchersMock).not.toHaveBeenCalled()
  })

  test('rejects a caller whose token names no user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })
    const { POST } = await import('@/app/api/vouchers/list/route')
    const res = await POST(makeRequest({ tenantId: 't1' }, 'Bearer stale'))

    expect(res.status).toBe(401)
    expect(findActiveVouchersMock).not.toHaveBeenCalled()
  })

  test('refuses to hand one merchant another merchant-s promotions', async () => {
    appUserSingleMock.mockResolvedValue({
      data: { role: 'admin', tenant_id: 'other-tenant' },
      error: null,
    })
    const { POST } = await import('@/app/api/vouchers/list/route')
    const res = await POST(makeRequest({ tenantId: 't1' }, 'Bearer t'))

    expect(res.status).toBe(403)
    expect(findActiveVouchersMock).not.toHaveBeenCalled()
  })

  test('returns the live vouchers for the caller-s own tenant', async () => {
    const { POST } = await import('@/app/api/vouchers/list/route')
    const res = await POST(makeRequest({ tenantId: 't1' }, 'Bearer t'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.vouchers).toEqual([{ id: 'v-1', code: 'SAVE20' }])
    expect(findActiveVouchersMock).toHaveBeenCalledWith({}, 't1')
  })

  test('serves a plain cashier without the vouchers permission', async () => {
    const { POST } = await import('@/app/api/vouchers/list/route')
    const res = await POST(makeRequest({ tenantId: 't1' }, 'Bearer t'))

    expect(res.status).toBe(200)
  })

  test('serves a superadmin viewing a merchant', async () => {
    appUserSingleMock.mockResolvedValue({
      data: { role: 'superadmin', tenant_id: null },
      error: null,
    })
    const { POST } = await import('@/app/api/vouchers/list/route')
    const res = await POST(makeRequest({ tenantId: 't1' }, 'Bearer t'))

    expect(res.status).toBe(200)
  })
})
