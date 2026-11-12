/** @jest-environment node */
jest.mock('server-only', () => ({}))
import { createLoyaltyClaimCrypto } from '@/lib/loyalty/claim-crypto'

const tenant = '11111111-1111-1111-1111-111111111111'
const challenge = '66666666-6666-6666-6666-666666666666'
const customer = '77777777-7777-7777-7777-777777777777'
const ip = '203.0.113.9'
const crypto = createLoyaltyClaimCrypto({ hashKey: Buffer.alloc(32, 1), encryptionKey: Buffer.alloc(32, 2) })

type Reply = { data: unknown; error: unknown } | Error
function database(responses: Record<string, Reply[]>) {
  const queues = Object.fromEntries(Object.entries(responses).map(([name, list]) => [name, [...list]]))
  return {
    rpc: jest.fn((name: string, args: Record<string, unknown>) => {
      void args
      const next = queues[name]?.shift()
      if (next instanceof Error) return Promise.reject(next)
      return Promise.resolve(next ?? { data: null, error: { message: 'unexpected' } })
    }),
  }
}
const load = async () => import('@/lib/customer-auth/login-challenge')

describe('issueLoginChallenge', () => {
  it('derives every proof from the canonical number; anyone may ask (no member key sent)', async () => {
    const { issueLoginChallenge } = await load()
    const db = database({})
    db.rpc.mockImplementationOnce((_name, args) => Promise.resolve({ data: { ok: true, challengeId: args.p_challenge_id, expiresAt: '2026-10-27T00:05:00Z' }, error: null }))
    const result = await issueLoginChallenge({ tenantId: tenant, phone: '0917 123 4567', trustedIp: ip }, { crypto, database: db })
    expect(result.ok).toBe(true)
    const [name, args] = db.rpc.mock.calls[0]
    expect(name).toBe('issue_customer_login_challenge')
    expect(Object.keys(args).sort()).toEqual(['p_challenge_id', 'p_code_hash', 'p_ip_hash', 'p_payload_encrypted', 'p_phone_hash', 'p_tenant_id'])
    expect(args.p_phone_hash).toBe(crypto.hashPhone(tenant, '+639171234567'))
    const payload = crypto.decryptSms({ tenantId: tenant, challengeId: args.p_challenge_id as string }, args.p_payload_encrypted)
    expect(payload.phone).toBe('+639171234567')
    expect(args.p_code_hash).toBe(crypto.hashCode({ tenantId: tenant, challengeId: args.p_challenge_id as string }, payload.code))
  })

  it('retries an uncertain commit once with identical arguments', async () => {
    const { issueLoginChallenge } = await load()
    const db = database({})
    db.rpc
      .mockImplementationOnce(() => Promise.reject(new Error('socket')))
      .mockImplementationOnce((_name, args) => Promise.resolve({ data: { ok: true, challengeId: args.p_challenge_id, expiresAt: 'x' }, error: null }))
    expect((await issueLoginChallenge({ tenantId: tenant, phone: '09171234567', trustedIp: ip }, { crypto, database: db })).ok).toBe(true)
    expect(db.rpc.mock.calls[1][1]).toEqual(db.rpc.mock.calls[0][1])
  })

  it('never calls with a non-PH-mobile number, and passes rate limits through with the wait', async () => {
    const { issueLoginChallenge } = await load()
    const untouched = database({})
    expect(await issueLoginChallenge({ tenantId: tenant, phone: '+15551234567', trustedIp: ip }, { crypto, database: untouched }))
      .toEqual({ ok: false, error: 'request_denied' })
    expect(untouched.rpc).not.toHaveBeenCalled()
    const db = database({ issue_customer_login_challenge: [{ data: { ok: false, error: 'rate_limited', retryAfterSeconds: 42 }, error: null }] })
    expect(await issueLoginChallenge({ tenantId: tenant, phone: '09171234567', trustedIp: ip }, { crypto, database: db }))
      .toEqual({ ok: false, error: 'rate_limited', retryAfterSeconds: 42 })
  })
})

describe('verifyLoginChallenge', () => {
  const input = { tenantId: tenant, challengeId: challenge, phone: '09171234567', code: '012345', trustedIp: ip }
  const opened = { ok: true, customerId: customer, isNewCustomer: true, name: null, phoneE164: '+639171234567' }

  it('spends the guessing budget first, then opens a session and hands back the raw token once', async () => {
    const { verifyLoginChallenge } = await load()
    const db = database({
      allow_loyalty_verification_attempt: [{ data: { ok: true }, error: null }],
      verify_customer_login_challenge: [{ data: opened, error: null }],
    })
    const result = await verifyLoginChallenge(input, { crypto, database: db })
    expect(result).toMatchObject({ ok: true, customerId: customer, isNewCustomer: true, name: null, phoneE164: '+639171234567' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.token).toMatch(/^cs1\./)
    expect(db.rpc.mock.calls.map(([name]) => name)).toEqual(['allow_loyalty_verification_attempt', 'verify_customer_login_challenge'])
    const verifyArgs = db.rpc.mock.calls[1][1]
    expect(verifyArgs.p_phone_e164).toBe('+639171234567')
    expect(verifyArgs.p_expected_phone_hash).toBe(crypto.hashPhone(tenant, '+639171234567'))
    expect(verifyArgs.p_candidate_code_hash).toBe(crypto.hashCode({ tenantId: tenant, challengeId: challenge }, '012345'))
    expect(verifyArgs.p_session_token_hash).not.toBe(result.token)
  })

  it('one answer for every wrong input; a spent budget never reaches the code check', async () => {
    const { verifyLoginChallenge } = await load()
    const spent = database({ allow_loyalty_verification_attempt: [{ data: { ok: false, error: 'invalid_claim' }, error: null }] })
    expect(await verifyLoginChallenge(input, { crypto, database: spent })).toEqual({ ok: false, error: 'invalid_code' })
    expect(spent.rpc).toHaveBeenCalledTimes(1)
    const wrong = database({
      allow_loyalty_verification_attempt: [{ data: { ok: true }, error: null }],
      verify_customer_login_challenge: [{ data: { ok: false, error: 'invalid_code' }, error: null }],
    })
    expect(await verifyLoginChallenge(input, { crypto, database: wrong })).toEqual({ ok: false, error: 'invalid_code' })
    for (const bad of [{ code: '12345' }, { challengeId: 'nope' }, { phone: '+15551234567' }]) {
      const untouched = database({})
      expect(await verifyLoginChallenge({ ...input, ...bad }, { crypto, database: untouched })).toEqual({ ok: false, error: 'invalid_code' })
      expect(untouched.rpc).not.toHaveBeenCalled()
    }
  })

  it('never retries an uncertain verification', async () => {
    const { verifyLoginChallenge } = await load()
    const db = database({ allow_loyalty_verification_attempt: [{ data: { ok: true }, error: null }], verify_customer_login_challenge: [new Error('socket')] })
    expect(await verifyLoginChallenge(input, { crypto, database: db })).toEqual({ ok: false, error: 'unavailable' })
    expect(db.rpc).toHaveBeenCalledTimes(2)
  })
})

describe('openReviewSession', () => {
  it('checks the fixed code by its hash and never texts', async () => {
    const { openReviewSession } = await load()
    const db = database({ open_customer_app_review_session: [{ data: { ...{ ok: true, customerId: customer, isNewCustomer: false, name: 'Reviewer', phoneE164: '+639990000000' } }, error: null }] })
    const result = await openReviewSession({ tenantId: tenant, phone: '09990000000', code: '424242', trustedIp: ip }, { crypto, database: db })
    expect(result.ok).toBe(true)
    const args = db.rpc.mock.calls[0][1]
    expect(args.p_candidate_code_hash).toBe(crypto.hashAppReviewCode(tenant, '424242'))
    expect(args.p_phone_e164).toBe('+639990000000')
  })
})
