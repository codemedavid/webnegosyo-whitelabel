/** @jest-environment node */
jest.mock('server-only', () => ({}))
import { loadLoyaltyClaimCrypto } from '@/lib/loyalty/server-keys'

const hashKey = Buffer.alloc(32, 7).toString('base64')
const encryptionKey = Buffer.alloc(32, 9).toString('base64')

it('builds the crypto boundary from two independent base64 32-byte keys', () => {
  const crypto = loadLoyaltyClaimCrypto({ LOYALTY_HASH_KEY: hashKey, LOYALTY_ENCRYPTION_KEY: encryptionKey })
  expect(crypto).not.toBeNull()
  expect(crypto!.generateCode()).toMatch(/^[0-9]{6}$/)
})

it('accepts url-safe base64 keys', () => {
  const crypto = loadLoyaltyClaimCrypto({
    LOYALTY_HASH_KEY: Buffer.alloc(32, 250).toString('base64url'),
    LOYALTY_ENCRYPTION_KEY: Buffer.alloc(32, 251).toString('base64url'),
  })
  expect(crypto).not.toBeNull()
})

it.each([
  { name: 'missing hash key', env: { LOYALTY_ENCRYPTION_KEY: encryptionKey } },
  { name: 'missing encryption key', env: { LOYALTY_HASH_KEY: hashKey } },
  { name: 'empty key', env: { LOYALTY_HASH_KEY: '', LOYALTY_ENCRYPTION_KEY: encryptionKey } },
  { name: 'short key', env: { LOYALTY_HASH_KEY: Buffer.alloc(16, 1).toString('base64'), LOYALTY_ENCRYPTION_KEY: encryptionKey } },
  { name: 'long key', env: { LOYALTY_HASH_KEY: Buffer.alloc(33, 1).toString('base64'), LOYALTY_ENCRYPTION_KEY: encryptionKey } },
  { name: 'identical keys', env: { LOYALTY_HASH_KEY: hashKey, LOYALTY_ENCRYPTION_KEY: hashKey } },
  { name: 'not base64', env: { LOYALTY_HASH_KEY: '!!!not base64!!!', LOYALTY_ENCRYPTION_KEY: encryptionKey } },
])('fails closed on $name', ({ env }) => {
  expect(loadLoyaltyClaimCrypto(env)).toBeNull()
})
