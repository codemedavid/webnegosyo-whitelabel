import type { SupabaseClient } from '@supabase/supabase-js'
import { generateApiKey, hashApiKey } from '@/lib/mcp-auth'

/**
 * Management operations for SmartMenu MCP API keys, backing the superadmin
 * "MCP Keys" UI. Every function takes an explicit Supabase client so it can be
 * unit-tested and driven either by the service-role client (server actions) or
 * any other authorized caller. The plaintext key is only ever returned by
 * {@link createMcpKey}; it is never persisted and never re-derivable — only its
 * SHA-256 hash is stored (`mcp_api_keys.key_hash`).
 */

/** Non-secret view of a key row. Deliberately omits `key_hash`. */
export interface McpKeySummary {
  id: string
  label: string
  keyPrefix: string
  scopes: string[]
  createdAt: string | null
  lastUsedAt: string | null
  revokedAt: string | null
}

/** Result of minting a key: the one-time plaintext plus the stored summary. */
export interface CreatedMcpKey {
  /** Full plaintext key — shown to the operator once, never persisted. */
  plaintext: string
  key: McpKeySummary
}

/** Columns that make up a non-secret summary. `key_hash` is never selected. */
const SUMMARY_COLUMNS = 'id, label, key_prefix, scopes, created_at, last_used_at, revoked_at'

interface McpKeyRow {
  id: string
  label: string
  key_prefix: string
  scopes: string[] | null
  created_at: string | null
  last_used_at: string | null
  revoked_at: string | null
}

function toSummary(row: McpKeyRow): McpKeySummary {
  return {
    id: row.id,
    label: row.label,
    keyPrefix: row.key_prefix,
    scopes: row.scopes ?? [],
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  }
}

/** Lists all MCP keys newest-first as non-secret summaries. */
export async function listMcpKeys(client: SupabaseClient): Promise<McpKeySummary[]> {
  const { data, error } = await client
    .from('mcp_api_keys')
    .select(SUMMARY_COLUMNS)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to list MCP keys: ${error.message}`)
  }

  return ((data ?? []) as McpKeyRow[]).map(toSummary)
}

/**
 * Mints a fresh key, stores only its hash, and returns the plaintext once.
 * Validates the label at the boundary before any DB write.
 */
export async function createMcpKey(
  client: SupabaseClient,
  label: string,
  createdBy?: string,
): Promise<CreatedMcpKey> {
  const trimmed = label?.trim()
  if (!trimmed) {
    throw new Error('A non-empty label is required to create an MCP key')
  }

  const { plaintext, hash, prefix } = generateApiKey()

  const { data, error } = await client
    .from('mcp_api_keys')
    .insert({
      key_hash: hash,
      key_prefix: prefix,
      label: trimmed,
      scopes: ['superadmin'],
      ...(createdBy ? { created_by: createdBy } : {}),
    })
    .select(SUMMARY_COLUMNS)
    .single()

  if (error) {
    throw new Error(`Failed to create MCP key: ${error.message}`)
  }

  return { plaintext, key: toSummary(data as McpKeyRow) }
}

/** Revokes a key by stamping `revoked_at`; verification then treats it as invalid. */
export async function revokeMcpKey(client: SupabaseClient, id: string): Promise<McpKeySummary> {
  const { data, error } = await client
    .from('mcp_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .select(SUMMARY_COLUMNS)
    .single()

  if (error) {
    throw new Error(`Failed to revoke MCP key: ${error.message}`)
  }

  return toSummary(data as McpKeyRow)
}

// ── Merchant (tenant_admin) keys ─────────────────────────────────────────────
// Every operation below is pinned to ONE tenant at this layer. The DB CHECK
// (`mcp_api_keys_tenant_scope_check`) independently rejects a tenant_admin key
// without a tenant, but the tenant filters here are what stop a buggy caller
// from listing or revoking another store's credentials.

/** Lists a single tenant's merchant keys newest-first as non-secret summaries. */
export async function listMerchantMcpKeys(
  client: SupabaseClient,
  tenantId: string,
): Promise<McpKeySummary[]> {
  const { data, error } = await client
    .from('mcp_api_keys')
    .select(SUMMARY_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to list merchant MCP keys: ${error.message}`)
  }

  return ((data ?? []) as McpKeyRow[]).map(toSummary)
}

/**
 * Mints a merchant key: scope `tenant_admin`, pinned to `tenantId`. Returns the
 * plaintext once; only the hash is stored.
 */
export async function createMerchantMcpKey(
  client: SupabaseClient,
  tenantId: string,
  label: string,
  createdBy?: string,
): Promise<CreatedMcpKey> {
  if (!tenantId?.trim()) {
    throw new Error('A tenant id is required to create a merchant MCP key')
  }
  const trimmed = label?.trim()
  if (!trimmed) {
    throw new Error('A non-empty label is required to create an MCP key')
  }

  const { plaintext, hash, prefix } = generateApiKey()

  const { data, error } = await client
    .from('mcp_api_keys')
    .insert({
      key_hash: hash,
      key_prefix: prefix,
      label: trimmed,
      scopes: ['tenant_admin'],
      tenant_id: tenantId,
      ...(createdBy ? { created_by: createdBy } : {}),
    })
    .select(SUMMARY_COLUMNS)
    .single()

  if (error) {
    throw new Error(`Failed to create merchant MCP key: ${error.message}`)
  }

  return { plaintext, key: toSummary(data as McpKeyRow) }
}

/**
 * Revokes a merchant key, filtered by BOTH the key id and the tenant — a key
 * belonging to another store is unreachable through this path and throws.
 */
export async function revokeMerchantMcpKey(
  client: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<McpKeySummary> {
  const { data, error } = await client
    .from('mcp_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(SUMMARY_COLUMNS)
    .single()

  if (error || !data) {
    throw new Error(`Failed to revoke merchant MCP key: ${error?.message ?? 'key not found for this tenant'}`)
  }

  return toSummary(data as McpKeyRow)
}

/** Re-exported so callers can hash without importing mcp-auth directly. */
export { hashApiKey }
