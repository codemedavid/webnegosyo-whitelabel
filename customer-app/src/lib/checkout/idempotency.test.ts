import { attemptAfterFailure, attemptFor, isValidIdempotencyKey, mintIdempotencyKey } from './idempotency'

describe('mintIdempotencyKey', () => {
  it('uses Web Crypto when the runtime has it', () => {
    const getRandomValues = (bytes: Uint8Array) => bytes.fill(0xab)
    expect(mintIdempotencyKey({ getRandomValues })).toBe(`app-${'ab'.repeat(16)}`)
  })

  it('falls back to the native UUID that every Expo build installs', () => {
    expect(mintIdempotencyKey({ uuidv4: () => '1B4E28BA-2FA1-11D2-883F-0016D3CCA427' })).toBe('app-1b4e28ba2fa111d2883f0016d3cca427')
  })

  it('always produces a key the order route accepts, and a different one each time', () => {
    const keys = [mintIdempotencyKey(), mintIdempotencyKey({}), mintIdempotencyKey({ uuidv4: () => 'a-b-c-d-e-f-0123456789' })]
    keys.forEach((key) => expect(isValidIdempotencyKey(key)).toBe(true))
    expect(new Set([mintIdempotencyKey({}), mintIdempotencyKey({})]).size).toBe(2)
  })
})

describe('isValidIdempotencyKey', () => {
  it('takes 8–100 printable ASCII characters only', () => {
    expect(isValidIdempotencyKey('abcdefgh')).toBe(true)
    expect(isValidIdempotencyKey('abcdefg')).toBe(false)
    expect(isValidIdempotencyKey('a'.repeat(101))).toBe(false)
    expect(isValidIdempotencyKey('abc defgh')).toBe(false)
    expect(isValidIdempotencyKey('abcdéfgh')).toBe(false)
  })
})

describe('checkout attempt lifecycle', () => {
  let counter = 0
  const mint = () => `key-${String((counter += 1)).padStart(4, '0')}`

  it('mints a key for the first attempt and reuses it when the same bag is retried', () => {
    const first = attemptFor(null, 'bag-A', mint)
    expect(first).toEqual({ key: expect.stringMatching(/^key-/), fingerprint: 'bag-A' })
    expect(attemptFor(first, 'bag-A', mint)).toBe(first)
  })

  it('mints a new key once anything that would be sent changed', () => {
    const first = attemptFor(null, 'bag-A', mint)
    const changed = attemptFor(first, 'bag-B', mint)
    expect(changed.key).not.toBe(first.key)
    expect(changed.fingerprint).toBe('bag-B')
  })

  it('drops the key after a refusal (nothing was placed) and keeps it when the outcome is unknown', () => {
    const attempt = attemptFor(null, 'bag-A', mint)
    expect(attemptAfterFailure(attempt, 'refused')).toBeNull()
    for (const code of ['conflict', 'unavailable', 'internal', 'rate_limited', null] as const) expect(attemptAfterFailure(attempt, code)).toBe(attempt)
  })

  it('replaces a held key that is not a valid key any more', () => {
    expect(attemptFor({ key: 'short', fingerprint: 'bag-A' }, 'bag-A', mint).key).not.toBe('short')
  })
})
