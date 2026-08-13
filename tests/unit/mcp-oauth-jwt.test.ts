import { describe, it, expect } from '@jest/globals'
import { signAccessToken, verifyAccessToken } from '@/lib/mcp/oauth-jwt'

const SECRET = 'test-secret-please-change-0123456789'
const RESOURCE = 'https://x.example.com/api/mcp/mcp'
const claims = { sub: 'user_1', scope: 'superadmin', client_id: 'client_abc', aud: RESOURCE }

describe('signAccessToken / verifyAccessToken', () => {
  it('round-trips claims and stamps iat/exp from the injected clock', () => {
    const nowMs = 1_700_000_000_000
    const token = signAccessToken(claims, { secret: SECRET, expiresInSeconds: 3600, now: nowMs })

    const decoded = verifyAccessToken(token, { secret: SECRET, now: nowMs, audience: RESOURCE })

    expect(decoded).toMatchObject(claims)
    expect(decoded.iat).toBe(Math.floor(nowMs / 1000))
    expect(decoded.exp).toBe(Math.floor(nowMs / 1000) + 3600)
  })

  it('produces a compact three-segment JWT', () => {
    const token = signAccessToken(claims, { secret: SECRET, expiresInSeconds: 60, now: 1_700_000_000_000 })
    expect(token.split('.')).toHaveLength(3)
  })

  it('rejects a token whose signature was tampered with', () => {
    const token = signAccessToken(claims, { secret: SECRET, expiresInSeconds: 60, now: 1_700_000_000_000 })
    const [h, p] = token.split('.')
    const forged = `${h}.${p}.deadbeef`
    expect(() => verifyAccessToken(forged, { secret: SECRET, now: 1_700_000_000_000 })).toThrow(/signature/i)
  })

  it('rejects a token whose payload was modified', () => {
    const token = signAccessToken(claims, { secret: SECRET, expiresInSeconds: 60, now: 1_700_000_000_000 })
    const [h, , s] = token.split('.')
    const evilPayload = Buffer.from(JSON.stringify({ ...claims, scope: 'root', iat: 1, exp: 9_999_999_999 })).toString('base64url')
    expect(() => verifyAccessToken(`${h}.${evilPayload}.${s}`, { secret: SECRET, now: 1_700_000_000_000 })).toThrow(/signature/i)
  })

  it('rejects a token signed with a different secret', () => {
    const token = signAccessToken(claims, { secret: SECRET, expiresInSeconds: 60, now: 1_700_000_000_000 })
    expect(() => verifyAccessToken(token, { secret: 'other-secret', now: 1_700_000_000_000 })).toThrow(/signature/i)
  })

  it('rejects an expired token', () => {
    const nowMs = 1_700_000_000_000
    const token = signAccessToken(claims, { secret: SECRET, expiresInSeconds: 60, now: nowMs })
    // 61 seconds later
    expect(() => verifyAccessToken(token, { secret: SECRET, now: nowMs + 61_000, audience: RESOURCE })).toThrow(/expired/i)
  })

  it('rejects a token issued for another MCP resource', () => {
    const token = signAccessToken(claims, { secret: SECRET, expiresInSeconds: 60, now: 1_700_000_000_000 })
    expect(() =>
      verifyAccessToken(token, {
        secret: SECRET,
        now: 1_700_000_000_000,
        audience: 'https://other.example.com/api/mcp/mcp',
      }),
    ).toThrow(/audience/i)
  })

  it('rejects a malformed token', () => {
    expect(() => verifyAccessToken('not-a-jwt', { secret: SECRET, now: 1 })).toThrow()
  })
})
