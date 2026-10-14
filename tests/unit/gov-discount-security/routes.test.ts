/** @jest-environment node */
/**
 * The Senior/PWD routes refuse members of the store who lack the feature, act
 * only for the caller's own branch, and rate-limit PIN guesses across
 * instances.
 */
import { NextRequest } from 'next/server'

const TENANT = '11111111-1111-4111-8111-111111111111'
const NORTH = '33333333-3333-4333-8333-333333333333'
const SOUTH = '44444444-4444-4444-8444-444444444444'
const APPROVER = '55555555-5555-4555-8555-555555555555'

const mockRequireCaller = jest.fn()
const mockRecord = jest.fn()
const mockApprove = jest.fn()
const mockSetPin = jest.fn()
const mockListApprovers = jest.fn()
const mockRateLimit = jest.fn()
const mockOutletRow = jest.fn()

jest.mock('@/lib/auth/bearer-caller', () => ({
  requireBearerStoreCaller: (...args: unknown[]) => mockRequireCaller(...args),
}))
jest.mock('@/lib/distributed-rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockRateLimit(...args),
}))
jest.mock('@/lib/supabase/admin', () => ({
  ADMIN_QUERY_TIMEOUT_MS: 1000,
  createAdminClient: () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: mockOutletRow(), error: null }),
    }
    return { from: () => query }
  },
}))
jest.mock('@/lib/gov-discount-ledger/supabase-store', () => ({ createSupabaseLedgerStore: () => ({}) }))
jest.mock('@/lib/gov-discount-ledger/supabase-approval-store', () => ({ createSupabaseApprovalStore: () => ({}) }))
jest.mock('@/lib/gov-discount-ledger/actor', () => ({
  resolveLedgerActor: async () => ({ userId: 'cashier-1', name: 'Ana' }),
}))
jest.mock('@/lib/gov-discount-ledger/record-service', () => ({
  recordGovDiscount: (...args: unknown[]) => mockRecord(...args),
}))
jest.mock('@/lib/gov-discount-ledger/approval-service', () => ({
  approveGrant: (...args: unknown[]) => mockApprove(...args),
  setOwnApprovalPin: (...args: unknown[]) => mockSetPin(...args),
  listApprovers: (...args: unknown[]) => mockListApprovers(...args),
}))

const account = (overrides: Record<string, unknown> = {}) => ({
  role: 'admin',
  tenant_id: TENANT,
  is_owner: false,
  permissions: ['pos'],
  outlet_id: null,
  ...overrides,
})

function callerWith(appUser: Record<string, unknown>) {
  mockRequireCaller.mockResolvedValue({ ok: true, user: { id: 'cashier-1' }, supabase: {}, appUser })
}

function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(body),
  })
}

const recordBody = (overrides: Record<string, unknown> = {}) => ({
  tenantId: TENANT,
  backend: 'platform_supabase',
  externalOrderId: '22222222-2222-4222-8222-222222222222',
  orderLabel: '#1',
  outletId: null,
  revision: 0,
  occurredAt: '2026-10-15T04:00:00.000Z',
  orderTotal: 400,
  source: 'pos',
  lines: [],
  serviceCharge: 0,
  deliveryFee: 0,
  allowShared: false,
  government: null,
  approvalId: null,
  approvalSkippedOffline: false,
  ...overrides,
})

const approveBody = (overrides: Record<string, unknown> = {}) => ({
  tenantId: TENANT,
  approverUserId: APPROVER,
  pin: '8642',
  reduction: 600,
  outletId: null,
  claimants: [{ kind: 'senior', name: 'Juan', idMasked: '••••2345' }],
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  callerWith(account())
  mockRateLimit.mockResolvedValue({ allowed: true, remaining: 1, retryAfterSec: 1 })
  mockOutletRow.mockReturnValue({ id: SOUTH })
  mockRecord.mockResolvedValue({ granted: 0, reversed: 0, verification: 'none', flags: [] })
  mockApprove.mockResolvedValue({ ok: true, approvalId: 'a1', approverName: 'Mara', expiresAt: 'x' })
  mockSetPin.mockResolvedValue({ ok: true })
  mockListApprovers.mockResolvedValue([])
})

afterEach(() => jest.restoreAllMocks())

describe('POST /api/gov-discounts/record', () => {
  const record = async (body: unknown) => (await import('@/app/api/gov-discounts/record/route')).POST(post('/api/gov-discounts/record', body))

  it('refuses a member of the store without the register (pos)', async () => {
    callerWith(account({ permissions: ['kitchen'] }))
    expect((await record(recordBody())).status).toBe(403)
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it('files a branch account’s record under its own branch', async () => {
    callerWith(account({ outlet_id: NORTH }))
    expect((await record(recordBody())).status).toBe(200)
    expect(mockRecord.mock.calls[0][1]).toMatchObject({ outletId: NORTH })
  })

  it('refuses a branch account naming another branch', async () => {
    callerWith(account({ outlet_id: NORTH }))
    expect((await record(recordBody({ outletId: SOUTH }))).status).toBe(403)
  })

  it("refuses a store-wide account naming a branch that is not this store's", async () => {
    mockOutletRow.mockReturnValue(null)
    expect((await record(recordBody({ outletId: SOUTH }))).status).toBe(400)
  })

  it('answers 409 when the saved order contradicts a take-back', async () => {
    mockRecord.mockResolvedValue({ granted: 0, reversed: 0, verification: 'none', flags: [], refused: 'order_still_discounted' })
    const response = await record(recordBody())
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'order_still_discounted' })
  })
})

describe('POST /api/gov-discounts/approve', () => {
  const approve = async (body: unknown) => (await import('@/app/api/gov-discounts/approve/route')).POST(post('/api/gov-discounts/approve', body))

  it('refuses a caller without pos before any PIN check', async () => {
    callerWith(account({ permissions: ['kitchen'] }))
    expect((await approve(approveBody())).status).toBe(403)
    expect(mockApprove).not.toHaveBeenCalled()
  })

  it('limits guesses per cashier and per approver, shared across instances', async () => {
    mockRateLimit.mockImplementation(async (key: string) => ({ allowed: !key.includes(':approver:'), remaining: 0, retryAfterSec: 60 }))
    expect((await approve(approveBody())).status).toBe(429)
    expect(mockApprove).not.toHaveBeenCalled()
    const keys = mockRateLimit.mock.calls.map((call) => call[0])
    expect(keys).toEqual([`gov-approve:cashier:${TENANT}:cashier-1`, `gov-approve:approver:${TENANT}:${APPROVER}`])
    expect(mockRateLimit.mock.calls[1][1]).toMatchObject({ onRedisFailure: 'instance' })
  })

  it("takes the branch from the cashier's account, not the body", async () => {
    callerWith(account({ outlet_id: NORTH }))
    await approve(approveBody())
    expect(mockApprove.mock.calls[0][1]).toMatchObject({ outletId: NORTH })
    expect((await approve(approveBody({ outletId: SOUTH }))).status).toBe(403)
  })
})

describe('POST /api/gov-discounts/pin', () => {
  it('lets only someone who reviews discounts set a PIN', async () => {
    const { POST } = await import('@/app/api/gov-discounts/pin/route')
    const refused = await POST(post('/api/gov-discounts/pin', { tenantId: TENANT, pin: '8642' }))
    callerWith(account({ permissions: ['discount_review'] }))
    const allowed = await POST(post('/api/gov-discounts/pin', { tenantId: TENANT, pin: '8642' }))
    expect([refused.status, allowed.status]).toEqual([403, 200])
  })

  it('logs a failure without the raw database message', async () => {
    callerWith(account({ permissions: ['discount_review'] }))
    mockSetPin.mockRejectedValue(new Error('function crypt(8642) does not exist'))
    const { POST } = await import('@/app/api/gov-discounts/pin/route')
    const response = await POST(post('/api/gov-discounts/pin', { tenantId: TENANT, pin: '8642' }))
    expect(response.status).toBe(500)
    expect(JSON.stringify((console.error as jest.Mock).mock.calls)).not.toContain('8642')
  })
})

describe('GET /api/gov-discounts/approvers', () => {
  it('names the approvers only to someone at the register', async () => {
    callerWith(account({ permissions: ['kitchen'] }))
    const { GET } = await import('@/app/api/gov-discounts/approvers/route')
    const response = await GET(new NextRequest(`http://localhost/api/gov-discounts/approvers?tenantId=${TENANT}`))
    expect(response.status).toBe(403)
    expect(mockListApprovers).not.toHaveBeenCalled()
  })
})
