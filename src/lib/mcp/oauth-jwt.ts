import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Minimal, dependency-free HS256 JWT for SmartMenu MCP OAuth access tokens.
 *
 * We are both the issuer and the verifier of these tokens, so a symmetric
 * HMAC-SHA256 signature is sufficient and avoids adding a JWT library. Access
 * tokens are stateless (no DB lookup on the hot path); revocation of long-lived
 * access is handled by short token lifetimes plus refresh-token revocation in
 * the OAuth token store. The signing key comes from `MCP_OAUTH_JWT_SECRET`.
 */

export interface AccessTokenClaims {
  /** Subject — the superadmin user id that authorized the connector. */
  sub: string
  /** Space-delimited scopes (e.g. "superadmin"). */
  scope: string
  /** OAuth client id the token was issued to. */
  client_id: string
}

export interface VerifiedAccessToken extends AccessTokenClaims {
  iat: number
  exp: number
}

interface SignOptions {
  secret: string
  expiresInSeconds: number
  /** Injectable clock in ms since epoch (defaults to Date.now()). */
  now?: number
}

interface VerifyOptions {
  secret: string
  /** Injectable clock in ms since epoch (defaults to Date.now()). */
  now?: number
}

const HEADER = { alg: 'HS256', typ: 'JWT' } as const

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url')
}

/** Signs a compact HS256 JWT carrying the given claims. */
export function signAccessToken(claims: AccessTokenClaims, opts: SignOptions): string {
  const nowSeconds = Math.floor((opts.now ?? Date.now()) / 1000)
  const payload = {
    ...claims,
    iat: nowSeconds,
    exp: nowSeconds + opts.expiresInSeconds,
  }
  const encodedHeader = base64url(JSON.stringify(HEADER))
  const encodedPayload = base64url(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`
  return `${signingInput}.${sign(signingInput, opts.secret)}`
}

/** Constant-time comparison of two base64url signature strings. */
function signaturesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * Verifies a compact HS256 JWT and returns its claims. Throws on a malformed
 * token, a bad signature, or an expired token.
 */
export function verifyAccessToken(token: string, opts: VerifyOptions): VerifiedAccessToken {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid token: malformed JWT')
  }
  const [encodedHeader, encodedPayload, signature] = parts

  const expected = sign(`${encodedHeader}.${encodedPayload}`, opts.secret)
  if (!signaturesMatch(signature, expected)) {
    throw new Error('Invalid token: signature verification failed')
  }

  let payload: VerifiedAccessToken
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8'))
  } catch {
    throw new Error('Invalid token: unreadable payload')
  }

  const nowSeconds = Math.floor((opts.now ?? Date.now()) / 1000)
  if (typeof payload.exp !== 'number' || nowSeconds >= payload.exp) {
    throw new Error('Invalid token: expired')
  }

  return payload
}
