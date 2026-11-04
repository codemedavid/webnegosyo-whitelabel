/** @jest-environment node */

import { NextRequest } from 'next/server'

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000001'

const mockCaller = jest.fn()
const mockRateLimit = jest.fn()
const mockLoad = jest.fn()
const mockRun = jest.fn()
const mockBearerSeen = jest.fn()

jest.mock('@/lib/auth/request-caller', () => ({
  getRequestCaller: () => {
    const { getRequestBearerToken } = jest.requireActual('@/lib/supabase/bearer-session')
    mockBearerSeen(getRequestBearerToken())
    return mockCaller()
  },
}))
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: (...args: unknown[]) => mockRateLimit(...args) }))
jest.mock('@/lib/reports/read/load-report-context', () => ({
  loadReportRequest: (...args: unknown[]) => mockLoad(...args),
  reportClient: async () => ({ rpc: jest.fn() }),
}))
jest.mock('@/lib/reports/api/run-report-query', () => ({ runReportQuery: (...args: unknown[]) => mockRun(...args) }))

const VALID = { tenantId: TENANT, period: { preset: 'this_month' }, compare: 'last_year', sections: ['summary', 'periods'] }

async function post(body: unknown, headers: Record<string, string> = {}) {
  const { POST } = await import('@/app/api/reports/query/route')
  return POST(
    new NextRequest('http://localhost/api/reports/query', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'content-type': 'application/json', ...headers },
    }),
  )
}

function readyPage() {
  const { buildReportContext } = jest.requireActual('@/lib/reports/read/report-context')
  return buildReportContext({
    tenant: { id: TENANT, slug: 'shop', multiBranchEnabled: false, hasConvexDeployment: false },
    backend: 'platform',
    appUser: { role: 'admin', tenant_id: TENANT, is_owner: true, permissions: [], outlet_id: null },
    outlets: [],
    searchParams: { period: 'this_month', compare: 'year' },
    now: Date.parse('2026-10-14T07:30:00Z'),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  mockCaller.mockResolvedValue({ user: { id: 'owner-1' }, appUser: null, roleError: null })
  mockRateLimit.mockResolvedValue({ allowed: true, remaining: 59, retryAfterSec: 60 })
  mockLoad.mockResolvedValue({ page: readyPage(), canSeeCosts: false })
  mockRun.mockResolvedValue({ summary: { ok: true, data: { days: 14, values: { net_sales: 100 }, previous: null } } })
})
afterEach(() => jest.restoreAllMocks())

describe('POST /api/reports/query', () => {
  it('answers with the context, the metrics the caller may see and the sections, as the Bearer user', async () => {
    const response = await post(VALID, { authorization: 'Bearer app-token' })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.context).toMatchObject({ period: { preset: 'this_month', from: '2026-10-01' }, compareTo: 'last_year', compare: { kind: 'same_period_last_year' } })
    expect(body.metrics.map((metric: { id: string }) => metric.id)).not.toContain('profit')
    expect(body.sections.summary.ok).toBe(true)
    expect(mockBearerSeen).toHaveBeenCalledWith('app-token')
    expect(mockLoad).toHaveBeenCalledWith(TENANT, { period: 'this_month', compare: 'year' })
    expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({ sections: ['summary', 'periods'] }))
  })

  it('refuses a malformed body before reading anything', async () => {
    expect((await post('{not json')).status).toBe(400)
    expect((await post({ ...VALID, sections: ['everything'] })).status).toBe(400)
    expect(mockCaller).not.toHaveBeenCalled()
  })

  it('refuses without a signed-in user', async () => {
    mockCaller.mockResolvedValue({ user: null, appUser: null, roleError: null })
    expect((await post(VALID)).status).toBe(401)
    expect(mockLoad).not.toHaveBeenCalled()
  })

  it('limits a caller who asks too often', async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 12 })
    const response = await post(VALID)
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('12')
    expect(mockRateLimit).toHaveBeenCalledWith('reports:query:owner-1', expect.objectContaining({ limit: 60 }))
  })

  it('passes a refusal on with its reason, and an unknown store as 404', async () => {
    mockLoad.mockResolvedValue({ page: { kind: 'refused', reason: 'no_permission' }, canSeeCosts: false })
    const refused = await post(VALID)
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ success: false, reason: 'no_permission' })

    mockLoad.mockResolvedValue({ page: { kind: 'not_found' }, canSeeCosts: false })
    expect((await post(VALID)).status).toBe(404)

    mockLoad.mockResolvedValue({ page: { kind: 'unsupported', backend: 'convex' }, canSeeCosts: false })
    expect((await post(VALID)).status).toBe(409)
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('a crash is a plain 500, logged, never the raw error', async () => {
    mockRun.mockRejectedValue(new Error('secret detail'))
    const response = await post(VALID)
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('secret detail')
  })
})
