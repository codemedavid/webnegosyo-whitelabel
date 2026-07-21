import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signAccessToken } from '@/lib/mcp/oauth-jwt'

/**
 * OAuth 2.1 authorization-server logic for the SmartMenu MCP, backing the
 * "automatic login" connect flow (no copy-pasted keys). This module is the pure,
 * testable core: it takes an explicit Supabase client and an injectable clock,
 * and never touches cookies or HTTP directly. The route handlers wrap it.
 *
 * Design:
 * - Public clients + PKCE (no client secret), per the MCP OAuth spec.
 * - Authorization codes and refresh tokens are opaque; only their SHA-256 hash
 *   is stored. Access tokens are stateless HS256 JWTs (see oauth-jwt.ts).
 * - All timestamps use the injected `now` so tests are deterministic.
 */

export type PkceMethod = 'S256' | 'plain'

export interface TokenResponse {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  refresh_token?: string
  scope: string
}

const sha256Hex = (input: string) => createHash('sha256').update(input).digest('hex')
const sha256Base64Url = (input: string) => createHash('sha256').update(input).digest('base64url')

/** Opaque, URL-safe secret for codes / tokens / client ids. */
function opaque(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** RFC 7636 PKCE verification. `S256` compares base64url(sha256(verifier)). */
export function verifyPkce(codeVerifier: string, codeChallenge: string, method: PkceMethod): boolean {
  if (!codeVerifier || !codeChallenge) return false
  const derived = method === 'S256' ? sha256Base64Url(codeVerifier) : codeVerifier
  return constantTimeEquals(derived, codeChallenge)
}

// ---- Dynamic Client Registration ----

export interface RegisterClientInput {
  client_name: string
  redirect_uris: string[]
}

export interface RegisteredClient {
  client_id: string
  client_name: string
  redirect_uris: string[]
}

/** Registers a public OAuth client (DCR). Returns the generated client_id. */
export async function registerClient(
  client: SupabaseClient,
  input: RegisterClientInput,
): Promise<RegisteredClient> {
  if (!input.redirect_uris?.length) {
    throw new Error('invalid_client_metadata: at least one redirect_uri is required')
  }

  const clientId = `mcpc_${opaque(16)}`
  const { data, error } = await client
    .from('mcp_oauth_clients')
    .insert({
      client_id: clientId,
      client_name: input.client_name || 'MCP Client',
      redirect_uris: input.redirect_uris,
    })
    .select('client_id, client_name, redirect_uris')
    .single()

  if (error) {
    throw new Error(`Failed to register client: ${error.message}`)
  }

  const row = data as RegisteredClient
  return { client_id: row.client_id, client_name: row.client_name, redirect_uris: row.redirect_uris }
}

// ---- Authorization code ----

export interface IssueCodeInput {
  clientId: string
  redirectUri: string
  codeChallenge: string
  codeChallengeMethod: PkceMethod
  scope: string
  userId: string
}

/** Persists a hashed authorization code and returns the one-time plaintext code. */
export async function issueAuthorizationCode(
  client: SupabaseClient,
  input: IssueCodeInput,
  opts: { now?: number; ttlSeconds: number },
): Promise<string> {
  const now = opts.now ?? Date.now()
  const code = opaque(32)

  const { error } = await client.from('mcp_oauth_codes').insert({
    code_hash: sha256Hex(code),
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    code_challenge_method: input.codeChallengeMethod,
    scope: input.scope,
    created_by: input.userId,
    expires_at: new Date(now + opts.ttlSeconds * 1000).toISOString(),
  })

  if (error) {
    throw new Error(`Failed to issue authorization code: ${error.message}`)
  }

  return code
}

// ---- Token exchange ----

interface StoredCodeRow {
  id: string
  client_id: string
  redirect_uri: string
  code_challenge: string
  code_challenge_method: PkceMethod
  scope: string
  created_by: string
  consumed_at: string | null
  expires_at: string
}

export interface ExchangeCodeInput {
  code: string
  clientId: string
  redirectUri: string
  codeVerifier: string
}

export interface ExchangeCodeOptions {
  now?: number
  secret: string
  accessTtlSeconds: number
  refreshTtlSeconds: number
}

/**
 * Exchanges an authorization code for tokens. Enforces single-use, expiry,
 * client + redirect_uri binding, and PKCE. Throws `invalid_grant` on any
 * failure (the token endpoint maps this to an OAuth error response).
 */
export async function exchangeAuthorizationCode(
  client: SupabaseClient,
  input: ExchangeCodeInput,
  opts: ExchangeCodeOptions,
): Promise<TokenResponse> {
  const now = opts.now ?? Date.now()

  const { data, error } = await client
    .from('mcp_oauth_codes')
    .select('id, client_id, redirect_uri, code_challenge, code_challenge_method, scope, created_by, consumed_at, expires_at')
    .eq('code_hash', sha256Hex(input.code))
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to look up authorization code: ${error.message}`)
  }
  const row = data as StoredCodeRow | null
  if (!row) {
    throw new Error('invalid_grant: unknown authorization code')
  }
  if (row.consumed_at) {
    throw new Error('invalid_grant: authorization code already used')
  }
  if (new Date(row.expires_at).getTime() <= now) {
    throw new Error('invalid_grant: authorization code expired')
  }
  if (row.client_id !== input.clientId) {
    throw new Error('invalid_grant: client mismatch')
  }
  if (row.redirect_uri !== input.redirectUri) {
    throw new Error('invalid_grant: redirect_uri mismatch')
  }
  if (!verifyPkce(input.codeVerifier, row.code_challenge, row.code_challenge_method)) {
    throw new Error('invalid_grant: PKCE verification failed')
  }

  // Single-use: consume the code before issuing tokens.
  const { error: consumeError } = await client
    .from('mcp_oauth_codes')
    .update({ consumed_at: new Date(now).toISOString() })
    .eq('id', row.id)
    .select('id')
    .single()
  if (consumeError) {
    throw new Error(`Failed to consume authorization code: ${consumeError.message}`)
  }

  return issueTokens(client, {
    clientId: row.client_id,
    subject: row.created_by,
    scope: row.scope,
    now,
    secret: opts.secret,
    accessTtlSeconds: opts.accessTtlSeconds,
    refreshTtlSeconds: opts.refreshTtlSeconds,
  })
}

interface IssueTokensParams {
  clientId: string
  subject: string
  scope: string
  now: number
  secret: string
  accessTtlSeconds: number
  refreshTtlSeconds: number
}

async function issueTokens(client: SupabaseClient, p: IssueTokensParams): Promise<TokenResponse> {
  const accessToken = signAccessToken(
    { sub: p.subject, scope: p.scope, client_id: p.clientId },
    { secret: p.secret, expiresInSeconds: p.accessTtlSeconds, now: p.now },
  )
  const refreshToken = opaque(32)

  const { error } = await client.from('mcp_oauth_tokens').insert({
    token_hash: sha256Hex(refreshToken),
    client_id: p.clientId,
    subject: p.subject,
    scope: p.scope,
    expires_at: new Date(p.now + p.refreshTtlSeconds * 1000).toISOString(),
  })
  if (error) {
    throw new Error(`Failed to persist refresh token: ${error.message}`)
  }

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: p.accessTtlSeconds,
    refresh_token: refreshToken,
    scope: p.scope,
  }
}

// ---- Refresh ----

interface StoredTokenRow {
  id: string
  client_id: string
  subject: string
  scope: string
  revoked_at: string | null
  expires_at: string
}

export async function refreshAccessToken(
  client: SupabaseClient,
  input: { refreshToken: string; clientId: string },
  opts: { now?: number; secret: string; accessTtlSeconds: number },
): Promise<TokenResponse> {
  const now = opts.now ?? Date.now()

  const { data, error } = await client
    .from('mcp_oauth_tokens')
    .select('id, client_id, subject, scope, revoked_at, expires_at')
    .eq('token_hash', sha256Hex(input.refreshToken))
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to look up refresh token: ${error.message}`)
  }
  const row = data as StoredTokenRow | null
  if (!row) {
    throw new Error('invalid_grant: unknown refresh token')
  }
  if (row.revoked_at) {
    throw new Error('invalid_grant: refresh token revoked')
  }
  if (new Date(row.expires_at).getTime() <= now) {
    throw new Error('invalid_grant: refresh token expired')
  }
  if (row.client_id !== input.clientId) {
    throw new Error('invalid_grant: client mismatch')
  }

  const accessToken = signAccessToken(
    { sub: row.subject, scope: row.scope, client_id: row.client_id },
    { secret: opts.secret, expiresInSeconds: opts.accessTtlSeconds, now },
  )
  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: opts.accessTtlSeconds,
    scope: row.scope,
  }
}

/** Revokes a refresh token by hash (idempotent). */
export async function revokeRefreshToken(
  client: SupabaseClient,
  refreshToken: string,
  opts: { now?: number } = {},
): Promise<void> {
  const now = opts.now ?? Date.now()
  const { error } = await client
    .from('mcp_oauth_tokens')
    .update({ revoked_at: new Date(now).toISOString() })
    .eq('token_hash', sha256Hex(refreshToken))
  if (error) {
    throw new Error(`Failed to revoke refresh token: ${error.message}`)
  }
}
