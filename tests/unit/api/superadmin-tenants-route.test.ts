/**
 * @jest-environment node
 *
 * GET /api/superadmin/tenants and /api/superadmin/tenants/metrics.
 * Route handlers are public URLs, so each must re-check the superadmin role
 * and validate its query string before touching the database.
 */

import { NextRequest } from 'next/server'

const getCurrentUserRole = jest.fn()
jest.mock('@/lib/admin-service', () => ({
  getCurrentUserRole: () => getCurrentUserRole(),
}))

const getTenants = jest.fn()
jest.mock('@/lib/queries/tenants-server', () => ({
  getTenants: (...args: unknown[]) => getTenants(...args),
}))

const getTenantMetrics = jest.fn()
jest.mock('@/lib/queries/tenant-metrics-server', () => ({
  getTenantMetrics: (...args: unknown[]) => getTenantMetrics(...args),
}))

const ID = '11111111-1111-4111-8111-111111111111'

function request(path: string) {
  return new NextRequest(new URL(path, 'http://localhost'))
}

async function listRoute() {
  return import('@/app/api/superadmin/tenants/route')
}
async function metricsRoute() {
  return import('@/app/api/superadmin/tenants/metrics/route')
}

beforeEach(() => {
  getCurrentUserRole.mockReset().mockResolvedValue({ role: 'superadmin' })
  getTenants.mockReset().mockResolvedValue({ data: [{ id: ID }], count: 1, error: null })
  getTenantMetrics.mockReset().mockResolvedValue({ [ID]: { tenantId: ID } })
})

describe('GET /api/superadmin/tenants', () => {
  test('refuses a caller who is not a superadmin, without querying', async () => {
    getCurrentUserRole.mockResolvedValue({ role: 'admin' })
    const { GET } = await listRoute()

    const response = await GET(request('/api/superadmin/tenants?q=sea'))

    expect(response.status).toBe(403)
    expect(getTenants).not.toHaveBeenCalled()
  })

  test('refuses a signed-out caller', async () => {
    getCurrentUserRole.mockResolvedValue(null)
    const { GET } = await listRoute()

    expect((await GET(request('/api/superadmin/tenants'))).status).toBe(403)
  })

  test('rejects an invalid filter with 400', async () => {
    const { GET } = await listRoute()

    const response = await GET(request('/api/superadmin/tenants?sort=random'))

    expect(response.status).toBe(400)
    expect(getTenants).not.toHaveBeenCalled()
  })

  test('passes the normalised query through and returns the envelope', async () => {
    const { GET } = await listRoute()

    const response = await GET(
      request('/api/superadmin/tenants?q=%20sea%20%20cook%20&page=2&status=active'),
    )

    expect(getTenants).toHaveBeenCalledWith({
      search: 'sea cook',
      page: 2,
      status: 'active',
      feature: 'all',
      sort: 'recent',
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({
      success: true,
      data: { tenants: [{ id: ID }], count: 1 },
      error: null,
    })
  })

  test('reports a database failure as an error, not as zero results', async () => {
    getTenants.mockResolvedValue({ data: [], count: 0, error: 'Could not load restaurants' })
    const { GET } = await listRoute()

    const response = await GET(request('/api/superadmin/tenants'))

    expect(response.status).toBe(502)
    expect((await response.json()).success).toBe(false)
  })
})

describe('GET /api/superadmin/tenants/metrics', () => {
  test('refuses a caller who is not a superadmin', async () => {
    getCurrentUserRole.mockResolvedValue({ role: 'admin' })
    const { GET } = await metricsRoute()

    const response = await GET(request(`/api/superadmin/tenants/metrics?ids=${ID}`))

    expect(response.status).toBe(403)
    expect(getTenantMetrics).not.toHaveBeenCalled()
  })

  test('rejects malformed ids with 400', async () => {
    const { GET } = await metricsRoute()

    const response = await GET(request('/api/superadmin/tenants/metrics?ids=nope'))

    expect(response.status).toBe(400)
    expect(getTenantMetrics).not.toHaveBeenCalled()
  })

  test('returns metrics for the requested ids', async () => {
    const { GET } = await metricsRoute()

    const response = await GET(request(`/api/superadmin/tenants/metrics?ids=${ID}`))

    expect(getTenantMetrics).toHaveBeenCalledWith([ID])
    expect(await response.json()).toEqual({
      success: true,
      data: { [ID]: { tenantId: ID } },
      error: null,
    })
  })

  test('turns a metrics failure into a 502 envelope', async () => {
    getTenantMetrics.mockRejectedValue(new Error('convex down'))
    const { GET } = await metricsRoute()

    const response = await GET(request(`/api/superadmin/tenants/metrics?ids=${ID}`))

    expect(response.status).toBe(502)
    expect((await response.json()).error).toBe('Could not load order metrics')
  })
})
