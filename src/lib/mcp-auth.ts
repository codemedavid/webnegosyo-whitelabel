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

const KEY_RANDOM_BYTES = 24

export interface GeneratedApiKey {
  /** Full plaintext key — shown to the operator once, never persisted. */
  plaintext: string
  /** SHA-256 hex digest persisted in `mcp_api_keys.key_hash`. */
  hash: string
  /** Non-secret prefix persisted for display (e.g. "smk_live_"). */
  prefix: string
}

export interface McpKeyContext {
  keyId: string
  scopes: string[]
}

interface McpKeyRow {
  id: string
  scopes: string[] | null
  revoked_at: string | null
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
 * Verifies a Bearer-token MCP request against the `mcp_api_keys` table using a
 * service-role Supabase client (no cookies). Throws on any failure so callers
 * can map the error to HTTP 401. Never logs or returns the plaintext key.
 */
export async function verifyMcpKey(
  authorizationHeader: string | null | undefined,
  client: SupabaseClient,
): Promise<McpKeyContext> {
  const token = extractBearerToken(authorizationHeader)
  if (!token) {
    throw new Error('Unauthorized: missing or malformed Bearer token')
  }

  const { data, error } = await client
    .from('mcp_api_keys')
    .select('id, scopes, revoked_at')
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

  return { keyId: row.id, scopes: row.scopes ?? [] }
}
