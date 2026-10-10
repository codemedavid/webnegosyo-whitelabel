/** @jest-environment node */
/**
 * The rewards page's "text me a code first" endpoints. Modules under test are
 * imported inside each test: next/jest does not hoist jest.mock above imports.
 */
import { NextRequest } from 'next/server'

const TENANT = '11111111-1111-1111-1111-111111111111'
const CHALLENGE = '66666666-6666-6666-6666-666666666666'
const FALLBACK = { apiKey: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', senderName: null }

const rpcResponses: Record<string, { data: unknown; error: unknown }> = {}
const rpc = jest.fn((name: string) => Promise.resolve(rpcResponses[name] ?? { data: null, error: { message: 'unexpected' } }))
const settings = { data: null as { wallet_otp_required: boolean } | null, error: null as unknown }
const admin = {
  rpc,
  from: (table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => (table === 'loyalty_store_settings' ? settings : { data: { name: 'Cafe' }, error: null }),
      }),
    }),
  }),
}

jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))
jest.mock('@/lib/loyalty/public-ingress', () => ({ getLoyaltyTrustedIp: () => '203.0.113.9' }))
jest.mock('@/lib/loyalty/wallet-verification', () => ({ issueWalletChallenge: jest.fn(), verifyWalletChallenge: jest.fn() }))
jest.mock('@/lib/loyalty/otp-delivery', () => ({
  ...jest.requireActual('@/lib/loyalty/otp-delivery'),
  dispatchOtpViaSemaphore: jest.fn(async () => 'sent'),
}))
jest.mock('@/lib/tenant-secrets', () => ({ getLoyaltySmsFallback: jest.fn() }))
jest.mock('@/lib/loyalty/server-keys', () => {
  const { createLoyaltyClaimCrypto } = jest.requireActual('@/lib/loyalty/claim-crypto')
  const crypto = createLoyaltyClaimCrypto({ hashKey: Buffer.alloc(32, 1), encryptionKey: Buffer.alloc(32, 2) })
  return { loadLoyaltyClaimCrypto: () => crypto }
})

function post(path: string, body: Record<string, unknown>) {
  return new NextRequest(`https://store.example/api/loyalty/wallet/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function load() {
  const http = await import('@/lib/loyalty/wallet-verification-http')
  const service = await import('@/lib/loyalty/wallet-verification')
  const delivery = await import('@/lib/loyalty/otp-delivery')
  const secrets = await import('@/lib/tenant-secrets')
  return {
    ...http,
    issue: service.issueWalletChallenge as jest.Mock,
    verify: service.verifyWalletChallenge as jest.Mock,
    dispatch: delivery.dispatchOtpViaSemaphore as jest.Mock,
    readFallback: secrets.getLoyaltySmsFallback as jest.Mock,
  }
}

function gateway(online: boolean) {
  rpcResponses.loyalty_sms_sender_status = { data: { ok: true, gatewayOnline: online, lastSeenAt: null }, error: null }
}

beforeEach(() => {
  process.env.LOYALTY_SMS_DELIVERY_ENABLED = 'true'
  for (const key of Object.keys(rpcResponses)) delete rpcResponses[key]
  settings.data = { wallet_otp_required: true }
  settings.error = null
  jest.clearAllMocks()
})

const codeRequest = { tenantId: TENANT, phone: '09171234567' }

test('a store that does not ask for codes never sends one', async () => {
  const { handleWalletCodeRequest, issue } = await load()
  settings.data = null
  const response = await handleWalletCodeRequest(post('code', codeRequest))
  expect(response.status).toBe(409)
  expect((await response.json()).reason).toBe('not_required')
  expect(issue).not.toHaveBeenCalled()
})

test('queues the code for the store phone when one is online', async () => {
  const { handleWalletCodeRequest, issue, dispatch } = await load()
  gateway(true)
  issue.mockResolvedValue({ ok: true, challengeId: CHALLENGE, expiresAt: 'x' })
  const response = await handleWalletCodeRequest(post('code', codeRequest))
  expect(response.status).toBe(202)
  expect(await response.json()).toEqual({ accepted: true, challengeId: CHALLENGE, expiresInSeconds: 300 })
  expect(issue).toHaveBeenCalledWith({ tenantId: TENANT, phone: '+639171234567', trustedIp: '203.0.113.9' }, expect.anything())
  expect(dispatch).not.toHaveBeenCalled()
})

test('sends through Semaphore when no phone is online', async () => {
  const { handleWalletCodeRequest, issue, dispatch, readFallback } = await load()
  gateway(false)
  readFallback.mockResolvedValue(FALLBACK)
  issue.mockResolvedValue({ ok: true, challengeId: CHALLENGE, expiresAt: 'x' })
  expect((await handleWalletCodeRequest(post('code', codeRequest))).status).toBe(202)
  expect(dispatch).toHaveBeenCalledWith(
    { tenantId: TENANT, challengeId: CHALLENGE, storeName: 'Cafe' },
    expect.objectContaining({ semaphore: FALLBACK }),
  )
})

test('says plainly when the store cannot text anyone, without issuing', async () => {
  const { handleWalletCodeRequest, issue, readFallback } = await load()
  gateway(false)
  readFallback.mockResolvedValue(null)
  const response = await handleWalletCodeRequest(post('code', codeRequest))
  expect(response.status).toBe(503)
  expect((await response.json()).reason).toBe('no_sender')
  expect(issue).not.toHaveBeenCalled()
})

test('a rate-limited number is told how long to wait instead of "a code is on its way"', async () => {
  const { handleWalletCodeRequest, issue, dispatch } = await load()
  gateway(true)
  issue.mockResolvedValue({ ok: false, error: 'rate_limited', retryAfterSeconds: 412 })
  const response = await handleWalletCodeRequest(post('code', codeRequest))
  expect(response.status).toBe(429)
  expect(response.headers.get('retry-after')).toBe('412')
  const body = await response.json()
  expect(body).toMatchObject({ reason: 'rate_limited', retryAfterSeconds: 412 })
  expect(body.error).toMatch(/too many codes/i)
  expect(body.error).toMatch(/7 minutes/)
  expect(body.challengeId).toBeUndefined()
  expect(dispatch).not.toHaveBeenCalled()
})

test('a short wait is said in seconds', async () => {
  const { handleWalletCodeRequest, issue } = await load()
  gateway(true)
  issue.mockResolvedValue({ ok: false, error: 'rate_limited', retryAfterSeconds: 42 })
  const body = await (await handleWalletCodeRequest(post('code', codeRequest))).json()
  expect(body.error).toMatch(/42 seconds/)
})

test('a non-member gets the same answer as a member, and nothing is sent', async () => {
  const { handleWalletCodeRequest, issue, dispatch, readFallback } = await load()
  gateway(false)
  readFallback.mockResolvedValue(FALLBACK)
  issue.mockResolvedValue({ ok: false, error: 'request_denied' })
  const response = await handleWalletCodeRequest(post('code', codeRequest))
  expect(response.status).toBe(202)
  expect((await response.json()).accepted).toBe(true)
  expect(dispatch).not.toHaveBeenCalled()
})

test('an unreadable store setting refuses rather than texting', async () => {
  const { handleWalletCodeRequest, issue } = await load()
  settings.error = { message: 'down' }
  expect((await handleWalletCodeRequest(post('code', codeRequest))).status).toBe(503)
  expect(issue).not.toHaveBeenCalled()
})

test('without SMS delivery the page is told no code can be sent', async () => {
  const { handleWalletCodeRequest } = await load()
  process.env.LOYALTY_SMS_DELIVERY_ENABLED = 'false'
  const response = await handleWalletCodeRequest(post('code', codeRequest))
  expect(response.status).toBe(503)
  expect((await response.json()).reason).toBe('no_sender')
})

test('a correct code returns a session token; a wrong one a plain 400', async () => {
  const { handleWalletCodeVerify, verify } = await load()
  const body = { tenantId: TENANT, challengeId: CHALLENGE, phone: '09171234567', code: '012345' }
  verify.mockResolvedValueOnce({ ok: true, token: 'ws1.token', expiresAt: '2026-10-04T00:30:00Z' })
  const ok = await handleWalletCodeVerify(post('verify', body))
  expect(ok.status).toBe(200)
  expect(await ok.json()).toEqual({ sessionToken: 'ws1.token', expiresAt: '2026-10-04T00:30:00Z' })
  verify.mockResolvedValueOnce({ ok: false, error: 'invalid_code' })
  expect((await handleWalletCodeVerify(post('verify', body))).status).toBe(400)
  verify.mockResolvedValueOnce({ ok: false, error: 'unavailable' })
  expect((await handleWalletCodeVerify(post('verify', body))).status).toBe(503)
  expect((await handleWalletCodeVerify(post('verify', { ...body, code: 'abc' }))).status).toBe(400)
})
