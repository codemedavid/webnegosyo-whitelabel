import { createHash, randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Authentication for the SmartMenu MCP admin surface.
 *
 * MCP requests arrive from a separate process (Claude/ChatGPT) with no Supabase
 * session cookie, so they cannot use the cookie-based `verifySuperadmin` path.
 * Instead they present a superadmin-minted API key as a Bearer token. Only the
 * SHA-256 hash of the key is ever stored (`mcp_api_keys.key_hash`); the plaintext
 * is shown to the operator exactly once at creation time.
 */

/** Prefix on every issued key; `live` marks a production (non-sandbox) key. */
export const MCP_KEY_PREFIX = 'smk_live_'
/** OAuth access tokens use the same hashed credential store as manual keys. */
export const MCP_OAUTH_KEY_PREFIX = 'smk_oauth_'

const KEY_RANDOM_BYTES = 24

export interface GeneratedApiKey {
  /** Full plaintext key — shown to the operator once, never persisted. */
  plaintext: string
  /** SHA-256 hex digest persisted in `mcp_api_keys.key_hash`. */
  hash: string
  /** Non-secret prefix persisted for display (e.g. "smk_live_"). */
  prefix: string
}

export interface GeneratedOAuthAccessKey extends GeneratedApiKey {
  expiresAt: number
}

export interface McpKeyContext {
  keyId: string
  scopes: string[]
  /** Tenant the key is bound to (`tenant_admin` scope); null for superadmin keys. */
  tenantId: string | null
}

interface McpKeyRow {
  id: string
  scopes: string[] | null
  revoked_at: string | null
  tenant_id: string | null
}

/** SHA-256 hex digest of a plaintext key. Deterministic and pure. */
export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

/**
 * Parses an HTTP `Authorization` header value and returns the Bearer token,
 * or null when the header is absent, uses another scheme, or the token is empty.
 */
export function extractBearerToken(header: string | null | undefined): string | null {
  if (!header) return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  const token = match?.[1]?.trim()
  return token && token.length > 0 ? token : null
}

/** Mints a fresh API key. The plaintext is only returned here — never stored. */
export function generateApiKey(): GeneratedApiKey {
  const plaintext = `${MCP_KEY_PREFIX}${randomBytes(KEY_RANDOM_BYTES).toString('hex')}`
  return {
    plaintext,
    hash: hashApiKey(plaintext),
    prefix: MCP_KEY_PREFIX,
  }
}

/**
 * Mints an opaque OAuth access token. Its expiry is encoded as an unsigned
 * base-36 timestamp, but the full token must still match its SHA-256 database
 * record, so changing the timestamp invalidates the credential.
 */
export function generateOAuthAccessKey(ttlSeconds: number, now = Date.now()): GeneratedOAuthAccessKey {
  const expiresAt = now + ttlSeconds * 1000
  const plaintext = `${MCP_OAUTH_KEY_PREFIX}${Math.floor(expiresAt / 1000).toString(36)}_${randomBytes(KEY_RANDOM_BYTES).toString('base64url')}`
  return {
    plaintext,
    hash: hashApiKey(plaintext),
    prefix: MCP_OAUTH_KEY_PREFIX,
    expiresAt,
  }
}

/**
 * Verifies a Bearer-token MCP request against the `mcp_api_keys` table using a
 * service-role Supabase client (no cookies). Throws on any failure so callers
 * can map the error to HTTP 401. Never logs or returns the plaintext key.
 */
export async function verifyMcpKey(
  authorizationHeader: string | null | undefined,
  client: SupabaseClient,
  options: { now?: () => number } = {},
): Promise<McpKeyContext> {
  const token = extractBearerToken(authorizationHeader)
  if (!token) {
    throw new Error('Unauthorized: missing or malformed Bearer token')
  }

  const { data, error } = await client
    .from('mcp_api_keys')
    .select('id, scopes, revoked_at, tenant_id')
    .eq('key_hash', hashApiKey(token))
    .maybeSingle()

  if (error) {
    throw new Error(`MCP key lookup failed: ${error.message}`)
  }

  const row = data as McpKeyRow | null
  if (!row) {
    throw new Error('Unauthorized: unknown API key')
  }

  if (row.revoked_at) {
    throw new Error('Unauthorized: API key has been revoked')
  }

  if (token.startsWith(MCP_OAUTH_KEY_PREFIX)) {
    const encodedExpiry = token.slice(MCP_OAUTH_KEY_PREFIX.length).split('_', 1)[0]
    const expiresAtSeconds = Number.parseInt(encodedExpiry, 36)
    const now = options.now?.() ?? Date.now()
    if (!Number.isFinite(expiresAtSeconds) || now >= expiresAtSeconds * 1000) {
      throw new Error('Unauthorized: OAuth access token expired')
    }
  }

  return { keyId: row.id, scopes: row.scopes ?? [], tenantId: row.tenant_id ?? null }
}
