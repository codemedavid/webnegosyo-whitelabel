/** @jest-environment node */
import type { NextRequest } from 'next/server'

const mockQuery = jest.fn()
const mockCheckRateLimit = jest.fn()
const mockCreateClient = jest.fn().mockImplementation(() => ({ query: mockQuery }))

jest.mock('@/lib/convex/server', () => ({
  createConvexServerClient: (url: string, key: string) => mockCreateClient(url, key),
}))
jest.mock('@/lib/distributed-rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}))
jest.mock('@/lib/tenant-secrets', () => ({
  getTenantSecrets: async () => ({ convex_deploy_key: 'prod:key' }),
}))
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: 't1', convex_deployment_url: 'https://store.convex.cloud' },
            error: null,
          }),
        }),
      }),
    }),
  }),
}))

function request(query: string, ip = '203.0.113.9'): NextRequest {
  return new Request(`https://www.webnegosyo.com/api/orders/track-by-client${query}`, {
    headers: { 'x-forwarded-for': ip },
  }) as unknown as NextRequest
}

async function callRoute(query: string) {
  // next/jest leaves static imports ahead of jest.mock, so load it here.
  const { GET } = await import('@/app/api/orders/track-by-client/route')
  return GET(request(query))
}

const STORED_ORDER = {
  _id: 'o1',
  status: 'preparing',
  customerName: 'Ana Santos',
  customerContact: '+639171234567',
  total: 450,
  items: [{ menuItemName: 'Tapsilog' }],
}

describe('GET /api/orders/track-by-client', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 10, retryAfterSec: 60 })
  })

  it('asks the internal query over the deploy key', async () => {
    mockQuery.mockResolvedValue(STORED_ORDER)

    await callRoute('?cid=abc&tenant=store')

    expect(mockCreateClient).toHaveBeenCalledWith('https://store.convex.cloud', 'prod:key')
    expect(mockQuery).toHaveBeenCalledWith('orders:getOrderByClientIdInternal', { clientOrderId: 'abc' })
  })

  it('answers the status and nothing about the customer', async () => {
    mockQuery.mockResolvedValue(STORED_ORDER)

    const response = await callRoute('?cid=abc&tenant=store')

    await expect(response.json()).resolves.toEqual({ found: true, status: 'preparing' })
  })

  it('reports not found while the vendor has not scanned the QR', async () => {
    mockQuery.mockResolvedValue(null)

    const response = await callRoute('?cid=abc&tenant=store')

    await expect(response.json()).resolves.toEqual({ found: false })
  })

  it('keeps the page polling when the deployment fails', async () => {
    mockQuery.mockRejectedValue(new Error('Server Error'))
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {})

    const response = await callRoute('?cid=abc&tenant=store')

    await expect(response.json()).resolves.toEqual({ found: false })
    logged.mockRestore()
  })

  it('limits per IP before touching the deployment', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 42 })

    const response = await callRoute('?cid=abc&tenant=store')

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('42')
    expect(mockCheckRateLimit.mock.calls[0][0]).toBe('track-by-client:203.0.113.9')
    expect(mockCheckRateLimit.mock.calls[0][1]).toMatchObject({ onRedisFailure: 'instance' })
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('refuses a lookup with no cid, or one too long to be an id', async () => {
    expect((await callRoute('?tenant=store')).status).toBe(400)
    expect((await callRoute(`?cid=${'x'.repeat(129)}&tenant=store`)).status).toBe(400)
    expect(mockQuery).not.toHaveBeenCalled()
  })
})
