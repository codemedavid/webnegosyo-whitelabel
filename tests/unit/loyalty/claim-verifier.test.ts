/** @jest-environment node */
jest.mock('server-only', () => ({}))
import { createLoyaltyClaimCrypto } from '@/lib/loyalty/claim-crypto'
import { verifyLoyaltyChallenge } from '@/lib/loyalty/claim-verifier'

const tenant = 'AAAAAAAA-1111-1111-1111-111111111111'
const challenge = 'BBBBBBBB-2222-2222-2222-222222222222'
const claimId = 'cccccccc-3333-3333-3333-333333333333'
const now = () => Date.parse('2026-09-10T12:00:00Z')
const expiresAt = '2026-09-10T12:02:00Z'
const crypto = createLoyaltyClaimCrypto({ hashKey: Buffer.alloc(32, 1), encryptionKey: Buffer.alloc(32, 2) })
const input = { tenantId: tenant, challengeId: challenge, phone: '0917 123 4567', code: '012345', trustedIp: '192.0.2.1' }
const allowed = { data: { ok: true }, error: null }
const verified = { data: { ok: true, claimId, expiresAt }, error: null }
const invalid = { ok: false, error: 'invalid_claim' }
const unavailable = { ok: false, error: 'unavailable' }

test('commits a rate attempt before verification and returns only a server-generated claim token and expiry', async () => {
  const database = { rpc: jest.fn().mockResolvedValueOnce(allowed).mockResolvedValueOnce(verified) }
  const result = await verifyLoyaltyChallenge(input, { crypto, database, now })
  expect(result).toEqual({ ok: true, token: expect.any(String), expiresAt })
  if (!result.ok) throw new Error('Expected success')
  const proof = crypto.verificationProof({ tenantId: tenant.toLowerCase(), challengeId: challenge.toLowerCase() }, '+639171234567', input.code)
  expect(database.rpc.mock.calls).toEqual([
    ['allow_loyalty_verification_attempt', { p_tenant_id: tenant.toLowerCase(), p_phone_hash: proof.phoneHash, p_ip_hash: crypto.hashIp(input.trustedIp) }],
    ['verify_loyalty_claim', { p_tenant_id: tenant.toLowerCase(), p_challenge_id: challenge.toLowerCase(), p_candidate_code_hash: proof.codeHash, p_claim_token_hash: crypto.resolveClaim(tenant, result.token), p_expected_customer_key: proof.customerKey, p_expected_phone_hash: proof.phoneHash }],
  ])
})

test.each([
  { tenantId: 'invalid' }, { challengeId: 'invalid' }, { tenantId: tenant + '\n' },
  { phone: 'letters09171234567' }, { phone: '' }, { phone: '+12025550123' },
  { phone: '0917\n1234567' }, { phone: '0'.repeat(65) },
  { code: '12345' }, { code: '1234567' }, { code: ' 12345' }, { code: '１２３４５６' },
  { code: '123456\n' }, { trustedIp: 'unknown' }, { trustedIp: '192.0.2.1, 192.0.2.2' },
  { trustedIp: 'fe80::1%en0' }, { phoneHash: 'a'.repeat(64) }, { customerKey: 'phone:+639999999999' },
])('rejects malformed inputs and client-supplied proofs before storage %#', async patch => {
  const database = { rpc: jest.fn() }
  expect(await verifyLoyaltyChallenge({ ...input, ...patch }, { crypto, database, now })).toEqual(invalid)
  expect(database.rpc).not.toHaveBeenCalled()
})

test.each([null, {}, [], { ok: true, ignored: true }, { ok: false, error: 'private details' }, { ok: false, error: 'invalid_claim', secret: 'hidden' }])('refuses malformed limiter responses without trying verification %#', async data => {
  const database = { rpc: jest.fn().mockResolvedValue({ data, error: null }) }
  expect(await verifyLoyaltyChallenge(input, { crypto, database, now })).toEqual(unavailable)
  expect(database.rpc).toHaveBeenCalledTimes(1)
})

test('a quota denial never verifies or creates a token', async () => {
  const database = { rpc: jest.fn().mockResolvedValue({ data: invalid, error: null }) }
  const createClaim = jest.fn(crypto.createClaim)
  expect(await verifyLoyaltyChallenge(input, { crypto: { ...crypto, createClaim }, database, now })).toEqual(invalid)
  expect(database.rpc).toHaveBeenCalledTimes(1)
  expect(createClaim).not.toHaveBeenCalled()
})

test.each(['limiter', 'verification'])('does not retry %s on an uncertain commit', async stage => {
  const database = { rpc: jest.fn() }
  if (stage === 'verification') database.rpc.mockResolvedValueOnce(allowed)
  database.rpc.mockRejectedValueOnce(new Error('private network failure'))
  expect(await verifyLoyaltyChallenge(input, { crypto, database, now })).toEqual(unavailable)
  expect(database.rpc).toHaveBeenCalledTimes(stage === 'verification' ? 2 : 1)
})

test.each(['limiter', 'verification'])('does not trust data accompanying a %s storage error or retry it', async stage => {
  const database = { rpc: jest.fn() }
  if (stage === 'verification') database.rpc.mockResolvedValueOnce(allowed)
  database.rpc.mockResolvedValueOnce({ data: stage === 'verification' ? verified.data : allowed.data, error: { message: 'private failure' } })
  expect(await verifyLoyaltyChallenge(input, { crypto, database, now })).toEqual(unavailable)
  expect(database.rpc).toHaveBeenCalledTimes(stage === 'verification' ? 2 : 1)
})

test.each([
  null, {}, [], { ok: true, expiresAt }, { ok: true, claimId: 'invalid', expiresAt },
  { ok: true, claimId, expiresAt, token: 'untrusted' }, { ok: false, error: 'private details' },
  ...['2026-09-10T12:00:00Z', '2026-09-10T11:59:59Z', '2026-09-10T12:02:00.001Z', 'not a date', '2026-09-10T12:01:00'].map(expiry => ({ ok: true, claimId, expiresAt: expiry })),
])('never exposes a token for malformed verification or invalid expiry %#', async data => {
  const database = { rpc: jest.fn().mockResolvedValueOnce(allowed).mockResolvedValueOnce({ data, error: null }) }
  expect(await verifyLoyaltyChallenge(input, { crypto, database, now })).toEqual(unavailable)
  expect(database.rpc).toHaveBeenCalledTimes(2)
})

test('business rejection is generic and not retried', async () => {
  const database = { rpc: jest.fn().mockResolvedValueOnce(allowed).mockResolvedValueOnce({ data: invalid, error: null }) }
  expect(await verifyLoyaltyChallenge(input, { crypto, database, now })).toEqual(invalid)
  expect(database.rpc).toHaveBeenCalledTimes(2)
})

test('canonical phone and equivalent IPv6 addresses produce identical rate identities', async () => {
  const database = { rpc: jest.fn().mockResolvedValue({ data: invalid, error: null }) }
  await verifyLoyaltyChallenge({ ...input, trustedIp: '::ffff:c000:201' }, { crypto, database, now })
  await verifyLoyaltyChallenge({ ...input, phone: '(+63) 917-123-4567' }, { crypto, database, now })
  expect(database.rpc.mock.calls[0]).toEqual(database.rpc.mock.calls[1])
})

test('claim generation failures preserve the committed rate attempt and hide cryptographic details', async () => {
  const database = { rpc: jest.fn().mockResolvedValueOnce(allowed) }
  const brokenCrypto = { ...crypto, createClaim() { throw new Error('private entropy failure') } }
  expect(await verifyLoyaltyChallenge(input, { crypto: brokenCrypto, database, now })).toEqual(unavailable)
  expect(database.rpc).toHaveBeenCalledTimes(1)
})
