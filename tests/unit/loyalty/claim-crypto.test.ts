/** @jest-environment node */
jest.mock('server-only', () => ({}))
import { createLoyaltyClaimCrypto } from '@/lib/loyalty/claim-crypto'

const tenant = '11111111-1111-1111-1111-111111111111'
const challenge = '22222222-2222-2222-2222-222222222222'
const context = { tenantId: tenant, challengeId: challenge }
const keys = { hashKey: Buffer.alloc(32, 1), encryptionKey: Buffer.alloc(32, 2) }

test('OTP hashes are repeatable only for the same tenant, challenge and code', () => {
  const crypto = createLoyaltyClaimCrypto(keys)
  const hash = crypto.hashCode(context, '012345')
  expect(hash).toMatch(/^[a-f0-9]{64}$/)
  expect(crypto.hashCode(context, '012345')).toBe(hash)
  expect(crypto.hashCode(context, '012346')).not.toBe(hash)
  expect(crypto.hashCode({ ...context, tenantId: challenge }, '012345')).not.toBe(hash)
  expect(crypto.hashCode({ ...context, challengeId: tenant }, '012345')).not.toBe(hash)
})

test('rejects weak/reused keys, noncanonical identities, and malformed codes', () => {
  expect(() => createLoyaltyClaimCrypto({ ...keys, hashKey: Buffer.alloc(16) })).toThrow()
  expect(() => createLoyaltyClaimCrypto({ ...keys, encryptionKey: keys.hashKey })).toThrow()
  const crypto = createLoyaltyClaimCrypto(keys)
  for (const code of ['12345', '1234567', 'abcdef', '123456\n']) {
    expect(() => crypto.hashCode(context, code)).toThrow()
  }
  expect(() => crypto.hashCode({ ...context, tenantId: 'bad' }, '123456')).toThrow()
  expect(() => crypto.hashPhone(tenant, '09171234567')).toThrow()
  expect(crypto.hashPhone(tenant, '+639171234567')).toMatch(/^[a-f0-9]{64}$/)
  expect(crypto.hashPhone(tenant, '+639171234567')).not.toBe(crypto.hashPhone(challenge, '+639171234567'))
})

test('issues unpredictable signed opaque claims scoped to one tenant', () => {
  const crypto = createLoyaltyClaimCrypto(keys)
  const claim = crypto.createClaim(tenant)
  expect(claim.token).toMatch(/^v1\.[A-Za-z0-9_-]{43}\.[a-f0-9]{64}$/)
  expect(claim.token).not.toContain(tenant)
  expect(claim.tokenHash).toMatch(/^[a-f0-9]{64}$/)
  expect(crypto.resolveClaim(tenant, claim.token)).toBe(claim.tokenHash)
  expect(crypto.createClaim(tenant).token).not.toBe(claim.token)
  expect(crypto.resolveClaim(challenge, claim.token)).toBeNull()
  expect(crypto.resolveClaim(tenant, claim.token + 'a')).toBeNull()
  expect(crypto.resolveClaim(tenant, claim.token.replace('v1.', 'v2.'))).toBeNull()
  expect(crypto.resolveClaim(tenant, 'garbage')).toBeNull()
  const tampered = claim.token.slice(0, -1) + (claim.token.endsWith('0') ? '1' : '0')
  expect(crypto.resolveClaim(tenant, tampered)).toBeNull()
  expect(crypto.generateCode()).toMatch(/^[0-9]{6}$/)
})

test('encrypted SMS payloads round-trip only in the original challenge context', () => {
  const crypto = createLoyaltyClaimCrypto(keys)
  const payload = { phone: '+639171234567', code: '012345' }
  const encrypted = crypto.encryptSms(context, payload)
  expect(encrypted).not.toContain(payload.phone)
  expect(encrypted).not.toContain(payload.code)
  expect(crypto.decryptSms(context, encrypted)).toEqual(payload)
  expect(crypto.encryptSms(context, payload)).not.toBe(encrypted)
  expect(() => crypto.decryptSms({ ...context, tenantId: challenge }, encrypted)).toThrow('Invalid loyalty SMS payload')
  expect(() => crypto.decryptSms({ ...context, challengeId: tenant }, encrypted)).toThrow('Invalid loyalty SMS payload')
  expect(() => crypto.decryptSms(context, encrypted.slice(0, -3) + 'aaa')).toThrow('Invalid loyalty SMS payload')
  expect(() => crypto.decryptSms(context, 'a'.repeat(4097))).toThrow('Invalid loyalty SMS payload')
  const other = createLoyaltyClaimCrypto({ ...keys, encryptionKey: Buffer.alloc(32, 3) })
  expect(() => other.decryptSms(context, encrypted)).toThrow('Invalid loyalty SMS payload')
})

test('rejects alternate encodings of identities and authenticated SMS envelopes', () => {
  const crypto = createLoyaltyClaimCrypto(keys)
  expect(() => crypto.hashCode({ ...context, tenantId: tenant + '\n' }, '123456')).toThrow()
  const encrypted = crypto.encryptSms(context, { phone: '+639171234567', code: '012345' })
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const last = alphabet.indexOf(encrypted.at(-1)!)
  const alias = encrypted.slice(0, -1) + alphabet[last + 1]
  expect(() => crypto.decryptSms(context, alias)).toThrow('Invalid loyalty SMS payload')
})

test('derives the verification identity and keyed proof from the same canonical phone', () => {
  const crypto = createLoyaltyClaimCrypto(keys)
  const proof = crypto.verificationProof(context, '+639171234567', '012345')
  expect(proof).toEqual({
    customerKey: 'phone:+639171234567',
    phoneHash: crypto.hashPhone(tenant, '+639171234567'),
    codeHash: crypto.hashCode(context, '012345'),
  })
  expect(() => crypto.verificationProof(context, '09171234567', '012345')).toThrow()
})

test('IP rate-limit hashes normalize equivalent addresses without storing the address', () => {
  const crypto = createLoyaltyClaimCrypto(keys)
  const hash = crypto.hashIp('192.0.2.1')
  expect(hash).toMatch(/^[a-f0-9]{64}$/)
  expect(crypto.hashIp('::ffff:192.0.2.1')).toBe(hash)
  expect(crypto.hashIp('::FFFF:c000:201')).toBe(hash)
  expect(crypto.hashIp('2001:db8::1')).toBe(crypto.hashIp('2001:0DB8:0000:0000:0000:0000:0000:0001'))
  for (const ip of ['', 'unknown', '192.0.2.1, 192.0.2.2', '192.0.2.1:80', 'fe80::1%eth0']) {
    expect(() => crypto.hashIp(ip)).toThrow()
  }
})
