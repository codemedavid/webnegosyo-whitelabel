/** @jest-environment node */
/**
 * POST /api/pos/stock-clearance: a member of the store who works the register,
 * for their own branch, with the server's verdict on the shelf.
 */
import { NextRequest } from 'next/server'

const TENANT = '11111111-1111-4111-8111-111111111111'
const NORTH = '33333333-3333-4333-8333-333333333333'
const SOUTH = '44444444-4444-4444-8444-444444444444'
const ORDER = '22222222-2222-4222-8222-222222222222'
const DISH = '66666666-6666-4666-8666-666666666666'

const mockRequireCaller = jest.fn()
const mockRateLimit = jest.fn()
const mockOutletRow = jest.fn()
const mockDecide = jest.fn()

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
jest.mock('@/lib/gov-discount-ledger/actor', () => ({
  resolveLedgerActor: async () => ({ userId: 'cashier-1', name: 'Ana' }),
}))
jest.mock('@/lib/inventory/pos-stock-clearance-store', () => ({ createClearanceStore: () => ({}) }))
jest.mock('@/lib/inventory/pos-stock-clearance', () => {
  const actual = jest.requireActual('@/lib/inventory/pos-stock-clearance')
  return { ...actual, decideStockClearance: (...args: unknown[]) => mockDecide(...args) }
})

const account = (overrides: Record<string, unknown> = {}) => ({
  role: 'admin',
  tenant_id: TENANT,
  is_owner: false,
  permissions: ['pos'],
  outlet_id: null,
  ...overrides,
})

function callerWith(appUser: Record<string, unknown> | null) {
  mockRequireCaller.mockResolvedValue({ ok: true, user: { id: 'cashier-1', email: 'a@x.ph' }, supabase: {}, appUser })
}

const body = (overrides: Record<string, unknown> = {}) => ({
  tenantId: TENANT,
  orderId: ORDER,
  outletId: null,
  lines: [{ menuItemId: DISH, quantity: 2 }],
  ...overrides,
})

function post(payload: unknown) {
  return new NextRequest('http://localhost/api/pos/stock-clearance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(payload),
  })
}

async function call(payload: unknown) {
  const { POST } = await import('@/app/api/pos/stock-clearance/route')
  const response = await POST(post(payload))
  return { status: response.status, json: await response.json().catch(() => null) }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockRateLimit.mockResolvedValue({ allowed: true, remaining: 10, retryAfterSec: 0 })
  mockOutletRow.mockReturnValue({ id: NORTH })
  mockDecide.mockResolvedValue({ ok: true, status: 'cleared', clearanceId: 'c-1' })
})

describe('POST /api/pos/stock-clearance', () => {
  it('refuses a malformed body before anything is read', async () => {
    const { status } = await call({ tenantId: TENANT, orderId: 'x', lines: [] })
    expect(status).toBe(400)
    expect(mockRequireCaller).not.toHaveBeenCalled()
  })

  it('passes on a refusal from the bearer check', async () => {
    mockRequireCaller.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) })
    expect((await call(body())).status).toBe(401)
    expect(mockDecide).not.toHaveBeenCalled()
  })

  it('refuses a member who does not work the register or the orders', async () => {
    callerWith(account({ permissions: ['menu'] }))
    expect((await call(body())).status).toBe(403)
    expect(mockDecide).not.toHaveBeenCalled()
  })

  it('slows down a caller that loops', async () => {
    callerWith(account())
    mockRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 30 })
    expect((await call(body())).status).toBe(429)
    expect(mockDecide).not.toHaveBeenCalled()
  })

  it("acts for the caller's own branch only", async () => {
    callerWith(account({ outlet_id: NORTH }))
    expect((await call(body({ outletId: SOUTH }))).status).toBe(403)
    expect(mockDecide).not.toHaveBeenCalled()

    await call(body({ outletId: null }))
    expect(mockDecide).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ outletId: NORTH, orderId: ORDER }),
      expect.objectContaining({ userId: 'cashier-1', name: 'Ana' }),
    )
  })

  it('answers the verdict: cleared 200, needs_manager 409 with approvers', async () => {
    callerWith(account())
    expect(await call(body())).toEqual({ status: 200, json: { status: 'cleared', clearanceId: 'c-1', outletId: null } })

    mockDecide.mockResolvedValue({
      ok: false,
      status: 409,
      code: 'needs_manager',
      error: 'Stock does not cover this sale. A manager has to approve it.',
      shortfalls: [{ menuItemId: DISH, name: 'Adobo', requested: 2, producible: 0 }],
      approvers: [{ userId: 'm', name: 'Lito', hasPin: true }],
    })
    const short = await call(body())
    expect(short.status).toBe(409)
    expect(short.json).toEqual({
      status: 'needs_manager',
      error: 'Stock does not cover this sale. A manager has to approve it.',
      shortfalls: [{ menuItemId: DISH, name: 'Adobo', requested: 2, producible: 0 }],
      approvers: [{ userId: 'm', name: 'Lito', hasPin: true }],
    })
  })

  it('passes the caller account so a manager may approve her own sale', async () => {
    callerWith(account({ permissions: ['pos', 'inventory'], outlet_id: NORTH }))
    await call(body({ outletId: NORTH }))
    expect(mockDecide.mock.calls[0][2].account).toEqual({
      userId: 'cashier-1',
      name: 'Ana',
      role: 'admin',
      isOwner: false,
      permissions: ['pos', 'inventory'],
      outletId: NORTH,
    })
  })

  it('a failure inside reads as a 500 with a register-friendly message', async () => {
    callerWith(account())
    mockDecide.mockRejectedValue(new Error('db down'))
    const { status, json } = await call(body())
    expect(status).toBe(500)
    expect(json.error).toBe('Could not check the stock. Try again.')
  })
})
