/**
 * @jest-environment node
 *
 * POST /api/orders/tracking-url — a token is minted only for an order the
 * caller's store really owns.
 *
 * The route checked that the caller belonged to the `tenantId` they named, then
 * signed whatever `orderId` they sent. The tracking token is an HMAC of the
 * order id alone, so an admin of store A could mint a valid token for store B's
 * order and use it to read B's order (customer name, items, total) and attach
 * a contact to it. The order must be found inside the named tenant, on that
 * tenant's backend, before anything is signed.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/queries/fetch-app-user-scope', () => ({
  asAppUserQueryClient: (client: unknown) => client,
  fetchAppUserScope: jest.fn(),
}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/order-tracking-service', () => ({ fetchOrderTrackingData: jest.fn() }))

const ORDER_ID = '7d1c3a2e-5b4f-4c8d-9e0a-1b2c3d4e5f60'

type TrackingResult = { data: unknown; error: string | null }

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/orders/tracking-url', {
    method: 'POST',
    headers: { authorization: 'Bearer token-1' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/orders/tracking-url — order ownership', () => {
  let trackingMock: jest.Mock<(orderId: string, token: string, tenantId: string) => Promise<TrackingResult>>

  beforeEach(async () => {
    jest.resetModules()
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    process.env.API_SECRET = 'test-tracking-secret'

    const { createClient } = await import('@supabase/supabase-js')
    ;(createClient as unknown as jest.Mock).mockReturnValue({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    })

    const scope = await import('@/lib/queries/fetch-app-user-scope')
    ;(scope.fetchAppUserScope as unknown as jest.Mock<() => Promise<unknown>>).mockResolvedValue({
      appUser: { role: 'admin', tenant_id: 't1', is_owner: true, permissions: null },
    })

    const admin = await import('@/lib/supabase/admin')
    ;(admin.createAdminClient as unknown as jest.Mock).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({ single: async () => ({ data: { slug: 'store-a' }, error: null }) }),
        }),
      }),
    })

    const tracking = await import('@/lib/order-tracking-service')
    trackingMock = tracking.fetchOrderTrackingData as unknown as typeof trackingMock
    trackingMock.mockResolvedValue({ data: { status: 'pending' }, error: null })
  })

  test('mints the URL for an order found in the caller’s tenant', async () => {
    const { POST } = await import('@/app/api/orders/tracking-url/route')

    const res = await POST(makeRequest({ tenantId: 't1', orderId: ORDER_ID }))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { url: string }
    expect(body.url).toContain(`/store-a/order/${ORDER_ID}?t=`)
    // Looked up inside the tenant the caller was authorized for.
    expect(trackingMock).toHaveBeenCalledWith(ORDER_ID, expect.any(String), 't1')
  })

  test('refuses to sign an order that is not in the caller’s tenant', async () => {
    trackingMock.mockResolvedValue({ data: null, error: 'Order not found' })
    const { POST } = await import('@/app/api/orders/tracking-url/route')

    const res = await POST(makeRequest({ tenantId: 't1', orderId: ORDER_ID }))

    expect(res.status).toBe(404)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.url).toBeUndefined()
  })

  test('refuses a caller from another tenant before any order lookup', async () => {
    const { POST } = await import('@/app/api/orders/tracking-url/route')

    const res = await POST(makeRequest({ tenantId: 't2', orderId: ORDER_ID }))

    expect(res.status).toBe(403)
    expect(trackingMock).not.toHaveBeenCalled()
  })
})
