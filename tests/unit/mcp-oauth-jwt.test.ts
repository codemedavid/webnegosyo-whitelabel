import { describe, it, expect } from '@jest/globals'
import { createHmac, createPublicKey, verify as nodeVerify } from 'crypto'
import {
  MCP_JWT_ALG,
  MCP_JWT_KID,
  publicJwkFromSecret,
  signAccessToken,
  signHs256AccessToken,
  verifyAccessToken,
} from '@/lib/mcp/oauth-jwt'

const SECRET = 'test-secret-please-change-0123456789'
const RESOURCE = 'https://x.example.com/api/mcp/mcp'
const ISSUER = 'https://x.example.com'
const claims = {
  sub: 'user_1',
  scope: 'superadmin',
  client_id: 'client_abc',
  aud: RESOURCE,
  iss: ISSUER,
}

describe('signAccessToken / verifyAccessToken', () => {
  it('round-trips claims and stamps iat/exp from the injected clock', () => {
    const nowMs = 1_700_000_000_000
    const token = signAccessToken(claims, { secret: SECRET, expiresInSeconds: 3600, now: nowMs })

    const decoded = verifyAccessToken(token, { secret: SECRET, now: nowMs, audience: RESOURCE, issuer: ISSUER })

    expect(decoded).toMatchObject(claims)
    expect(decoded.iat).toBe(Math.floor(nowMs / 1000))
    expect(decoded.exp).toBe(Math.floor(nowMs / 1000) + 3600)
    expect(token.split('.')).toHaveLength(3)
  })

  it('mints an EdDSA token whose signature verifies with the published JWK alone', () => {
    const token = signAccessToken(claims, { secret: SECRET, expiresInSeconds: 60, now: 1_700_000_000_000 })
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.')
    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf-8')) as {
      alg: string
      kid: string
    }
    expect(header).toMatchObject({ alg: MCP_JWT_ALG, kid: MCP_JWT_KID })

    const jwk = publicJwkFromSecret(SECRET)
    expect(jwk.kid).toBe(header.kid)
    const ok = nodeVerify(
      null,
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      createPublicKey({ key: jwk, format: 'jwk' }),
      Buffer.from(encodedSignature, 'base64url'),
    )
    expect(ok).toBe(true)
  })

  it('still verifies a legacy HS256 access token', () => {
    const nowMs = 1_700_000_000_000
    const token = signHs256AccessToken(claims, { secret: SECRET, expiresInSeconds: 60, now: nowMs })
    const decoded = verifyAccessToken(token, { secret: SECRET, now: nowMs, audience: RESOURCE, issuer: ISSUER })
    expect(decoded.sub).toBe(claims.sub)
  })

  it('rejects a token whose signature was tampered with', () => {
    const token = signAccessToken(claims, { secret: SECRET, expiresInSeconds: 60, now: 1_700_000_000_000 })
    const [h, p] = token.split('.')
    expect(() => verifyAccessToken(`${h}.${p}.deadbeef`, { secret: SECRET, now: 1_700_000_000_000 })).toThrow(/signature/i)
  })

  it('rejects a token signed with a different secret', () => {
    const token = signAccessToken(claims, { secret: SECRET, expiresInSeconds: 60, now: 1_700_000_000_000 })
    expect(() => verifyAccessToken(token, { secret: 'other-secret', now: 1_700_000_000_000 })).toThrow(/signature/i)
  })

  it('rejects an expired token', () => {
    const nowMs = 1_700_000_000_000
    const token = signAccessToken(claims, { secret: SECRET, expiresInSeconds: 60, now: nowMs })
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

  it('rejects a token issued by another authorization server', () => {
    const token = signAccessToken(claims, { secret: SECRET, expiresInSeconds: 60, now: 1_700_000_000_000 })
    expect(() =>
      verifyAccessToken(token, {
        secret: SECRET,
        now: 1_700_000_000_000,
        issuer: 'https://other.example.com',
      }),
    ).toThrow(/issuer/i)
  })

  it('rejects a malformed token', () => {
    expect(() => verifyAccessToken('smk_oauth_not-a-jwt', { secret: SECRET, now: 1 })).toThrow()
  })

  it('rejects a signed payload that is missing required string claims', () => {
    const nowMs = 1_700_000_000_000
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ sub: 123, iat: 1, exp: 9_999_999_999 })).toString('base64url')
    const signature = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url')
    expect(() =>
      verifyAccessToken(`${header}.${payload}.${signature}`, { secret: SECRET, now: nowMs }),
    ).toThrow(/missing/i)
  })
})
