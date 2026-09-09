/** @jest-environment node */
jest.mock('server-only', () => ({}))
import { generateDeviceCredential, hashDeviceCredential } from '@/lib/loyalty/device-credential'

it('generates a high-entropy url-safe credential with a lowercase hex sha-256 hash', () => {
  const first = generateDeviceCredential()
  const second = generateDeviceCredential()
  expect(first.credential).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(first.credentialHash).toMatch(/^[0-9a-f]{64}$/)
  expect(first.credential).not.toBe(second.credential)
  expect(first.credentialHash).not.toBe(second.credentialHash)
})

it('re-derives the same hash from the presented credential', () => {
  const generated = generateDeviceCredential()
  expect(hashDeviceCredential(generated.credential)).toBe(generated.credentialHash)
})

it.each([
  undefined, null, 42, '', 'short', 'x'.repeat(42), 'x'.repeat(44), `${'a'.repeat(42)}+`, `${'a'.repeat(42)}=`,
])('refuses a malformed credential without hashing it: %j', (credential) => {
  expect(hashDeviceCredential(credential)).toBeNull()
})

it('does not embed the credential in its hash', () => {
  const generated = generateDeviceCredential()
  expect(generated.credentialHash).not.toContain(generated.credential.slice(0, 8))
})
