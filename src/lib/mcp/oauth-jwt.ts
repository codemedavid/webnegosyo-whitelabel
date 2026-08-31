import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Minimal, dependency-free HS256 JWT for SmartMenu MCP OAuth access tokens.
 *
 * Grok (and other MCP connectors) verify signature, issuer, and audience on
 * the access token and will not send an opaque `smk_oauth_` secret as Bearer.
 * We are both issuer and verifier, so HMAC-SHA256 is sufficient. Short TTL
 * plus refresh-token revocation covers logout.
 */

export interface AccessTokenClaims {
  /** Subject — the user id that authorized the connector. */
  sub: string
  /** Space-delimited scopes (e.g. "superadmin"). */
  scope: string
  /** OAuth client id the token was issued to. */
  client_id: string
  /** RFC 8707 audience — the canonical MCP resource URI. */
  aud: string
  /** Authorization-server issuer; must match AS metadata `issuer`. */
  iss: string
  /** Tenant pin for merchant tokens; omitted for superadmin. */
  tenant_id?: string
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
  /** Canonical MCP resource URI this token must have been issued for. */
  audience?: string
  /** Authorization-server issuer this token must have been issued by. */
  issuer?: string
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

function signaturesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * Verifies a compact HS256 JWT and returns its claims. Throws on a malformed
 * token, a bad signature, an expired token, or an issuer/audience mismatch.
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
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8')) as VerifiedAccessToken
  } catch {
    throw new Error('Invalid token: unreadable payload')
  }

  const nowSeconds = Math.floor((opts.now ?? Date.now()) / 1000)
  if (typeof payload.exp !== 'number' || nowSeconds >= payload.exp) {
    throw new Error('Invalid token: expired')
  }
  if (opts.audience && payload.aud !== opts.audience) {
    throw new Error('Invalid token: audience mismatch')
  }
  if (opts.issuer && payload.iss !== opts.issuer) {
    throw new Error('Invalid token: issuer mismatch')
  }

  return payload
}
