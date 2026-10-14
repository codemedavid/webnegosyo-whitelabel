/** @jest-environment node */

import { NextRequest, NextResponse } from 'next/server'

const TENANT = '11111111-1111-4111-8111-111111111111'
const PHOTO = '22222222-2222-4222-8222-222222222222'
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)])

const mockRequireCaller = jest.fn()
const mockAuthenticate = jest.fn()
const mockUpload = jest.fn()
const mockCookieClient = jest.fn()
const mockSign = jest.fn()
const mockPurge = jest.fn()

jest.mock('@/lib/auth/bearer-caller', () => ({
  requireBearerStoreCaller: (...args: unknown[]) => mockRequireCaller(...args),
  authenticateBearer: (...args: unknown[]) => mockAuthenticate(...args),
}))
jest.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }) }))
jest.mock('@/lib/supabase/admin', () => ({
  ADMIN_QUERY_TIMEOUT_MS: 1000,
  createAdminClient: () => ({
    storage: { from: () => ({ createSignedUrl: (...args: unknown[]) => mockSign(...args) }) },
  }),
}))
jest.mock('@/lib/supabase/server', () => ({ createClient: async () => mockCookieClient() }))
jest.mock('@/lib/gov-discount-ledger/id-photos/supabase-id-photo-store', () => ({
  createSupabaseIdPhotoStore: () => ({ kind: 'store' }),
}))
jest.mock('@/lib/gov-discount-ledger/id-photos/upload-service', () => ({
  uploadIdPhoto: (...args: unknown[]) => mockUpload(...args),
}))
jest.mock('@/lib/gov-discount-ledger/id-photos/purge-service', () => ({
  purgeExpiredIdPhotos: (...args: unknown[]) => mockPurge(...args),
}))

/** A caller client whose RLS answers the photo read with `row`. */
interface FakeQuery {
  select: () => FakeQuery
  eq: jest.Mock<FakeQuery, [string, string]>
  maybeSingle: () => Promise<{ data: { object_path: string } | null; error: null }>
}

function rlsClient(row: { object_path: string } | null, userId = 'reviewer-1') {
  const query: FakeQuery = {
    select: () => query,
    eq: jest.fn<FakeQuery, [string, string]>(() => query),
    maybeSingle: async () => ({ data: row, error: null }),
  }
  return {
    from: jest.fn(() => query),
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
    query,
  }
}

const uploadBody = {
  tenantId: TENANT,
  backend: 'platform_supabase',
  externalOrderId: 'order-1',
  claimantRef: 'claimant-1',
  capturedAt: '2026-10-14T03:59:00.000Z',
  photo: `data:image/jpeg;base64,${JPEG.toString('base64')}`,
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  mockRequireCaller.mockResolvedValue({
    ok: true,
    user: { id: 'cashier-1' },
    appUser: { role: 'admin', tenant_id: TENANT, is_owner: false, permissions: ['pos'], outlet_id: null },
  })
  mockUpload.mockResolvedValue({ ok: true, replaced: false })
  mockSign.mockResolvedValue({ data: { signedUrl: 'https://signed.example/id.jpg?token=x' }, error: null })
})

afterEach(() => jest.restoreAllMocks())

describe('POST /api/gov-discounts/id-photos', () => {
  const upload = async (body: unknown) => {
    const { POST } = await import('@/app/api/gov-discounts/id-photos/route')
    return POST(post('/api/gov-discounts/id-photos', body, { authorization: 'Bearer t' }))
  }

  it('stores the photo as the verified member of the store', async () => {
    const response = await upload(uploadBody)
    expect(response.status).toBe(200)
    expect(mockRequireCaller).toHaveBeenCalledWith(expect.anything(), TENANT, 'create')
    expect(mockUpload.mock.calls[0][1]).toEqual(uploadBody)
    expect(mockUpload.mock.calls[0][2]).toEqual({ userId: 'cashier-1', branchOutletId: null, mayReplaceAny: false })
  })

  it('refuses a member of the store who does not work the register', async () => {
    mockRequireCaller.mockResolvedValue({
      ok: true,
      user: { id: 'cook-1' },
      appUser: { role: 'admin', tenant_id: TENANT, is_owner: false, permissions: ['kitchen'], outlet_id: null },
    })
    expect((await upload(uploadBody)).status).toBe(403)
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it("passes a branch account's branch, and a reviewer's right to replace, to the upload rules", async () => {
    mockRequireCaller.mockResolvedValue({
      ok: true,
      user: { id: 'mgr-1' },
      appUser: { role: 'admin', tenant_id: TENANT, is_owner: false, permissions: ['pos', 'discount_review'], outlet_id: 'outlet-n' },
    })
    await upload(uploadBody)
    expect(mockUpload.mock.calls[0][2]).toEqual({ userId: 'mgr-1', branchOutletId: 'outlet-n', mayReplaceAny: true })
  })

  it('refuses a caller who is not a member of the store, before storing anything', async () => {
    mockRequireCaller.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    expect((await upload(uploadBody)).status).toBe(403)
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it.each([
    [{ ...uploadBody, tenantId: 'nope' }],
    [{ ...uploadBody, backend: 'mysql' }],
    [{ ...uploadBody, uploadedBy: 'someone-else' }],
    [{ ...uploadBody, photo: undefined }],
  ])('rejects a malformed body without checking the caller', async (body) => {
    expect((await upload(body)).status).toBe(400)
    expect(mockRequireCaller).not.toHaveBeenCalled()
  })

  it('passes the refusal status through (the register drops or retries on it)', async () => {
    mockUpload.mockResolvedValue({ ok: false, status: 410, code: 'photos_off', error: 'This store does not keep ID photos.' })
    const response = await upload(uploadBody)
    expect(response.status).toBe(410)
    expect(await response.json()).toMatchObject({ code: 'photos_off' })
  })

  it('answers a failure with a friendly 500', async () => {
    mockUpload.mockRejectedValue(new Error('storage down'))
    const response = await upload(uploadBody)
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('storage down')
  })
})

describe('POST /api/gov-discounts/id-photos/link', () => {
  const link = async (body: unknown, headers: Record<string, string> = {}) => {
    const { POST } = await import('@/app/api/gov-discounts/id-photos/link/route')
    return POST(post('/api/gov-discounts/id-photos/link', body, headers))
  }

  it('signs a 60-second link only after the caller’s own RLS read finds the photo (cookie session)', async () => {
    const client = rlsClient({ object_path: `${TENANT}/p.jpg` })
    mockCookieClient.mockReturnValue(client)
    const response = await link({ tenantId: TENANT, photoId: PHOTO })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ url: 'https://signed.example/id.jpg?token=x' })
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(client.from).toHaveBeenCalledWith('gov_discount_id_photos')
    expect(client.query.eq).toHaveBeenCalledWith('id', PHOTO)
    expect(client.query.eq).toHaveBeenCalledWith('tenant_id', TENANT)
    expect(mockSign).toHaveBeenCalledWith(`${TENANT}/p.jpg`, 60)
  })

  it('uses the app’s bearer session when a token is sent', async () => {
    const client = rlsClient({ object_path: `${TENANT}/p.jpg` })
    mockAuthenticate.mockResolvedValue({ ok: true, supabase: client, user: { id: 'reviewer-2' } })
    const response = await link({ tenantId: TENANT, photoId: PHOTO }, { authorization: 'Bearer t' })
    expect(response.status).toBe(200)
    expect(mockCookieClient).not.toHaveBeenCalled()
  })

  it('signs nothing when RLS hides the photo (not a reviewer, other branch, or expired)', async () => {
    mockCookieClient.mockReturnValue(rlsClient(null))
    const response = await link({ tenantId: TENANT, photoId: PHOTO })
    expect(response.status).toBe(404)
    expect(mockSign).not.toHaveBeenCalled()
  })

  it('refuses a signed-out caller', async () => {
    mockCookieClient.mockReturnValue(rlsClient(null, ''))
    expect((await link({ tenantId: TENANT, photoId: PHOTO })).status).toBe(401)
    expect(mockSign).not.toHaveBeenCalled()
  })

  it('rejects a malformed body', async () => {
    expect((await link({ tenantId: TENANT, photoId: 'x' })).status).toBe(400)
    expect((await link({ tenantId: TENANT, photoId: PHOTO, objectPath: 'other/x.jpg' })).status).toBe(400)
  })
})

describe('GET /api/gov-discounts/id-photos/purge', () => {
  const purge = async (authorization?: string) => {
    const { GET } = await import('@/app/api/gov-discounts/id-photos/purge/route')
    return GET(
      new NextRequest('http://localhost/api/gov-discounts/id-photos/purge', {
        headers: authorization ? { authorization } : {},
      }),
    )
  }

  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret'
    mockPurge.mockResolvedValue({ deleted: 2, hasMore: false })
  })

  it('runs only for the cron secret', async () => {
    expect((await purge()).status).toBe(401)
    expect((await purge('Bearer wrong-secret')).status).toBe(401)
    expect(mockPurge).not.toHaveBeenCalled()

    const response = await purge('Bearer cron-secret')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, deleted: 2, hasMore: false })
  })
})
