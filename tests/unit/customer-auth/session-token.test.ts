/** @jest-environment node */
export {}
jest.mock('server-only', () => ({}))

describe('customer app session tokens', () => {
  const load = async () => import('@/lib/customer-auth/session-token')

  it('mints a cs1. token with 256 bits of randomness and stores only its hash', async () => {
    const { createAppSessionToken, hashAppSessionToken } = await load()
    const a = createAppSessionToken()
    const b = createAppSessionToken()
    expect(a.token).toMatch(/^cs1\.[A-Za-z0-9_-]{43}$/)
    expect(a.token).not.toBe(b.token)
    expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(hashAppSessionToken(a.token)).toBe(a.tokenHash)
    expect(a.tokenHash).not.toContain(a.token.slice(4))
  })

  it.each([null, undefined, 42, '', 'cs1.short', 'ws1.' + 'A'.repeat(43), 'cs1.' + 'A'.repeat(42) + '!'])('refuses %p', async (token) => {
    const { hashAppSessionToken } = await load()
    expect(hashAppSessionToken(token)).toBeNull()
  })

  it('reads only a Bearer cs1 token from the Authorization header', async () => {
    const { createAppSessionToken, readBearerSession } = await load()
    const { token, tokenHash } = createAppSessionToken()
    const headers = (value: string | null) => ({ get: (name: string) => (name.toLowerCase() === 'authorization' ? value : null) })
    expect(readBearerSession(headers(`Bearer ${token}`))).toBe(tokenHash)
    expect(readBearerSession(headers(`bearer ${token}`))).toBe(tokenHash)
    expect(readBearerSession(headers(token))).toBeNull()
    expect(readBearerSession(headers(null))).toBeNull()
    expect(readBearerSession(headers('Bearer ws1.abc'))).toBeNull()
  })
})
