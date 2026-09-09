/** @jest-environment node */
jest.mock('server-only', () => ({}))
import { createLoyaltyClaimCrypto } from '@/lib/loyalty/claim-crypto'
import { issueLoyaltyChallenge, type ChallengeIssueArguments } from '@/lib/loyalty/challenge-issuer'

const tenant = '11111111-1111-1111-1111-111111111111'
const reward = '22222222-2222-2222-2222-222222222222'
const crypto = createLoyaltyClaimCrypto({ hashKey: Buffer.alloc(32, 1), encryptionKey: Buffer.alloc(32, 2) })
const input = { tenantId: tenant, entitlementId: reward, phone: '0917 123 4567', trustedIp: '192.0.2.1' }

test('issues a server-generated challenge and encrypted SMS through the atomic RPC', async () => {
  let recorded: ChallengeIssueArguments | undefined
  const database = { rpc: jest.fn(async (_name: string, args: ChallengeIssueArguments) => {
    recorded = args
    return { error: null, data: { ok: true, challengeId: args.p_challenge_id, expiresAt: '2026-09-08T12:05:00Z' } }
  }) }
  const result = await issueLoyaltyChallenge(input, { crypto, database })
  expect(result).toEqual({ ok: true, challengeId: recorded!.p_challenge_id, expiresAt: '2026-09-08T12:05:00Z' })
  const args = recorded!
  const context = { tenantId: tenant, challengeId: args.p_challenge_id }
  const sms = crypto.decryptSms(context, args.p_payload_encrypted)
  expect(sms.phone).toBe('+639171234567')
  expect(sms.code).toMatch(/^[0-9]{6}$/)
  expect(args.p_code_hash).toBe(crypto.hashCode(context, sms.code))
  expect(args.p_phone_hash).toBe(crypto.hashPhone(tenant, sms.phone))
  expect(args.p_ip_hash).toBe(crypto.hashIp(input.trustedIp))
  expect(args.p_expected_customer_key).toBe('phone:+639171234567')
  expect(args.p_entitlement_id).toBe(reward)
  expect(database.rpc).toHaveBeenCalledWith('issue_loyalty_challenge', args)
  expect(Object.keys(result).sort()).toEqual(['challengeId', 'expiresAt', 'ok'])
})

test.each([
  { phone: 'letters09171234567' }, { phone: '' }, { phone: 'x'.repeat(1000) },
  { tenantId: 'invalid' }, { entitlementId: 'invalid' }, { trustedIp: 'unknown' },
])('rejects malformed inputs before contacting storage %#', async patch => {
  const database = { rpc: jest.fn() }
  await expect(issueLoyaltyChallenge({ ...input, ...patch }, { crypto, database })).resolves.toEqual({ ok: false, error: 'request_denied' })
  expect(database.rpc).not.toHaveBeenCalled()
})

test('a lost acknowledgement retries the identical encrypted request, never another code', async () => {
  const database = { rpc: jest.fn()
    .mockRejectedValueOnce(new Error('lost acknowledgement'))
    .mockImplementationOnce(async (_name: string, args: ChallengeIssueArguments) => ({
      error: null, data: { ok: true, challengeId: args.p_challenge_id, expiresAt: '2026-09-08T12:05:00Z' },
    })) }
  const result = await issueLoyaltyChallenge(input, { crypto, database })
  expect(result.ok).toBe(true)
  expect(database.rpc).toHaveBeenCalledTimes(2)
  expect(database.rpc.mock.calls[1]).toEqual(database.rpc.mock.calls[0])
})

test.each([
  null, {}, { ok: true, challengeId: reward, expiresAt: '2026-09-08T12:05:00Z' },
  { ok: false, error: 'database detail and secrets' },
])('refuses malformed or mismatched database responses %#', async data => {
  const database = { rpc: jest.fn(async () => ({ data, error: null })) }
  expect(await issueLoyaltyChallenge(input, { crypto, database })).toEqual({ ok: false, error: 'unavailable' })
})

test('business denial is generic and is not retried', async () => {
  const database = { rpc: jest.fn(async () => ({ data: { ok: false, error: 'request_denied', privateDetail: 'hidden' }, error: null })) }
  expect(await issueLoyaltyChallenge(input, { crypto, database })).toEqual({ ok: false, error: 'request_denied' })
  expect(database.rpc).toHaveBeenCalledTimes(1)
})

test('repeated storage failure stops after two identical attempts and hides error details', async () => {
  const database = { rpc: jest.fn(async () => ({ data: null, error: { message: 'private database information' } })) }
  expect(await issueLoyaltyChallenge(input, { crypto, database })).toEqual({ ok: false, error: 'unavailable' })
  expect(database.rpc).toHaveBeenCalledTimes(2)
  expect(database.rpc.mock.calls[1]).toEqual(database.rpc.mock.calls[0])
})

test('rejects client-supplied code and hashes instead of forwarding them', async () => {
  const database = { rpc: jest.fn() }
  const malicious = { ...input, code: '123456', phoneHash: 'a'.repeat(64) }
  expect(await issueLoyaltyChallenge(malicious, { crypto, database })).toEqual({ ok: false, error: 'request_denied' })
  expect(database.rpc).not.toHaveBeenCalled()
})

test('unavailable cryptographic generation fails without exposing errors or writing a job', async () => {
  const database = { rpc: jest.fn() }
  const unavailableCrypto = { ...crypto, generateCode() { throw new Error('private entropy failure') } }
  await expect(issueLoyaltyChallenge(input, { crypto: unavailableCrypto, database })).resolves.toEqual({ ok: false, error: 'unavailable' })
  expect(database.rpc).not.toHaveBeenCalled()
})
