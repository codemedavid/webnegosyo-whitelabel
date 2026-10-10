/** @jest-environment node */
jest.mock('server-only', () => ({}))
import { createLoyaltyClaimCrypto } from '@/lib/loyalty/claim-crypto'
import { issueWalletChallenge, isWalletSessionValid, verifyWalletChallenge } from '@/lib/loyalty/wallet-verification'

const tenant = '11111111-1111-1111-1111-111111111111'
const challenge = '66666666-6666-6666-6666-666666666666'
const ip = '203.0.113.9'
const crypto = createLoyaltyClaimCrypto({ hashKey: Buffer.alloc(32, 1), encryptionKey: Buffer.alloc(32, 2) })

function database(responses: Record<string, Array<{ data: unknown; error: unknown } | Error>>) {
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

describe('issueWalletChallenge', () => {
  test('derives every proof from the canonical number and sends nothing a client chose', async () => {
    const db = database({})
    db.rpc.mockImplementationOnce((_name, args) => Promise.resolve({ data: { ok: true, challengeId: args.p_challenge_id, expiresAt: '2026-10-04T00:05:00Z' }, error: null }))
    const result = await issueWalletChallenge({ tenantId: tenant, phone: '0917 123 4567', trustedIp: ip }, { crypto, database: db })
    expect(result.ok).toBe(true)
    const args = db.rpc.mock.calls[0][1]
    expect(args.p_expected_customer_key).toBe('phone:+639171234567')
    expect(args.p_phone_hash).toBe(crypto.hashPhone(tenant, '+639171234567'))
    const payload = crypto.decryptSms({ tenantId: tenant, challengeId: args.p_challenge_id as string }, args.p_payload_encrypted)
    expect(payload.phone).toBe('+639171234567')
    expect(args.p_code_hash).toBe(crypto.hashCode({ tenantId: tenant, challengeId: args.p_challenge_id as string }, payload.code))
  })

  test('retries an uncertain commit with the identical arguments', async () => {
    const db = database({})
    db.rpc
      .mockImplementationOnce(() => Promise.reject(new Error('socket')))
      .mockImplementationOnce((_name, args) => Promise.resolve({ data: { ok: true, challengeId: args.p_challenge_id, expiresAt: 'x' }, error: null }))
    const result = await issueWalletChallenge({ tenantId: tenant, phone: '09171234567', trustedIp: ip }, { crypto, database: db })
    expect(result.ok).toBe(true)
    expect(db.rpc.mock.calls[1][1]).toEqual(db.rpc.mock.calls[0][1])
  })

  test('passes a refusal through and never calls with a non-PH number', async () => {
    const db = database({ issue_loyalty_wallet_challenge: [{ data: { ok: false, error: 'request_denied' }, error: null }] })
    expect(await issueWalletChallenge({ tenantId: tenant, phone: '09171234567', trustedIp: ip }, { crypto, database: db }))
      .toEqual({ ok: false, error: 'request_denied' })
    const untouched = database({})
    expect(await issueWalletChallenge({ tenantId: tenant, phone: '+15551234567', trustedIp: ip }, { crypto, database: untouched }))
      .toEqual({ ok: false, error: 'request_denied' })
    expect(untouched.rpc).not.toHaveBeenCalled()
  })

  test('a rate limit comes back with how long to wait, so the page can say so', async () => {
    const db = database({ issue_loyalty_wallet_challenge: [{ data: { ok: false, error: 'rate_limited', retryAfterSeconds: 412 }, error: null }] })
    expect(await issueWalletChallenge({ tenantId: tenant, phone: '09171234567', trustedIp: ip }, { crypto, database: db }))
      .toEqual({ ok: false, error: 'rate_limited', retryAfterSeconds: 412 })
  })

  test('a rate limit with a missing or absurd wait is clamped to something sane', async () => {
    for (const [given, expected] of [[undefined, 60], [-5, 1], [12.2, 13], [999999, 86400]] as const) {
      const db = database({ issue_loyalty_wallet_challenge: [{ data: { ok: false, error: 'rate_limited', retryAfterSeconds: given }, error: null }] })
      expect(await issueWalletChallenge({ tenantId: tenant, phone: '09171234567', trustedIp: ip }, { crypto, database: db }))
        .toEqual({ ok: false, error: 'rate_limited', retryAfterSeconds: expected })
    }
  })

  test('a reply for another challenge is not trusted', async () => {
    const db = database({ issue_loyalty_wallet_challenge: [{ data: { ok: true, challengeId: challenge, expiresAt: 'x' }, error: null }] })
    expect(await issueWalletChallenge({ tenantId: tenant, phone: '09171234567', trustedIp: ip }, { crypto, database: db }))
      .toEqual({ ok: false, error: 'unavailable' })
  })
})

describe('verifyWalletChallenge', () => {
  const input = { tenantId: tenant, challengeId: challenge, phone: '09171234567', code: '012345', trustedIp: ip }

  test('spends the attempt budget first, then trades the code for a signed session', async () => {
    const db = database({
      allow_loyalty_verification_attempt: [{ data: { ok: true }, error: null }],
      verify_loyalty_wallet_challenge: [{ data: { ok: true, expiresAt: '2026-10-04T00:30:00Z' }, error: null }],
    })
    const result = await verifyWalletChallenge(input, { crypto, database: db })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(db.rpc.mock.calls.map(call => call[0])).toEqual(['allow_loyalty_verification_attempt', 'verify_loyalty_wallet_challenge'])
    const proof = crypto.verificationProof({ tenantId: tenant, challengeId: challenge }, '+639171234567', '012345')
    expect(db.rpc.mock.calls[1][1]).toEqual({
      p_tenant_id: tenant, p_challenge_id: challenge, p_candidate_code_hash: proof.codeHash,
      p_session_token_hash: crypto.resolveWalletSession(tenant, result.token), p_expected_phone_hash: proof.phoneHash,
    })
  })

  test('an exhausted budget never reaches the challenge', async () => {
    const db = database({ allow_loyalty_verification_attempt: [{ data: { ok: false, error: 'invalid_claim' }, error: null }] })
    expect(await verifyWalletChallenge(input, { crypto, database: db })).toEqual({ ok: false, error: 'invalid_code' })
    expect(db.rpc).toHaveBeenCalledTimes(1)
  })

  test('a wrong code and an outage read differently', async () => {
    const wrong = database({
      allow_loyalty_verification_attempt: [{ data: { ok: true }, error: null }],
      verify_loyalty_wallet_challenge: [{ data: { ok: false, error: 'invalid_code' }, error: null }],
    })
    expect(await verifyWalletChallenge(input, { crypto, database: wrong })).toEqual({ ok: false, error: 'invalid_code' })
    const down = database({
      allow_loyalty_verification_attempt: [{ data: { ok: true }, error: null }],
      verify_loyalty_wallet_challenge: [new Error('socket')],
    })
    expect(await verifyWalletChallenge(input, { crypto, database: down })).toEqual({ ok: false, error: 'unavailable' })
    expect(down.rpc).toHaveBeenCalledTimes(2)
  })

  test('malformed input never touches the database', async () => {
    const db = database({})
    expect(await verifyWalletChallenge({ ...input, code: '12345' }, { crypto, database: db })).toEqual({ ok: false, error: 'invalid_code' })
    expect(db.rpc).not.toHaveBeenCalled()
  })
})

describe('isWalletSessionValid', () => {
  test('asks the database only about a correctly signed token, bound to the number', async () => {
    const { token, tokenHash } = crypto.createWalletSession(tenant)
    const db = database({ loyalty_wallet_session_valid: [{ data: true, error: null }] })
    expect(await isWalletSessionValid({ tenantId: tenant, phone: '09171234567', token }, { crypto, database: db })).toBe(true)
    expect(db.rpc).toHaveBeenCalledWith('loyalty_wallet_session_valid', {
      p_tenant_id: tenant, p_token_hash: tokenHash, p_phone_hash: crypto.hashPhone(tenant, '+639171234567'),
    })
  })

  test('forged or missing tokens are refused without a query; outages are reported as unknown', async () => {
    const db = database({})
    expect(await isWalletSessionValid({ tenantId: tenant, phone: '09171234567', token: undefined }, { crypto, database: db })).toBe(false)
    expect(await isWalletSessionValid({ tenantId: tenant, phone: '09171234567', token: crypto.createClaim(tenant).token }, { crypto, database: db })).toBe(false)
    expect(db.rpc).not.toHaveBeenCalled()
    const down = database({ loyalty_wallet_session_valid: [{ data: null, error: { message: 'x' } }] })
    expect(await isWalletSessionValid({ tenantId: tenant, phone: '09171234567', token: crypto.createWalletSession(tenant).token }, { crypto, database: down })).toBeNull()
  })
})
