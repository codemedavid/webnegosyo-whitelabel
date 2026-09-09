/** @jest-environment node */
jest.mock('server-only', () => ({}))
import { NextRequest } from 'next/server'
import { POST as requestCode } from '@/app/api/loyalty/claims/request/route'
import { POST as verifyCode } from '@/app/api/loyalty/claims/verify/route'
import { createLoyaltyClaimCrypto } from '@/lib/loyalty/claim-crypto'

const mockRpc = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }) }))
const tenantId = 'ABCDEF11-1111-4111-8111-111111111111'
const entitlementId = 'ABCDEF22-2222-4222-8222-222222222222'
const challengeId = 'abcdef33-3333-4333-8333-333333333333'
const phone = '0917 123 4567'
const issuance = { tenantId, entitlementId, phone }
const verification = { tenantId, challengeId, phone, code: '012345' }
const envNames = ['LOYALTY_PUBLIC_CLAIMS_ENABLED', 'LOYALTY_SMS_DELIVERY_ENABLED', 'LOYALTY_PUBLIC_TRUSTED_INGRESS', 'VERCEL', 'LOYALTY_HASH_KEY', 'LOYALTY_ENCRYPTION_KEY']
const originalEnv = Object.fromEntries(envNames.map(key => [key, process.env[key]]))

function request(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('https://store.example/api/loyalty/claims/request', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '203.0.113.4', ...headers },
    body: JSON.stringify(body),
  })
}
async function run(handler: typeof requestCode, input: NextRequest) {
  const pending = handler(input)
  await jest.runAllTimersAsync()
  return pending
}
function crypto() {
  return createLoyaltyClaimCrypto({ hashKey: Buffer.alloc(32, 1), encryptionKey: Buffer.alloc(32, 2) })
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-09-10T00:00:00Z') })
  process.env.LOYALTY_PUBLIC_CLAIMS_ENABLED = 'true'
  process.env.LOYALTY_SMS_DELIVERY_ENABLED = 'true'
  process.env.LOYALTY_PUBLIC_TRUSTED_INGRESS = 'vercel'
  process.env.VERCEL = '1'
  process.env.LOYALTY_HASH_KEY = Buffer.alloc(32, 1).toString('base64')
  process.env.LOYALTY_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString('base64')
  mockRpc.mockReset().mockImplementation(async (name, args) => {
    if (name === 'issue_loyalty_challenge') return { data: { ok: true, challengeId: args.p_challenge_id, expiresAt: new Date(Date.now() + 300_000).toISOString() }, error: null }
    if (name === 'allow_loyalty_verification_attempt') return { data: { ok: true }, error: null }
    if (name === 'verify_loyalty_claim') return { data: { ok: true, claimId: '44444444-4444-4444-8444-444444444444', expiresAt: new Date(Date.now() + 120_000).toISOString() }, error: null }
    throw new Error('Unexpected RPC')
  })
})
afterEach(() => jest.useRealTimers())
afterAll(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

it.each([requestCode, verifyCode])('requires public and SMS gates, keys and trusted ingress', async handler => {
  for (const key of envNames) {
    const value = process.env[key]
    delete process.env[key]
    const response = await run(handler, request(handler === requestCode ? issuance : verification))
    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('no-store')
    process.env[key] = value
  }
  expect(mockRpc).not.toHaveBeenCalled()
})

it('issues from canonical server proofs and returns no code, phone, reward or profile data', async () => {
  const response = await run(requestCode, request(issuance, { 'x-forwarded-for': '192.0.2.5' }))
  expect(response.status).toBe(202)
  expect(response.headers.get('cache-control')).toBe('no-store')
  const body = await response.json()
  expect(body).toEqual({ accepted: true, challengeId: expect.any(String), expiresInSeconds: 300 })
  const [name, args] = mockRpc.mock.calls[0]
  expect(name).toBe('issue_loyalty_challenge')
  expect(args).toMatchObject({ p_tenant_id: tenantId.toLowerCase(), p_entitlement_id: entitlementId.toLowerCase(),
    p_expected_customer_key: 'phone:+639171234567', p_phone_hash: crypto().hashPhone(tenantId, '+639171234567'),
    p_ip_hash: crypto().hashIp('203.0.113.4'), p_challenge_id: body.challengeId })
  const payload = crypto().decryptSms({ tenantId, challengeId: body.challengeId }, args.p_payload_encrypted)
  expect(payload.phone).toBe('+639171234567')
  expect(payload.code).toMatch(/^[0-9]{6}$/)
})

it.each([
  { data: { ok: false, error: 'request_denied' }, error: null },
  { data: null, error: { message: 'private connection details' } },
  { data: { ok: true, challengeId: 'malformed' }, error: null },
])('conceals denied, throttled and uncertain issuance with the same public shape: %j', async result => {
  mockRpc.mockResolvedValue(result)
  const start = Date.now()
  const response = await run(requestCode, request(issuance))
  expect(Date.now() - start).toBeGreaterThanOrEqual(350)
  expect(response.status).toBe(202)
  expect(await response.json()).toEqual({ accepted: true,
    challengeId: expect.stringMatching(/^[0-9a-f-]{36}$/), expiresInSeconds: 300 })
})

it('applies the same minimum response delay to successful issuance', async () => {
  const start = Date.now()
  await run(requestCode, request(issuance))
  expect(Date.now() - start).toBeGreaterThanOrEqual(350)
})

it.each([
  { ...issuance, trustedIp: '192.0.2.1' }, { ...issuance, codeHash: 'a'.repeat(64) },
  { ...issuance, customerKey: 'phone:+639171234567' }, { ...issuance, phone: 'abc09171234567' },
  { ...issuance, phone: '+632123456789' }, { ...issuance, tenantId: 'bad' }, [], null,
])('rejects invalid issuance input or injected proofs: %j', async input => {
  expect((await run(requestCode, request(input))).status).toBe(400)
  expect(mockRpc).not.toHaveBeenCalled()
})

it.each([requestCode, verifyCode])('requires JSON, bounds actual bytes, and handles broken JSON', async handler => {
  expect((await run(handler, request(issuance, { 'content-type': 'text/plain' }))).status).toBe(415)
  expect((await run(handler, request({ phone: 'a'.repeat(17_000) }, { 'content-length': '1' }))).status).toBe(413)
  const broken = new NextRequest('https://store.example/api/loyalty/claims/request', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '203.0.113.4' }, body: '{',
  })
  expect((await run(handler, broken)).status).toBe(400)
  expect(mockRpc).not.toHaveBeenCalled()
})

it('verifies through durable limits, returning only the signed claim and original expiry', async () => {
  const response = await run(verifyCode, request(verification))
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(Object.keys(body).sort()).toEqual(['expiresAt', 'token'])
  const tokenHash = crypto().resolveClaim(tenantId, body.token)
  expect(tokenHash).not.toBeNull()
  expect(mockRpc.mock.calls.map(([name]) => name)).toEqual(['allow_loyalty_verification_attempt', 'verify_loyalty_claim'])
  expect(mockRpc.mock.calls[1][1]).toEqual({ p_tenant_id: tenantId.toLowerCase(), p_challenge_id: challengeId,
    p_candidate_code_hash: crypto().hashCode({ tenantId, challengeId }, '012345'),
    p_claim_token_hash: tokenHash, p_expected_customer_key: 'phone:+639171234567',
    p_expected_phone_hash: crypto().hashPhone(tenantId, '+639171234567') })
  expect(response.headers.get('cache-control')).toBe('no-store')
})

it('returns the same error for rate-limited, expired, wrong and reused challenges', async () => {
  const denied = { data: { ok: false, error: 'invalid_claim' }, error: null }
  mockRpc.mockResolvedValue(denied)
  const limited = await run(verifyCode, request(verification))
  mockRpc.mockReset().mockResolvedValueOnce({ data: { ok: true }, error: null }).mockResolvedValue(denied)
  const invalid = await run(verifyCode, request(verification))
  expect(limited.status).toBe(400)
  expect(invalid.status).toBe(400)
  expect(await limited.json()).toEqual(await invalid.json())
})

it('does not retry or leak a token when verification may have committed', async () => {
  mockRpc.mockReset().mockResolvedValueOnce({ data: { ok: true }, error: null })
    .mockRejectedValueOnce(new Error('private verification arguments'))
  const response = await run(verifyCode, request(verification))
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ error: 'Verification could not be confirmed. Please request a new code.' })
  expect(mockRpc).toHaveBeenCalledTimes(2)
})

it.each([
  { ...verification, code: 123456 }, { ...verification, code: '12345' },
  { ...verification, token: 'arbitrary' }, { ...verification, entitlementId },
])('refuses malformed verification: %j', async input => {
  expect((await run(verifyCode, request(input))).status).toBe(400)
  expect(mockRpc).not.toHaveBeenCalled()
})
