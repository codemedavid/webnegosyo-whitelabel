/** @jest-environment node */
jest.mock('server-only', () => ({}))
import { NextRequest } from 'next/server'
import { createLoyaltyClaimCrypto } from '@/lib/loyalty/claim-crypto'
import { hashDeviceCredential } from '@/lib/loyalty/device-credential'
import { POST } from '@/app/api/loyalty/sms-delivery/[action]/route'

const tenantId = '11111111-1111-4111-8111-111111111111'
const deviceId = '33333333-3333-4333-8333-333333333333'
const jobId = '44444444-4444-4444-8444-444444444444'
const leaseToken = '55555555-5555-4555-8555-555555555555'
const challengeId = '66666666-6666-4666-8666-666666666666'
const actorId = '77777777-7777-4777-8777-777777777777'
const credential = 'A'.repeat(43)
const credentialHash = hashDeviceCredential(credential)!
const hashKey = Buffer.alloc(32, 1)
const encryptionKey = Buffer.alloc(32, 2)
const crypto = createLoyaltyClaimCrypto({ hashKey, encryptionKey })
let mockUser: { id: string } | null
let mockMember: Record<string, unknown> | null
let mockAuthError: unknown
let mockMemberError: unknown
const mockRpc = jest.fn()

jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: mockUser }, error: mockAuthError }) },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: mockMember, error: mockMemberError }) }) }) }),
}) }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}) }))

const base = { tenantId, deviceId, credential }
const identity = { p_tenant_id: tenantId, p_actor_id: actorId, p_device_id: deviceId, p_credential_hash: credentialHash }

function call(action: string, body: unknown, authorization = 'Bearer token') {
  const request = new NextRequest(`https://example.test/api/loyalty/sms-delivery/${action}`, {
    method: 'POST', headers: { authorization }, body: JSON.stringify(body),
  })
  return POST(request, { params: Promise.resolve({ action }) })
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(Date.parse('2026-09-09T12:00:00Z'))
  process.env.LOYALTY_SMS_DELIVERY_ENABLED = 'true'
  process.env.LOYALTY_HASH_KEY = hashKey.toString('base64')
  process.env.LOYALTY_ENCRYPTION_KEY = encryptionKey.toString('base64')
  mockUser = { id: actorId }
  mockMember = { role: 'admin', tenant_id: tenantId, permissions: ['loyalty_manage'], is_owner: false }
  mockAuthError = null
  mockMemberError = null
  mockRpc.mockReset().mockResolvedValue({ data: { ok: true }, error: null })
})

afterEach(() => { jest.useRealTimers() })
afterAll(() => {
  delete process.env.LOYALTY_SMS_DELIVERY_ENABLED
  delete process.env.LOYALTY_HASH_KEY
  delete process.env.LOYALTY_ENCRYPTION_KEY
})

describe('gate and authorization shared by every action', () => {
  it('stays unavailable unless the delivery release gate is explicitly enabled', async () => {
    delete process.env.LOYALTY_SMS_DELIVERY_ENABLED
    expect((await call('claim', base)).status).toBe(503)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rejects unknown actions', async () => {
    expect((await call('steal', base)).status).toBe(404)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('requires a valid bearer session', async () => {
    expect((await call('claim', base, '')).status).toBe(401)
    mockUser = null
    expect((await call('claim', base)).status).toBe(401)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it.each([
    { role: 'admin', tenant_id: 'other', permissions: null, is_owner: true },
    { role: 'admin', tenant_id: tenantId, permissions: ['pos'], is_owner: false },
    { role: 'customer', tenant_id: tenantId, permissions: null, is_owner: false },
    null,
  ])('requires merchant membership and the loyalty_manage grant: %j', async (member) => {
    mockMember = member
    expect((await call('claim', base)).status).toBe(403)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it.each([
    {}, { tenantId, deviceId }, { ...base, credential: 'short' }, { ...base, credential: `${'a'.repeat(42)}=` },
    { ...base, deviceId: 'nope' }, { ...base, jobId }, 'text',
  ])('rejects malformed claim bodies without hashing a credential: %j', async (body) => {
    expect((await call('claim', body)).status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

describe('claim', () => {
  it('returns the leased job metadata only', async () => {
    mockRpc.mockResolvedValue({ data: {
      ok: true, jobId, leaseToken, leaseExpiresAt: '2026-09-09T12:00:30+00:00',
      challengeId, expiresAt: '2026-09-09T12:05:00+00:00',
    }, error: null })
    const response = await call('claim', base)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ job: { jobId, leaseToken, leaseExpiresAt: '2026-09-09T12:00:30+00:00' } })
    expect(mockRpc).toHaveBeenCalledWith('claim_loyalty_sms_job', identity)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('reports an empty queue as no job', async () => {
    mockRpc.mockResolvedValue({ data: { ok: false, error: 'no_job' }, error: null })
    const response = await call('claim', base)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ job: null })
  })

  it('tells a revoked or unauthorized device to stop polling', async () => {
    mockRpc.mockResolvedValue({ data: { ok: false, error: 'request_denied' }, error: null })
    expect((await call('claim', base)).status).toBe(403)
  })

  it('does not expose database failures', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'relation missing' } })
    const response = await call('claim', base)
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain('relation missing')
  })

  it('refuses a malformed claim row instead of forwarding it', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, jobId, leaseToken: 'bad', leaseExpiresAt: 'soon' }, error: null })
    expect((await call('claim', base)).status).toBe(503)
  })
})

describe('authorize', () => {
  const payloadEncrypted = () => crypto.encryptSms({ tenantId, challengeId }, { phone: '+639171234567', code: '012345' })
  const grant = () => ({ ok: true, jobId, leaseToken, challengeId, payloadEncrypted: payloadEncrypted(), expiresAt: '2026-09-09T12:05:00+00:00' })

  it('decrypts the one-time grant with the deployment keys and returns dispatch fields only', async () => {
    mockRpc.mockResolvedValue({ data: grant(), error: null })
    const response = await call('authorize', { ...base, jobId, leaseToken })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ grant: {
      jobId, leaseToken, phone: '+639171234567', code: '012345', expiresAt: '2026-09-09T12:05:00+00:00',
    } })
    expect(mockRpc).toHaveBeenCalledWith('authorize_loyalty_sms_dispatch', { ...identity, p_job_id: jobId, p_lease_token: leaseToken })
  })

  it('requires a job and lease token', async () => {
    expect((await call('authorize', base)).status).toBe(400)
    expect((await call('authorize', { ...base, jobId })).status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns no grant when the database refuses', async () => {
    mockRpc.mockResolvedValue({ data: { ok: false, error: 'request_denied' }, error: null })
    const response = await call('authorize', { ...base, jobId, leaseToken })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ grant: null })
  })

  it('returns no grant when the payload was encrypted for another challenge', async () => {
    const wrong = crypto.encryptSms({ tenantId, challengeId: jobId }, { phone: '+639171234567', code: '012345' })
    mockRpc.mockResolvedValue({ data: { ...grant(), payloadEncrypted: wrong }, error: null })
    expect(await (await call('authorize', { ...base, jobId, leaseToken })).json()).toEqual({ grant: null })
  })

  it('is unavailable without deployment keys and never reaches the database', async () => {
    delete process.env.LOYALTY_ENCRYPTION_KEY
    expect((await call('authorize', { ...base, jobId, leaseToken })).status).toBe(503)
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

describe.each(['finish', 'recover'] as const)('%s', (action) => {
  const rpcName = action === 'finish' ? 'finish_loyalty_sms_job' : 'recover_loyalty_sms_ack'

  it.each(['sent', 'failed'] as const)('acknowledges a %s outcome', async (outcome) => {
    const response = await call(action, { ...base, jobId, leaseToken, outcome })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ applied: true })
    expect(mockRpc).toHaveBeenCalledWith(rpcName, { ...identity, p_job_id: jobId, p_lease_token: leaseToken, p_outcome: outcome })
  })

  it('reports a refused acknowledgement without throwing it away', async () => {
    mockRpc.mockResolvedValue({ data: { ok: false, error: 'request_denied' }, error: null })
    const response = await call(action, { ...base, jobId, leaseToken, outcome: 'sent' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ applied: false })
  })

  it('signals an invalid device credential separately from a refused lease acknowledgement', async () => {
    mockRpc.mockResolvedValue({ data: { ok: false, error: 'device_denied' }, error: null })
    const response = await call(action, { ...base, jobId, leaseToken, outcome: 'failed' })
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Forbidden' })
  })

  it('rejects unknown outcomes and missing lease fields', async () => {
    expect((await call(action, { ...base, jobId, leaseToken, outcome: 'maybe' })).status).toBe(400)
    expect((await call(action, { ...base, jobId, outcome: 'sent' })).status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('surfaces a database failure as retryable', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'timeout' } })
    expect((await call(action, { ...base, jobId, leaseToken, outcome: 'sent' })).status).toBe(503)
  })
})
