import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  sign as nodeSign,
  timingSafeEqual,
  verify as nodeVerify,
  type KeyObject,
} from 'crypto'

/**
 * JWT access tokens for SmartMenu MCP OAuth.
 *
 * Grok (CLI and grok.com connectors) verifies the access token as a public-key
 * JWT using the authorization server's JWKS. HS256 cannot be checked that way
 * — the client has no shared secret — so it drops the token and the next MCP
 * POST arrives with no Bearer (HTTP 401, no DB lookup).
 *
 * Access tokens are Ed25519 (`EdDSA`). The private key is derived
 * deterministically from `MCP_OAUTH_JWT_SECRET`, so every serverless instance
 * mints and verifies the same key without a second env var. HS256 verification
 * remains for tokens issued before this switch (1 hour TTL).
 */

/** JWT `kid` / JWKS key id. Stable so clients can cache the JWK. */
export const MCP_JWT_KID = 'smartmenu-mcp-ed25519'
export const MCP_JWT_ALG = 'EdDSA'

/** PKCS#8 prefix for a 32-byte Ed25519 seed (RFC 8410). */
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')

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

const HS256_HEADER = { alg: 'HS256', typ: 'JWT' } as const

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

function hmacSign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url')
}

function signaturesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** 32-byte Ed25519 seed derived from the configured signing secret. */
function ed25519Seed(secret: string): Buffer {
  return createHash('sha256').update(secret).digest()
}

function ed25519PrivateKey(secret: string): KeyObject {
  const der = Buffer.concat([ED25519_PKCS8_PREFIX, ed25519Seed(secret)])
  const pem = `-----BEGIN PRIVATE KEY-----\n${der.toString('base64')}\n-----END PRIVATE KEY-----`
  return createPrivateKey({ key: pem, format: 'pem' })
}

/** Public JWK for the Ed25519 key derived from `secret`. Safe to publish. */
export function publicJwkFromSecret(secret: string): {
  kty: 'OKP'
  crv: 'Ed25519'
  x: string
  kid: string
  use: 'sig'
  alg: 'EdDSA'
} {
  const jwk = createPublicKey(ed25519PrivateKey(secret)).export({ format: 'jwk' }) as {
    x?: string
  }
  if (!jwk.x) {
    throw new Error('Failed to export Ed25519 public JWK')
  }
  return {
    kty: 'OKP',
    crv: 'Ed25519',
    x: jwk.x,
    kid: MCP_JWT_KID,
    use: 'sig',
    alg: MCP_JWT_ALG,
  }
}

export function buildJwks(secret: string): { keys: ReturnType<typeof publicJwkFromSecret>[] } {
  return { keys: [publicJwkFromSecret(secret)] }
}

/** Signs a compact EdDSA JWT carrying the given claims. */
export function signAccessToken(claims: AccessTokenClaims, opts: SignOptions): string {
  const nowSeconds = Math.floor((opts.now ?? Date.now()) / 1000)
  const payload = {
    ...claims,
    typ: 'access_token',
    iat: nowSeconds,
    exp: nowSeconds + opts.expiresInSeconds,
  }
  const header = { alg: MCP_JWT_ALG, typ: 'JWT', kid: MCP_JWT_KID }
  const encodedHeader = base64url(JSON.stringify(header))
  const encodedPayload = base64url(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const signature = nodeSign(null, Buffer.from(signingInput), ed25519PrivateKey(opts.secret)).toString(
    'base64url',
  )
  return `${signingInput}.${signature}`
}

/** Test-only: mint an HS256 token so the verifier's legacy path stays covered. */
export function signHs256AccessToken(claims: AccessTokenClaims, opts: SignOptions): string {
  const nowSeconds = Math.floor((opts.now ?? Date.now()) / 1000)
  const payload = {
    ...claims,
    iat: nowSeconds,
    exp: nowSeconds + opts.expiresInSeconds,
  }
  const encodedHeader = base64url(JSON.stringify(HS256_HEADER))
  const encodedPayload = base64url(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`
  return `${signingInput}.${hmacSign(signingInput, opts.secret)}`
}

function parseJwtHeader(encodedHeader: string): { alg?: string } {
  try {
    const parsed = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf-8')) as {
      alg?: unknown
    }
    return { alg: typeof parsed.alg === 'string' ? parsed.alg : undefined }
  } catch {
    throw new Error('Invalid token: unreadable header')
  }
}

/**
 * Verifies a compact JWT (EdDSA or legacy HS256) and returns its claims.
 * Throws on a malformed token, a bad signature, an expired token, or an
 * issuer/audience mismatch.
 */
export function verifyAccessToken(token: string, opts: VerifyOptions): VerifiedAccessToken {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid token: malformed JWT')
  }
  const [encodedHeader, encodedPayload, signature] = parts
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const header = parseJwtHeader(encodedHeader)

  if (header.alg === MCP_JWT_ALG) {
    const ok = nodeVerify(
      null,
      Buffer.from(signingInput),
      createPublicKey(ed25519PrivateKey(opts.secret)),
      Buffer.from(signature, 'base64url'),
    )
    if (!ok) {
      throw new Error('Invalid token: signature verification failed')
    }
  } else if (header.alg === 'HS256') {
    const expected = hmacSign(signingInput, opts.secret)
    if (!signaturesMatch(signature, expected)) {
      throw new Error('Invalid token: signature verification failed')
    }
  } else {
    throw new Error(`Invalid token: unsupported alg ${header.alg ?? '(missing)'}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8'))
  } catch {
    throw new Error('Invalid token: unreadable payload')
  }
  const payload = asVerifiedAccessToken(parsed)

  const nowSeconds = Math.floor((opts.now ?? Date.now()) / 1000)
  if (nowSeconds >= payload.exp) {
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

function asVerifiedAccessToken(value: unknown): VerifiedAccessToken {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid token: unreadable payload')
  }
  const record = value as Record<string, unknown>
  if (typeof record.sub !== 'string' || !record.sub) throw new Error('Invalid token: missing sub')
  if (typeof record.scope !== 'string') throw new Error('Invalid token: missing scope')
  if (typeof record.client_id !== 'string' || !record.client_id) throw new Error('Invalid token: missing client_id')
  if (typeof record.aud !== 'string' || !record.aud) throw new Error('Invalid token: missing aud')
  if (typeof record.iss !== 'string' || !record.iss) throw new Error('Invalid token: missing iss')
  if (typeof record.iat !== 'number' || typeof record.exp !== 'number') {
    throw new Error('Invalid token: missing iat/exp')
  }
  if (record.tenant_id !== undefined && typeof record.tenant_id !== 'string') {
    throw new Error('Invalid token: malformed tenant_id')
  }
  return {
    sub: record.sub,
    scope: record.scope,
    client_id: record.client_id,
    aud: record.aud,
    iss: record.iss,
    iat: record.iat,
    exp: record.exp,
    ...(record.tenant_id ? { tenant_id: record.tenant_id } : {}),
  }
}
