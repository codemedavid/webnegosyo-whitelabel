/** @jest-environment node */
/**
 * The public "send me a code" request picks its sender BEFORE issuing: the
 * store's gateway phone, the store's Semaphore account, or an honest "this
 * store can't send codes right now" — never a code that no one will send.
 *
 * Modules under test are imported inside each test: next/jest's SWC transform
 * does not hoist jest.mock above static imports.
 */
import { NextRequest } from 'next/server'

const TENANT = '11111111-1111-1111-1111-111111111111'
const REWARD = '22222222-2222-2222-2222-222222222222'
const CHALLENGE = '66666666-6666-6666-6666-666666666666'
const JOB = '44444444-4444-4444-4444-444444444444'
const FALLBACK = { apiKey: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', senderName: null }

const rpcResponses: Record<string, { data: unknown; error: unknown }> = {}
const rpc = jest.fn((name: string) => Promise.resolve(rpcResponses[name] ?? { data: null, error: { message: 'unexpected' } }))
const admin = {
  rpc,
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Cafe' }, error: null }) }) }) }),
}

jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))
jest.mock('@/lib/loyalty/public-ingress', () => ({ getLoyaltyTrustedIp: () => '203.0.113.9' }))
jest.mock('@/lib/loyalty/challenge-issuer', () => ({ issueLoyaltyChallenge: jest.fn() }))
jest.mock('@/lib/loyalty/semaphore', () => ({ ...jest.requireActual('@/lib/loyalty/semaphore'), sendSemaphoreOtp: jest.fn() }))
jest.mock('@/lib/tenant-secrets', () => ({ getLoyaltySmsFallback: jest.fn() }))
jest.mock('@/lib/loyalty/server-keys', () => {
  const { createLoyaltyClaimCrypto } = jest.requireActual('@/lib/loyalty/claim-crypto')
  const crypto = createLoyaltyClaimCrypto({ hashKey: Buffer.alloc(32, 1), encryptionKey: Buffer.alloc(32, 2) })
  return { loadLoyaltyClaimCrypto: () => crypto }
})

function request() {
  return new NextRequest('https://store.example/api/loyalty/claims/request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantId: TENANT, entitlementId: REWARD, phone: '09171234567' }),
  })
}

async function load() {
  const http = await import('@/lib/loyalty/public-claims-http')
  const issuer = await import('@/lib/loyalty/challenge-issuer')
  const semaphore = await import('@/lib/loyalty/semaphore')
  const secrets = await import('@/lib/tenant-secrets')
  const crypto = (await import('@/lib/loyalty/server-keys')).loadLoyaltyClaimCrypto()!
  return {
    handle: http.handlePublicClaimRequest,
    issue: issuer.issueLoyaltyChallenge as jest.Mock,
    send: semaphore.sendSemaphoreOtp as jest.Mock,
    readFallback: secrets.getLoyaltySmsFallback as jest.Mock,
    crypto,
  }
}

function gateway(online: boolean) {
  rpcResponses.loyalty_sms_sender_status = { data: { ok: true, gatewayOnline: online, lastSeenAt: null }, error: null }
}

beforeEach(() => {
  process.env.LOYALTY_PUBLIC_CLAIMS_ENABLED = 'true'
  process.env.LOYALTY_SMS_DELIVERY_ENABLED = 'true'
  for (const key of Object.keys(rpcResponses)) delete rpcResponses[key]
  rpc.mockClear()
  jest.clearAllMocks()
})

test('tells the customer when no phone is online and the store has no fallback, without issuing anything', async () => {
  const { handle, issue, readFallback } = await load()
  gateway(false)
  readFallback.mockResolvedValue(null)

  const started = Date.now()
  const response = await handle(request())

  expect(Date.now() - started).toBeGreaterThanOrEqual(340)
  expect(response.status).toBe(503)
  const body = await response.json()
  expect(body.reason).toBe('no_sender')
  expect(body.error).toMatch(/can.t send reward codes right now/i)
  expect(issue).not.toHaveBeenCalled()
})

test('queues for the store phone when one is online and never touches Semaphore', async () => {
  const { handle, issue, send, readFallback } = await load()
  gateway(true)
  issue.mockResolvedValue({ ok: true, challengeId: CHALLENGE, expiresAt: '2026-10-04T00:05:00Z' })

  const response = await handle(request())

  expect(response.status).toBe(202)
  expect((await response.json()).challengeId).toBe(CHALLENGE)
  expect(readFallback).not.toHaveBeenCalled()
  expect(send).not.toHaveBeenCalled()
  expect(rpc).not.toHaveBeenCalledWith('begin_loyalty_sms_server_dispatch', expect.anything())
})

test('sends through the store Semaphore account when every phone is off', async () => {
  const { handle, issue, send, readFallback, crypto } = await load()
  gateway(false)
  readFallback.mockResolvedValue(FALLBACK)
  issue.mockResolvedValue({ ok: true, challengeId: CHALLENGE, expiresAt: '2026-10-04T00:05:00Z' })
  rpcResponses.begin_loyalty_sms_server_dispatch = {
    data: { ok: true, jobId: JOB, payloadEncrypted: crypto.encryptSms({ tenantId: TENANT, challengeId: CHALLENGE }, { phone: '+639171234567', code: '012345' }) },
    error: null,
  }
  rpcResponses.finish_loyalty_sms_server_dispatch = { data: { ok: true }, error: null }
  send.mockResolvedValue({ ok: true })

  const response = await handle(request())

  expect(response.status).toBe(202)
  expect(send).toHaveBeenCalledWith(FALLBACK, expect.objectContaining({
    phone: '+639171234567',
    code: '012345',
    template: expect.stringContaining('your Cafe reward code'),
  }))
  expect(rpc).toHaveBeenCalledWith('finish_loyalty_sms_server_dispatch', { p_tenant_id: TENANT, p_job_id: JOB, p_outcome: 'sent' })
})

test('a refused issuance (decoy) never reaches Semaphore', async () => {
  const { handle, issue, send, readFallback } = await load()
  gateway(false)
  readFallback.mockResolvedValue(FALLBACK)
  issue.mockResolvedValue({ ok: false, error: 'request_denied' })

  const response = await handle(request())

  expect(response.status).toBe(202)
  expect(send).not.toHaveBeenCalled()
})
