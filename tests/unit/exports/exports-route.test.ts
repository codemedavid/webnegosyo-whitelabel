/** @jest-environment node */

import fc from 'fast-check'
import { NextRequest } from 'next/server'
import type { ExportInput } from '@/lib/exports/run-export'
import { DAY, NOW, TENANT, access, contextFor, noReports, ordersArb, seedStore } from './export-fixtures'

const mockRateLimit = jest.fn()
const mockLoad = jest.fn()
const mockLog = jest.fn()
const mockVerifyPermission = jest.fn()

// The access check is the app's existing helper; `defineRoute` and everything after it are real.
jest.mock('@/lib/admin-service', () => ({
  verifyTenantAdmin: jest.fn(),
  verifyTenantPermission: (...args: unknown[]) => mockVerifyPermission(...args),
}))

jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: (...args: unknown[]) => mockRateLimit(...args) }))
jest.mock('@/lib/exports/server/load-export-input', () => ({ loadExportInput: (...args: unknown[]) => mockLoad(...args) }))
jest.mock('@/lib/exports/server/export-log', () => ({ logExport: (...args: unknown[]) => mockLog(...args) }))

const orders = fc.sample(ordersArb(8), { numRuns: 1, seed: 3 })[0]

function ready(overrides: Partial<ExportInput> = {}) {
  return {
    kind: 'ready',
    userId: 'user-1',
    input: {
      context: contextFor({ period: 'custom', ...DAY }),
      storeName: 'Shop',
      access: access('reports'),
      reportClient: noReports,
      detailClient: seedStore(orders).client,
      sheets: ['orders'],
      now: NOW,
      ...overrides,
    },
  }
}

const QUERY = `tenantId=${TENANT}&sheets=orders&period=custom&from=${DAY.from}&to=${DAY.to}`

async function get(query = QUERY) {
  const { GET } = await import('@/app/api/exports/route')
  return GET(new NextRequest(`http://localhost/api/exports?${query}`))
}

async function post(body: unknown) {
  const { POST } = await import('@/app/api/exports/route')
  return POST(new NextRequest('http://localhost/api/exports', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }))
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  mockRateLimit.mockResolvedValue({ allowed: true, remaining: 5, retryAfterSec: 60 })
  mockVerifyPermission.mockResolvedValue({
    user: { id: 'user-1' },
    userRole: { role: 'admin', tenant_id: TENANT, is_owner: true, permissions: [], outlet_id: null },
  })
  mockLoad.mockResolvedValue(ready())
  mockLog.mockResolvedValue(undefined)
})
afterEach(() => jest.restoreAllMocks())

describe('GET /api/exports (the file)', () => {
  it('sends the file as an attachment and logs it first', async () => {
    const response = await get()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="shop-orders-2026-10-01.xlsx"')
    expect(response.headers.get('cache-control')).toMatch(/no-store/)
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(bytes.length).toBe(Number(response.headers.get('content-length')))
    // An .xlsx is a zip: "PK".
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b])
    expect(mockLog).toHaveBeenCalledTimes(1)
    const [userId, request, , result, size] = mockLog.mock.calls[0]
    expect(userId).toBe('user-1')
    expect(request).toMatchObject({ tenantId: TENANT, format: 'xlsx', source: 'page' })
    expect(result.sheets[0].rows).toHaveLength(orders.length)
    expect(size).toBe(bytes.length)
  })

  it('sends no file when the log row could not be written', async () => {
    mockLog.mockRejectedValue(new Error('export log not written: rls'))
    const response = await get()
    expect(response.status).toBe(500)
    expect(response.headers.get('content-disposition')).toBeNull()
    expect(await response.json()).toEqual({ success: false, error: 'The export could not be prepared. Try again in a moment.' })
  })

  it('refuses a link with an unknown sheet, a missing store or an extra format', async () => {
    expect((await get(QUERY.replace('sheets=orders', 'sheets=orders,passwords'))).status).toBe(400)
    expect((await get(QUERY.replace(`tenantId=${TENANT}&`, ''))).status).toBe(400)
    expect((await get(`${QUERY}&format=pdf`)).status).toBe(400)
    expect(mockLoad).not.toHaveBeenCalled()
  })

  it.each([
    [{ kind: 'signed_out' }, 401],
    [{ kind: 'not_found' }, 404],
    [{ kind: 'refused', reason: 'no_permission' }, 403],
    [{ kind: 'unsupported', backend: 'convex' }, 409],
  ])('answers %j with %i and builds nothing', async (loaded, status) => {
    mockLoad.mockResolvedValue(loaded)
    const response = await get()
    expect(response.status).toBe(status)
    expect(mockLog).not.toHaveBeenCalled()
  })

  it('is limited per person and per store', async () => {
    mockRateLimit.mockImplementation(async (key: string) => ({ allowed: !key.startsWith('exports:store:'), remaining: 0, retryAfterSec: 42 }))
    const response = await get()
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('42')
    const keys = mockRateLimit.mock.calls.map(([key]) => String(key))
    expect(keys).toHaveLength(2)
    expect(keys[0]).toContain('exports-file')
    expect(keys[0]).toContain('user-1')
    expect(keys[1]).toBe(`exports:store:${TENANT}`)
    expect(mockLog).not.toHaveBeenCalled()
  })

  it('never reaches the builder for an account without the Reports key', async () => {
    mockVerifyPermission.mockRejectedValue(new Error('Unauthorized: Missing permission for this feature'))
    const response = await get()
    expect(response.status).toBe(403)
    expect(mockVerifyPermission).toHaveBeenCalledWith(TENANT, 'reports', 'view')
    expect(mockLoad).not.toHaveBeenCalled()
  })

  it('passes a refusal the person can act on straight through', async () => {
    mockLoad.mockResolvedValue(ready({ context: contextFor({ period: 'custom', from: '2026-05-01', to: '2026-10-01' }) }))
    const response = await get()
    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/up to 93 days/)
  })
})

describe('POST /api/exports (the preview)', () => {
  const body = { tenantId: TENANT, mode: 'preview', sheets: ['orders'], period: { preset: 'custom', ...DAY } }

  it('describes the file without logging or sending it', async () => {
    const response = await post(body)
    expect(response.status).toBe(200)
    const { preview } = await response.json()
    expect(preview.sheets[0]).toMatchObject({ id: 'orders', name: 'Orders', rows: orders.length })
    expect(preview.sheets[0].peek.length).toBeLessThanOrEqual(5)
    expect(preview.header.periodLabel).toBe('2026-10-01')
    expect(mockLog).not.toHaveBeenCalled()
  })

  it('refuses an unknown field instead of ignoring it', async () => {
    expect((await post({ ...body, everything: true })).status).toBe(400)
    expect((await post('nope')).status).toBe(400)
  })
})
