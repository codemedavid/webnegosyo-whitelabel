/** @jest-environment node */
import { NextRequest } from 'next/server'
import { appOtpRequestResultSchema, appOtpVerifyResultSchema } from '@/lib/app-contract'

jest.mock('server-only', () => ({}))

const getTenantApp = jest.fn()
jest.mock('@/lib/app-api/tenant-app', () => ({ getTenantApp: (...a: unknown[]) => getTenantApp(...a) }))
jest.mock('@/lib/distributed-rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true, remaining: 9, retryAfterSec: 1 }) }))
const captureException = jest.fn()
jest.mock('@sentry/nextjs', () => ({ captureException: (...a: unknown[]) => captureException(...a) }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: jest.fn() }), ADMIN_QUERY_TIMEOUT_MS: 8000 }))
jest.mock('@/lib/tenant-secrets', () => ({ getLoyaltySmsFallback: jest.fn(async () => null) }))
jest.mock('@/lib/loyalty/public-ingress', () => ({ getLoyaltyTrustedIp: () => '203.0.113.9' }))
jest.mock('@/lib/loyalty/server-keys', () => ({ loadLoyaltyClaimCrypto: () => ({}) }))

const loadOtpRouting = jest.fn()
const dispatchOtpViaSemaphore = jest.fn()
jest.mock('@/lib/loyalty/otp-delivery', () => ({
  loadOtpRouting: (...a: unknown[]) => loadOtpRouting(...a),
  dispatchOtpViaSemaphore: (...a: unknown[]) => dispatchOtpViaSemaphore(...a),
  readLoyaltyStoreName: async () => 'Beracah Cafe',
}))

const issueLoginChallenge = jest.fn()
const verifyLoginChallenge = jest.fn()
const openReviewSession = jest.fn()
const noteReviewRequest = jest.fn()
jest.mock('@/lib/customer-auth/login-challenge', () => ({
  ...jest.requireActual('@/lib/customer-auth/login-challenge'),
  noteReviewRequest: (...a: unknown[]) => noteReviewRequest(...a),
  issueLoginChallenge: (...a: unknown[]) => issueLoginChallenge(...a),
  verifyLoginChallenge: (...a: unknown[]) => verifyLoginChallenge(...a),
  openReviewSession: (...a: unknown[]) => openReviewSession(...a),
}))

const account = {
  resolveCustomerSession: jest.fn(),
  readProfile: jest.fn(),
  updateProfileName: jest.fn(),
  revokeSession: jest.fn(),
  deleteAccount: jest.fn(),
  readReviewPhone: jest.fn(),
}
jest.mock('@/lib/customer-auth/account', () => ({
  resolveCustomerSession: (...a: unknown[]) => account.resolveCustomerSession(...a),
  readProfile: (...a: unknown[]) => account.readProfile(...a),
  updateProfileName: (...a: unknown[]) => account.updateProfileName(...a),
  revokeSession: (...a: unknown[]) => account.revokeSession(...a),
  deleteAccount: (...a: unknown[]) => account.deleteAccount(...a),
  readReviewPhone: (...a: unknown[]) => account.readReviewPhone(...a),
}))

const TENANT = '00000000-0000-4000-8000-000000000001'
const CHALLENGE = '66666666-6666-4666-8666-666666666666'
const CUSTOMER = '77777777-7777-4777-8777-777777777777'
const RELEASE = { minimumVersion: null, latestVersion: null, storeUrl: null }
const APP = { tenantId: TENANT, slug: 'beracah-cafe', status: 'live', ios: RELEASE, android: RELEASE }
const TOKEN = `cs1.${'A'.repeat(43)}`

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-app-id': 'com.webnegosyo.beracah', ...headers },
    body: JSON.stringify(body),
  })
const call = (path: string, method: string, headers: Record<string, string> = {}, body?: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'x-app-id': 'com.webnegosyo.beracah', ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })

const routes = async () => ({
  request: (await import('@/app/api/app/v1/auth/otp/request/route')).POST,
  verify: (await import('@/app/api/app/v1/auth/otp/verify/route')).POST,
  session: (await import('@/app/api/app/v1/auth/session/route')).DELETE,
  me: await import('@/app/api/app/v1/me/route'),
})

beforeEach(() => {
  jest.clearAllMocks()
  process.env.LOYALTY_SMS_DELIVERY_ENABLED = 'true'
  getTenantApp.mockResolvedValue({ app: APP, error: null })
  loadOtpRouting.mockResolvedValue({ sender: 'gateway', semaphore: null })
  issueLoginChallenge.mockResolvedValue({ ok: true, challengeId: CHALLENGE, expiresAt: '2026-10-27T00:05:00Z' })
  account.readReviewPhone.mockResolvedValue(null)
  account.resolveCustomerSession.mockResolvedValue({ customerId: CUSTOMER, tokenHash: 'h' })
  account.readProfile.mockResolvedValue({ name: 'Ana', phoneE164: '+639171234567' })
  account.updateProfileName.mockResolvedValue(true)
})

describe('POST /auth/otp/request', () => {
  it('accepts with the challenge id, scoped to the build’s store', async () => {
    const { request } = await routes()
    const response = await request(post('/api/app/v1/auth/otp/request', { phone: '0917 123 4567' }))
    expect(response.status).toBe(202)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json()
    expect(appOtpRequestResultSchema.parse(body.data)).toEqual({ challengeId: CHALLENGE, expiresInSeconds: 300 })
    expect(issueLoginChallenge.mock.calls[0][0]).toEqual({ tenantId: TENANT, phone: '+639171234567', trustedIp: '203.0.113.9' })
  })

  it('answers a refusal with the same 202 and a decoy id', async () => {
    issueLoginChallenge.mockResolvedValue({ ok: false, error: 'request_denied' })
    const { request } = await routes()
    const response = await request(post('/api/app/v1/auth/otp/request', { phone: '09171234567' }))
    expect(response.status).toBe(202)
    const { data } = await response.json()
    expect(appOtpRequestResultSchema.safeParse(data).success).toBe(true)
    expect(data.challengeId).not.toBe(CHALLENGE)
  })

  it('says plainly only when the store has no way to text', async () => {
    loadOtpRouting.mockResolvedValue({ sender: 'none', semaphore: null })
    const { request } = await routes()
    const response = await request(post('/api/app/v1/auth/otp/request', { phone: '09171234567' }))
    expect(response.status).toBe(503)
    expect((await response.json()).error.message).toMatch(/can’t text sign-in codes/)
    expect(issueLoginChallenge).not.toHaveBeenCalled()
  })

  it('passes the wait on a rate limit', async () => {
    issueLoginChallenge.mockResolvedValue({ ok: false, error: 'rate_limited', retryAfterSeconds: 45 })
    const { request } = await routes()
    const response = await request(post('/api/app/v1/auth/otp/request', { phone: '09171234567' }))
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('45')
  })

  it('texts through the store’s Semaphore with sign-in wording when its phone is offline', async () => {
    const semaphore = { apiKey: 'k', senderName: null }
    loadOtpRouting.mockResolvedValue({ sender: 'semaphore', semaphore })
    const { request } = await routes()
    await request(post('/api/app/v1/auth/otp/request', { phone: '09171234567' }))
    expect(dispatchOtpViaSemaphore.mock.calls[0][0]).toEqual({ tenantId: TENANT, challengeId: CHALLENGE, storeName: 'Beracah Cafe', purpose: 'login' })
  })

  it('refuses a non-PH-mobile number and is off without the release flag', async () => {
    const { request } = await routes()
    expect((await request(post('/api/app/v1/auth/otp/request', { phone: '+1 555 123 4567' }))).status).toBe(400)
    process.env.LOYALTY_SMS_DELIVERY_ENABLED = 'false'
    expect((await request(post('/api/app/v1/auth/otp/request', { phone: '09171234567' }))).status).toBe(503)
    expect(issueLoginChallenge).not.toHaveBeenCalled()
  })

  it('never texts the App Review number of a draft app', async () => {
    getTenantApp.mockResolvedValue({ app: { ...APP, status: 'draft' }, error: null })
    account.readReviewPhone.mockResolvedValue('+639990000000')
    const { request } = await routes()
    noteReviewRequest.mockResolvedValue({ ok: true })
    const response = await request(post('/api/app/v1/auth/otp/request', { phone: '0999 000 0000' }))
    expect(response.status).toBe(202)
    expect(issueLoginChallenge).not.toHaveBeenCalled()
    expect(noteReviewRequest).toHaveBeenCalled()
  })

  it('rate-limits the App Review number exactly like any other number', async () => {
    getTenantApp.mockResolvedValue({ app: { ...APP, status: 'draft' }, error: null })
    account.readReviewPhone.mockResolvedValue('+639990000000')
    noteReviewRequest.mockResolvedValue({ ok: false, error: 'rate_limited', retryAfterSeconds: 45 })
    const { request } = await routes()
    const response = await request(post('/api/app/v1/auth/otp/request', { phone: '0999 000 0000' }))
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('45')
  })
})

describe('POST /auth/otp/verify', () => {
  const body = { challengeId: CHALLENGE, phone: '09171234567', code: '012345' }

  it('hands back the session token and profile', async () => {
    verifyLoginChallenge.mockResolvedValue({ ok: true, token: TOKEN, customerId: CUSTOMER, isNewCustomer: true, name: null, phoneE164: '+639171234567' })
    const { verify } = await routes()
    const response = await verify(post('/api/app/v1/auth/otp/verify', body))
    expect(response.status).toBe(200)
    expect(appOtpVerifyResultSchema.parse((await response.json()).data)).toEqual({
      token: TOKEN,
      isNewCustomer: true,
      profile: { name: null, phoneE164: '+639171234567' },
    })
    expect(verifyLoginChallenge.mock.calls[0][0]).toMatchObject({ tenantId: TENANT, challengeId: CHALLENGE, code: '012345' })
  })

  it('one generic answer for a wrong code and for a malformed body', async () => {
    verifyLoginChallenge.mockResolvedValue({ ok: false, error: 'invalid_code' })
    const { verify } = await routes()
    const wrong = await verify(post('/api/app/v1/auth/otp/verify', body))
    const malformed = await verify(post('/api/app/v1/auth/otp/verify', { ...body, code: '12' }))
    expect(wrong.status).toBe(401)
    expect(malformed.status).toBe(401)
    expect((await wrong.json()).error).toEqual((await malformed.json()).error)
  })

  it('uses the App Review shortcut only for a draft app’s review number', async () => {
    openReviewSession.mockResolvedValue({ ok: true, token: TOKEN, customerId: CUSTOMER, isNewCustomer: false, name: 'Reviewer', phoneE164: '+639990000000' })
    account.readReviewPhone.mockResolvedValue('+639990000000')
    const { verify } = await routes()
    getTenantApp.mockResolvedValue({ app: { ...APP, status: 'draft' }, error: null })
    expect((await verify(post('/api/app/v1/auth/otp/verify', { ...body, phone: '09990000000' }))).status).toBe(200)
    expect(openReviewSession).toHaveBeenCalledTimes(1)
    getTenantApp.mockResolvedValue({ app: APP, error: null })
    verifyLoginChallenge.mockResolvedValue({ ok: false, error: 'invalid_code' })
    expect((await verify(post('/api/app/v1/auth/otp/verify', { ...body, phone: '09990000000' }))).status).toBe(401)
    expect(openReviewSession).toHaveBeenCalledTimes(1)
  })
})

describe('/me and sign-out', () => {
  const bearer = { authorization: `Bearer ${TOKEN}` }

  it('reads the profile for the session of THIS store', async () => {
    const { me } = await routes()
    const response = await me.GET(call('/api/app/v1/me', 'GET', bearer))
    expect(response.status).toBe(200)
    expect((await response.json()).data).toEqual({ name: 'Ana', phoneE164: '+639171234567' })
    expect(account.resolveCustomerSession.mock.calls[0][1]).toBe(TENANT)
  })

  it('signed out (or another store’s token) is 401', async () => {
    account.resolveCustomerSession.mockResolvedValue(null)
    const { me } = await routes()
    expect((await me.GET(call('/api/app/v1/me', 'GET', bearer))).status).toBe(401)
    expect(account.readProfile).not.toHaveBeenCalled()
  })

  it('PATCH sets the name; DELETE removes the app account', async () => {
    const { me } = await routes()
    expect((await me.PATCH(call('/api/app/v1/me', 'PATCH', bearer, { name: '  Ana Cruz ' }))).status).toBe(200)
    expect(account.updateProfileName).toHaveBeenCalledWith(TENANT, CUSTOMER, 'Ana Cruz')
    expect((await me.PATCH(call('/api/app/v1/me', 'PATCH', bearer, { name: 'x'.repeat(61) }))).status).toBe(400)
    const deleted = await me.DELETE(call('/api/app/v1/me', 'DELETE', bearer))
    expect(deleted.status).toBe(200)
    expect(account.deleteAccount).toHaveBeenCalledWith(TENANT, CUSTOMER)
  })

  it('a deleted account reads as signed out', async () => {
    account.readProfile.mockResolvedValue(null)
    const { me } = await routes()
    expect((await me.GET(call('/api/app/v1/me', 'GET', bearer))).status).toBe(401)
  })

  it('sign-out revokes the presented token and is idempotent without one', async () => {
    const { session } = await routes()
    expect((await session(call('/api/app/v1/auth/session', 'DELETE', bearer))).status).toBe(200)
    expect(account.revokeSession).toHaveBeenCalledWith(TENANT, expect.stringMatching(/^[0-9a-f]{64}$/))
    expect((await session(call('/api/app/v1/auth/session', 'DELETE'))).status).toBe(200)
    expect(account.revokeSession).toHaveBeenCalledTimes(1)
  })
})
