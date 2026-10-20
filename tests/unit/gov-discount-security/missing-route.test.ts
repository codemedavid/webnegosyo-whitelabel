/** @jest-environment node */
import { NextRequest } from 'next/server'

const TENANT = '11111111-1111-4111-8111-111111111111'
const ORDER = '22222222-2222-4222-8222-222222222222'
const mockCaller = jest.fn()
const mockLoad = jest.fn()
const mockRecord = jest.fn()

jest.mock('@/lib/auth/bearer-caller', () => ({ requireBearerStoreCaller: (...a: unknown[]) => mockCaller(...a) }))
jest.mock('@/lib/supabase/admin', () => ({ ADMIN_QUERY_TIMEOUT_MS: 1000, createAdminClient: () => ({}) }))
jest.mock('@/lib/gov-discount-ledger/actor', () => ({ resolveLedgerActor: async () => ({ userId: 'mgr', name: 'Mara' }) }))
jest.mock('@/lib/gov-discount-ledger/missing-service', () => ({
  loadMissingFromBook: (...a: unknown[]) => mockLoad(...a),
  recordMissingOrder: (...a: unknown[]) => mockRecord(...a),
  RECORD_MISSING_MESSAGES: { already_recorded: 'already', not_found: 'nf', nothing_to_record: 'none' },
}))

const reviewer = (overrides: Record<string, unknown> = {}) => ({
  ok: true,
  user: { id: 'mgr' },
  appUser: { role: 'admin', tenant_id: TENANT, is_owner: false, permissions: ['discount_review'], outlet_id: null, ...overrides },
})

const get = (query: string) => new NextRequest(`http://localhost/api/gov-discounts/missing?${query}`, { headers: { authorization: 'Bearer t' } })
const post = (body: unknown) =>
  new NextRequest('http://localhost/api/gov-discounts/missing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(body),
  })

beforeEach(() => {
  jest.clearAllMocks()
  mockCaller.mockResolvedValue(reviewer())
  mockLoad.mockResolvedValue([{ orderId: ORDER }])
  mockRecord.mockResolvedValue('recorded')
})

const window = `tenantId=${TENANT}&startIso=2026-10-01T00:00:00.000Z&endIso=2026-11-01T00:00:00.000Z`

describe('/api/gov-discounts/missing', () => {
  it('lists missing orders for a reviewer, scoped to their branch', async () => {
    mockCaller.mockResolvedValue(reviewer({ outlet_id: 'north' }))
    const { GET } = await import('@/app/api/gov-discounts/missing/route')
    const response = await GET(get(window))
    expect(response.status).toBe(200)
    expect(mockLoad.mock.calls[0][3]).toEqual({ kind: 'branch', outletId: 'north' })
  })

  it('refuses a cashier without discount_review', async () => {
    mockCaller.mockResolvedValue(reviewer({ permissions: ['pos'] }))
    const { GET, POST } = await import('@/app/api/gov-discounts/missing/route')
    expect((await GET(get(window))).status).toBe(403)
    expect((await POST(post({ tenantId: TENANT, orderId: ORDER }))).status).toBe(403)
    expect(mockLoad).not.toHaveBeenCalled()
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it('refuses a window longer than a quarter', async () => {
    const { GET } = await import('@/app/api/gov-discounts/missing/route')
    const response = await GET(get(`tenantId=${TENANT}&startIso=2026-01-01T00:00:00.000Z&endIso=2026-11-01T00:00:00.000Z`))
    expect(response.status).toBe(400)
  })

  it('records from the stored order and answers 409 when it is already in the book', async () => {
    const { POST } = await import('@/app/api/gov-discounts/missing/route')
    expect((await POST(post({ tenantId: TENANT, orderId: ORDER }))).status).toBe(200)
    expect(mockRecord.mock.calls[0][1]).toMatchObject({ tenantId: TENANT, orderId: ORDER, scope: { kind: 'all' } })
    mockRecord.mockResolvedValue('already_recorded')
    expect((await POST(post({ tenantId: TENANT, orderId: ORDER }))).status).toBe(409)
  })
})
