/**
 * @jest-environment node
 *
 * Tests for POST /api/revalidate-menu
 *
 * Mobile (webnegosyo-app) writes menu_items/categories directly via Supabase,
 * bypassing Next.js's ISR revalidation. This route lets the mobile app ask the
 * web app to revalidate the public menu after a successful write, authenticated
 * via the same Supabase session token the mobile app already holds.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

function makeRequest(body: unknown, authHeader?: string): NextRequest {
  return new NextRequest('http://localhost/api/revalidate-menu', {
    method: 'POST',
    headers: authHeader ? { authorization: authHeader } : {},
    body: JSON.stringify(body),
  })
}

describe('POST /api/revalidate-menu', () => {
  let mockCreateClient: jest.Mock
  let getUserMock: jest.Mock
  let singleMock: jest.Mock

  beforeEach(async () => {
    jest.resetModules()
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

    const { createClient } = await import('@supabase/supabase-js')
    mockCreateClient = createClient as unknown as jest.Mock

    getUserMock = jest.fn()
    singleMock = jest.fn()

    mockCreateClient.mockReturnValue({
      auth: { getUser: getUserMock },
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: singleMock,
          })),
        })),
      })),
    })
  })

  test('rejects a request with no tenantId or tenantSlug', async () => {
    const { POST } = await import('@/app/api/revalidate-menu/route')
    const res = await POST(makeRequest({}, 'Bearer token-1'))
    expect(res.status).toBe(400)
  })

  test('rejects a request with no Authorization header', async () => {
    const { POST } = await import('@/app/api/revalidate-menu/route')
    const res = await POST(makeRequest({ tenantId: 't1', tenantSlug: 'coffee' }))
    expect(res.status).toBe(401)
  })

  test('rejects when the token does not resolve to a user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: new Error('invalid') })
    const { POST } = await import('@/app/api/revalidate-menu/route')
    const res = await POST(makeRequest({ tenantId: 't1', tenantSlug: 'coffee' }, 'Bearer bad'))
    expect(res.status).toBe(401)
  })

  test('rejects an admin of a different tenant', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    singleMock.mockResolvedValue({ data: { role: 'admin', tenant_id: 'other-tenant' }, error: null })
    const { POST } = await import('@/app/api/revalidate-menu/route')
    const res = await POST(makeRequest({ tenantId: 't1', tenantSlug: 'coffee' }, 'Bearer token-1'))
    expect(res.status).toBe(403)
  })

  test('revalidates the tenant menu paths for its own admin', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    singleMock.mockResolvedValue({ data: { role: 'admin', tenant_id: 't1' }, error: null })
    const { POST } = await import('@/app/api/revalidate-menu/route')
    const { revalidatePath } = await import('next/cache')

    const res = await POST(makeRequest({ tenantId: 't1', tenantSlug: 'coffee' }, 'Bearer token-1'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(revalidatePath).toHaveBeenCalledWith('/coffee/menu')
  })

  test('allows a superadmin to revalidate any tenant', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    singleMock.mockResolvedValue({ data: { role: 'superadmin', tenant_id: null }, error: null })
    const { POST } = await import('@/app/api/revalidate-menu/route')

    const res = await POST(makeRequest({ tenantId: 'any-tenant', tenantSlug: 'coffee' }, 'Bearer token-1'))
    expect(res.status).toBe(200)
  })
})
