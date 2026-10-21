/** @jest-environment node */

import { NextRequest } from 'next/server'

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const EXPENSE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const RECEIPT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])

const mockCaller = jest.fn()
const mockRateLimit = jest.fn()
const mockSessionRow = jest.fn()
const mockBearerSeen = jest.fn()
const mockUpload = jest.fn()
const mockInsert = jest.fn()
const mockSign = jest.fn()
const mockCount = jest.fn()

jest.mock('@/lib/auth/request-caller', () => ({ getRequestCaller: () => mockCaller() }))
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: (...args: unknown[]) => mockRateLimit(...args) }))
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    // Which identity the session client was built for: the Bearer token, or the cookie (null).
    const { getRequestBearerToken } = jest.requireActual('@/lib/supabase/bearer-session')
    mockBearerSeen(getRequestBearerToken())
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => mockSessionRow(),
    }
    return { from: () => query }
  },
}))
jest.mock('@/lib/supabase/admin', () => ({
  ADMIN_QUERY_TIMEOUT_MS: 1000,
  createAdminClient: () => ({
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => mockUpload(...args),
        remove: async () => ({ error: null }),
        createSignedUrl: (...args: unknown[]) => mockSign(...args),
      }),
    },
    from: () => ({
      select: () => ({ eq: async () => mockCount() }),
      insert: (row: unknown) => ({ select: async () => mockInsert(row) }),
    }),
  }),
}))
jest.mock('node:crypto', () => ({ ...jest.requireActual('node:crypto'), randomUUID: () => RECEIPT }))

const owner = { role: 'admin', tenant_id: TENANT, is_owner: true, permissions: null, outlet_id: null }
const cashier = { role: 'admin', tenant_id: TENANT, is_owner: false, permissions: ['pos'], outlet_id: null }

function expenseRow(overrides: Record<string, unknown> = {}) {
  return { id: EXPENSE, tenant_id: TENANT, paid_from: 'cash', created_by: 'owner-1', status: 'recorded', ...overrides }
}

function uploadRequest(bytes: Uint8Array, { expenseId = EXPENSE, headers = {} as Record<string, string> } = {}) {
  const form = new FormData()
  form.append('expenseId', expenseId)
  form.append('file', new Blob([bytes as unknown as BlobPart], { type: 'image/jpeg' }), 'receipt.jpg')
  return new NextRequest('http://localhost/api/expenses/receipts', { method: 'POST', body: form, headers })
}

async function upload(request: NextRequest) {
  const { POST } = await import('@/app/api/expenses/receipts/route')
  return POST(request)
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  mockCaller.mockResolvedValue({ user: { id: 'owner-1', email: 'o@x.ph' }, appUser: owner, roleError: null })
  mockRateLimit.mockResolvedValue({ allowed: true, remaining: 10, retryAfterSec: 1 })
  mockSessionRow.mockResolvedValue({ data: expenseRow(), error: null })
  mockUpload.mockResolvedValue({ error: null })
  mockInsert.mockResolvedValue({ data: [{ id: RECEIPT }], error: null })
  mockCount.mockResolvedValue({ count: 0, error: null })
  mockSign.mockResolvedValue({ data: { signedUrl: 'https://signed.example/r.jpg?token=x' }, error: null })
})

afterEach(() => jest.restoreAllMocks())

describe('POST /api/expenses/receipts', () => {
  it('stores a receipt for an expenses holder and answers its id', async () => {
    const response = await upload(uploadRequest(JPEG))
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ id: RECEIPT })
    expect(mockUpload).toHaveBeenCalledWith(`${TENANT}/${EXPENSE}/${RECEIPT}.jpg`, expect.any(Uint8Array), expect.objectContaining({ contentType: 'image/jpeg', upsert: false }))
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ expense_id: EXPENSE, mime: 'image/jpeg', uploaded_by: 'owner-1' }))
    expect(mockBearerSeen).toHaveBeenCalledWith(null)
  })

  it('reads the expense as the Bearer token user when the app sends one', async () => {
    const response = await upload(uploadRequest(JPEG, { headers: { authorization: 'Bearer app-token' } }))
    expect(response.status).toBe(201)
    expect(mockBearerSeen).toHaveBeenCalledWith('app-token')
  })

  it('refuses a caller who is not signed in', async () => {
    mockCaller.mockResolvedValue({ user: null, appUser: null, roleError: null })
    expect((await upload(uploadRequest(JPEG))).status).toBe(401)
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('answers 404 for an expense RLS hides from the caller', async () => {
    mockSessionRow.mockResolvedValue({ data: null, error: null })
    expect((await upload(uploadRequest(JPEG))).status).toBe(404)
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it("refuses a member of another store", async () => {
    mockCaller.mockResolvedValue({ user: { id: 'owner-1' }, appUser: { ...owner, tenant_id: 'other-store' }, roleError: null })
    expect((await upload(uploadRequest(JPEG))).status).toBe(403)
  })

  it('refuses a cashier without expenses on a non-drawer expense, but lets them file their own drawer expense', async () => {
    mockCaller.mockResolvedValue({ user: { id: 'cashier-1' }, appUser: cashier, roleError: null })
    expect((await upload(uploadRequest(JPEG))).status).toBe(403)

    mockSessionRow.mockResolvedValue({ data: expenseRow({ paid_from: 'drawer', created_by: 'cashier-1' }), error: null })
    expect((await upload(uploadRequest(JPEG))).status).toBe(201)
  })

  it('refuses a file over 5 MB and one that is not really a photo or PDF', async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1)
    big.set(JPEG)
    expect((await upload(uploadRequest(big))).status).toBe(413)
    const fake = new TextEncoder().encode('MZ this is not a jpeg')
    const response = await upload(uploadRequest(fake))
    expect(response.status).toBe(415)
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('refuses a malformed expense id and a voided expense', async () => {
    expect((await upload(uploadRequest(JPEG, { expenseId: 'nope' }))).status).toBe(400)
    mockSessionRow.mockResolvedValue({ data: expenseRow({ status: 'void' }), error: null })
    expect((await upload(uploadRequest(JPEG))).status).toBe(409)
  })

  it('slows down a caller over the per-person limit', async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSec: 30 })
    expect((await upload(uploadRequest(JPEG))).status).toBe(429)
    expect(mockRateLimit).toHaveBeenCalledWith('expense-receipt:owner-1', expect.objectContaining({ onRedisFailure: 'instance' }))
  })
})

describe('GET /api/expenses/receipts/link', () => {
  async function link(id: string, headers: Record<string, string> = {}) {
    const { GET } = await import('@/app/api/expenses/receipts/link/route')
    return GET(new NextRequest(`http://localhost/api/expenses/receipts/link?id=${id}`, { headers }))
  }

  it('signs a five-minute link for a receipt the caller can see', async () => {
    mockSessionRow.mockResolvedValue({ data: { id: RECEIPT, tenant_id: TENANT, object_path: `${TENANT}/${EXPENSE}/${RECEIPT}.jpg` }, error: null })
    const response = await link(RECEIPT, { authorization: 'Bearer app-token' })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    const body = await response.json()
    expect(body.url).toBe('https://signed.example/r.jpg?token=x')
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now())
    expect(mockSign).toHaveBeenCalledWith(`${TENANT}/${EXPENSE}/${RECEIPT}.jpg`, 300)
    expect(mockBearerSeen).toHaveBeenCalledWith('app-token')
  })

  it('answers 404 when RLS hides the receipt, without signing anything', async () => {
    mockSessionRow.mockResolvedValue({ data: null, error: null })
    expect((await link(RECEIPT)).status).toBe(404)
    expect(mockSign).not.toHaveBeenCalled()
  })

  it('refuses a bad id and a signed-out caller', async () => {
    expect((await link('nope')).status).toBe(400)
    mockCaller.mockResolvedValue({ user: null, appUser: null, roleError: null })
    expect((await link(RECEIPT)).status).toBe(401)
  })
})
