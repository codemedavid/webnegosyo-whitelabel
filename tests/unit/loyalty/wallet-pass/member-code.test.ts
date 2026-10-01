import {
  createPassSerial,
  encodeMemberCode,
  parseMemberCode,
} from '@/lib/loyalty/wallet-pass/member-code'
import {
  deriveAppleAuthToken,
  readApplePassAuthorization,
  verifyAppleAuthToken,
  verifySyncSecret,
} from '@/lib/loyalty/wallet-pass/auth-token'

const SECRET = Buffer.alloc(32, 7)

describe('pass serial + member code', () => {
  test('a serial is 24 url-safe characters from 18 random bytes', () => {
    const serial = createPassSerial(() => Buffer.alloc(18, 255))
    expect(serial).toBe('_'.repeat(24))
    expect(createPassSerial()).toMatch(/^[A-Za-z0-9_-]{24}$/)
  })

  test('two serials never collide in practice', () => {
    expect(createPassSerial()).not.toBe(createPassSerial())
  })

  test('the member code round-trips through the QR payload', () => {
    const serial = createPassSerial()
    expect(parseMemberCode(encodeMemberCode(serial))).toBe(serial)
  })

  test('scanner whitespace is tolerated', () => {
    const serial = createPassSerial()
    expect(parseMemberCode(`  ${encodeMemberCode(serial)}\n`)).toBe(serial)
  })

  test.each([
    ['empty', ''],
    ['a phone number', '+639171234567'],
    ['a claim token', `v1.${'a'.repeat(43)}.${'f'.repeat(64)}`],
    ['wrong version', `WNLC2.${'a'.repeat(24)}`],
    ['short serial', 'WNLC1.abc'],
    ['bad characters', `WNLC1.${'a'.repeat(23)}!`],
    ['not a string', 42],
  ])('rejects %s', (_label, raw) => {
    expect(parseMemberCode(raw)).toBeNull()
  })
})

describe('Apple authentication token', () => {
  test('is derived, so a pass can be rebuilt without storing the token', () => {
    const serial = createPassSerial()
    expect(deriveAppleAuthToken(SECRET, serial)).toBe(deriveAppleAuthToken(SECRET, serial))
    expect(deriveAppleAuthToken(SECRET, serial)).toMatch(/^[a-f0-9]{64}$/)
  })

  test('differs per serial and per secret', () => {
    const serial = createPassSerial()
    expect(deriveAppleAuthToken(SECRET, serial)).not.toBe(deriveAppleAuthToken(SECRET, createPassSerial()))
    expect(deriveAppleAuthToken(SECRET, serial)).not.toBe(deriveAppleAuthToken(Buffer.alloc(32, 8), serial))
  })

  test('verifies only the exact token for that serial', () => {
    const serial = createPassSerial()
    const token = deriveAppleAuthToken(SECRET, serial)
    expect(verifyAppleAuthToken(SECRET, serial, token)).toBe(true)
    expect(verifyAppleAuthToken(SECRET, createPassSerial(), token)).toBe(false)
    expect(verifyAppleAuthToken(SECRET, serial, token.slice(0, -1))).toBe(false)
    expect(verifyAppleAuthToken(SECRET, serial, null)).toBe(false)
  })

  test('reads the ApplePass authorization scheme only', () => {
    expect(readApplePassAuthorization('ApplePass abc123')).toBe('abc123')
    expect(readApplePassAuthorization('Bearer abc123')).toBeNull()
    expect(readApplePassAuthorization(null)).toBeNull()
    expect(readApplePassAuthorization('ApplePass ')).toBeNull()
  })
})

describe('sync secret', () => {
  const secret = 's'.repeat(40)

  test('accepts only the configured value', () => {
    expect(verifySyncSecret(secret, secret)).toBe(true)
    expect(verifySyncSecret(secret, `${secret}x`)).toBe(false)
    expect(verifySyncSecret(secret, null)).toBe(false)
  })

  test('fails closed when the server has no (or a weak) secret', () => {
    expect(verifySyncSecret(undefined, 'anything')).toBe(false)
    expect(verifySyncSecret('short', 'short')).toBe(false)
  })
})
