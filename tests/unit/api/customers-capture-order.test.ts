/**
 * @jest-environment node
 *
 * POST /api/customers/capture-order — the backend is the tenant's, not the
 * register's.
 *
 * The QR scanner in the merchant app sent `backend: "convex"` for every scanned
 * order, including stores whose orders the app writes to the platform Supabase.
 * The route trusted it, so those orders were filed in the external-order ledger
 * instead of being linked on `orders`. These cases pin the server-side check
 * that makes the claim irrelevant: the tenant's resolved backend decides, and a
 * platform order is only linked when it really is this tenant's order.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import { NextRequest } from 'next/server'

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/queries/fetch-app-user-scope', () => ({
  asAppUserQueryClient: (client: unknown) => client,
  fetchAppUserScope: jest.fn(),
}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/customer-capture-service', () => ({ captureAppOrder: jest.fn() }))
jest.mock('@/lib/customers-service', () => ({
  createSupabaseCustomerStore: jest.fn(),
  upsertCustomerFromOrder: jest.fn(),
}))
jest.mock('@/lib/customer-external-orders', () => ({
  captureExternalOrderBestEffort: jest.fn(),
}))

const PLATFORM_ORDER_ID = '7d1c3a2e-5b4f-4c8d-9e0a-1b2c3d4e5f60'

const BODY = {
  tenantId: 't1',
  backend: 'convex',
  orderId: PLATFORM_ORDER_ID,
  name: 'Maria Santos',
  contact: '09171234567',
  total: 250,
  items: [{ name: 'Latte', quantity: 2 }],
}

type Result = { data: unknown; error: unknown }

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/customers/capture-order', {
    method: 'POST',
    headers: { authorization: 'Bearer token-1' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/customers/capture-order — backend verification', () => {
  let tenantResult: jest.Mock<() => Promise<Result>>
  let orderResult: jest.Mock<() => Promise<Result>>
  let orderFilters: Array<[string, unknown]>
  let captureMock: jest.Mock<(...args: unknown[]) => Promise<string | null>>

  beforeEach(async () => {
    jest.resetModules()
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

    const { createClient } = await import('@supabase/supabase-js')
    ;(createClient as unknown as jest.Mock).mockReturnValue({
      auth: {
        getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }),
      },
    })

    const scope = await import('@/lib/queries/fetch-app-user-scope')
    ;(scope.fetchAppUserScope as unknown as jest.Mock<() => Promise<unknown>>).mockResolvedValue({
      appUser: { role: 'admin', tenant_id: 't1', is_owner: false, permissions: ['pos'] },
    })

    tenantResult = jest.fn<() => Promise<Result>>()
    orderResult = jest.fn<() => Promise<Result>>()
    orderFilters = []
    // Default: a platform store whose order really exists.
    tenantResult.mockResolvedValue({
      data: { order_backend: 'platform', convex_deployment_url: null },
      error: null,
    })
    orderResult.mockResolvedValue({ data: { id: PLATFORM_ORDER_ID }, error: null })

    const admin = await import('@/lib/supabase/admin')
    ;(admin.createAdminClient as unknown as jest.Mock).mockReturnValue({
      from: (table: string) => {
        const builder: Record<string, unknown> = {}
        builder.select = () => builder
        builder.eq = (column: string, value: unknown) => {
          if (table === 'orders') orderFilters.push([column, value])
          return builder
        }
        builder.maybeSingle = table === 'tenants' ? tenantResult : orderResult
        return builder
      },
    })

    const service = await import('@/lib/customer-capture-service')
    captureMock = service.captureAppOrder as unknown as jest.Mock<
      (...args: unknown[]) => Promise<string | null>
    >
    captureMock.mockResolvedValue('cust-1')
  })

  test('files a platform store’s scanned order as platform even when the app claims convex', async () => {
    // Act
    const { POST } = await import('@/app/api/customers/capture-order/route')
    const res = await POST(makeRequest(BODY))

    // Assert
    expect(res.status).toBe(200)
    expect(captureMock).toHaveBeenCalledTimes(1)
    const [request] = captureMock.mock.calls[0] as [{ backend: string; orderId: string }]
    expect(request.backend).toBe('platform')
    expect(request.orderId).toBe(PLATFORM_ORDER_ID)
  })

  test('only links a platform order that belongs to the caller’s tenant', async () => {
    const { POST } = await import('@/app/api/customers/capture-order/route')
    await POST(makeRequest({ ...BODY, backend: 'platform' }))

    expect(orderFilters).toEqual(
      expect.arrayContaining([
        ['id', PLATFORM_ORDER_ID],
        ['tenant_id', 't1'],
      ])
    )
  })

  test('refuses a platform capture for an order not in this tenant', async () => {
    // Without this, an admin of one store could link another store's order
    // (the platform link is by order id alone) to a guest of their own.
    orderResult.mockResolvedValue({ data: null, error: null })

    const { POST } = await import('@/app/api/customers/capture-order/route')
    const res = await POST(makeRequest({ ...BODY, backend: 'platform' }))

    expect(res.status).toBe(404)
    expect(captureMock).not.toHaveBeenCalled()
  })

  test('refuses a non-uuid order id for a platform store without querying', async () => {
    const { POST } = await import('@/app/api/customers/capture-order/route')
    const res = await POST(makeRequest({ ...BODY, orderId: 'jh7dm2p8qr3n5x9k4tw2vc6y8b' }))

    expect(res.status).toBe(404)
    expect(orderResult).not.toHaveBeenCalled()
    expect(captureMock).not.toHaveBeenCalled()
  })

  test('refuses a platform claim for a Convex store', async () => {
    tenantResult.mockResolvedValue({
      data: { order_backend: 'convex', convex_deployment_url: 'https://x.convex.cloud' },
      error: null,
    })

    const { POST } = await import('@/app/api/customers/capture-order/route')
    const res = await POST(makeRequest({ ...BODY, backend: 'platform' }))

    expect(res.status).toBe(409)
    expect(captureMock).not.toHaveBeenCalled()
  })

  test('captures a Convex store’s order under convex, unchanged', async () => {
    tenantResult.mockResolvedValue({
      data: { order_backend: null, convex_deployment_url: 'https://x.convex.cloud' },
      error: null,
    })

    const { POST } = await import('@/app/api/customers/capture-order/route')
    const res = await POST(makeRequest({ ...BODY, orderId: 'jh7dm2p8qr3n5x9k4tw2vc6y8b' }))

    expect(res.status).toBe(200)
    const [request] = captureMock.mock.calls[0] as [{ backend: string }]
    expect(request.backend).toBe('convex')
    expect(orderResult).not.toHaveBeenCalled()
  })

  test('captures nothing when the tenant cannot be read', async () => {
    // Guessing a backend is how the ledger got the wrong rows in the first place.
    tenantResult.mockResolvedValue({ data: null, error: { message: 'timeout' } })

    const { POST } = await import('@/app/api/customers/capture-order/route')
    const res = await POST(makeRequest(BODY))

    expect(res.status).toBe(503)
    expect(captureMock).not.toHaveBeenCalled()
  })
})
