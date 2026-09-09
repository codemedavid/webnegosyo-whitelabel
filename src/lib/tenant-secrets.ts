/**
 * Per-tenant integration credentials.
 *
 * These five values used to be columns on `public.tenants`, a table the anon
 * key can read. They now live in `public.tenant_secrets` (migration
 * 20260904120000): row-scoped to the owning tenant's admins and superadmins,
 * never granted to anon. This module is the ONLY place that reads or writes
 * that table, so every caller gets the same contract:
 *
 *  - `getTenantSecrets` reads one tenant's row; `null` means no row yet.
 *  - `upsertTenantSecrets` writes only the keys the caller defined, keyed on
 *    `tenant_id`, so a form that leaves a secret blank cannot wipe it.
 *  - `mergeTenantSecrets` overlays a row onto a tenant object for code that
 *    still expects the old flat shape (`tenant.convex_deploy_key`, ...).
 *
 * Which client to pass: server code that already holds the service-role
 * client keeps using it. The cookie client works for a tenant's own admins
 * and for superadmins (RLS grants them the row) — but NOT for anonymous
 * traffic, so a customer-reachable path must read with the admin client.
 *
 * Server-only by construction: nothing here may be imported into a client
 * component, and none of these values may be serialized into a page.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export const TENANT_SECRET_KEYS = [
  'lalamove_api_key',
  'lalamove_secret_key',
  'messenger_page_access_token',
  'convex_deploy_key',
  'loyverse_access_token',
] as const

export type TenantSecretKey = (typeof TENANT_SECRET_KEYS)[number]

export type TenantSecrets = Record<TenantSecretKey, string | null>

/**
 * A partial write. `undefined` = leave the stored value alone; `null` = clear
 * it; a string = set it.
 */
export type TenantSecretsPatch = Partial<Record<TenantSecretKey, string | null | undefined>>

export const EMPTY_TENANT_SECRETS: TenantSecrets = Object.freeze({
  lalamove_api_key: null,
  lalamove_secret_key: null,
  messenger_page_access_token: null,
  convex_deploy_key: null,
  loyverse_access_token: null,
})

type TenantSecretsClient = SupabaseClient<Database>

type TenantSecretsRow = Database['public']['Tables']['tenant_secrets']['Row']

const SECRET_COLUMNS = TENANT_SECRET_KEYS.join(', ')

/** PostgREST `.in()` lists ride in the URL; keep each request comfortably short. */
const LIST_CHUNK_SIZE = 100

function toTenantSecrets(row: Partial<TenantSecretsRow>): TenantSecrets {
  return {
    lalamove_api_key: row.lalamove_api_key ?? null,
    lalamove_secret_key: row.lalamove_secret_key ?? null,
    messenger_page_access_token: row.messenger_page_access_token ?? null,
    convex_deploy_key: row.convex_deploy_key ?? null,
    loyverse_access_token: row.loyverse_access_token ?? null,
  }
}

/**
 * One tenant's secrets, or `null` when no row exists yet. A query error is
 * thrown — "could not read the secrets" must never look like "no secrets".
 */
export async function getTenantSecrets(
  client: TenantSecretsClient,
  tenantId: string,
): Promise<TenantSecrets | null> {
  const { data, error } = await client
    .from('tenant_secrets')
    .select(SECRET_COLUMNS)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to read tenant secrets: ${error.message}`)
  }
  if (!data) return null

  return toTenantSecrets(data as Partial<TenantSecretsRow>)
}

/**
 * Secrets for many tenants at once, keyed by tenant id. Tenants without a row
 * are simply absent from the map.
 */
export async function listTenantSecrets(
  client: TenantSecretsClient,
  tenantIds: readonly string[],
): Promise<Map<string, TenantSecrets>> {
  const result = new Map<string, TenantSecrets>()
  if (tenantIds.length === 0) return result

  for (let start = 0; start < tenantIds.length; start += LIST_CHUNK_SIZE) {
    const chunk = tenantIds.slice(start, start + LIST_CHUNK_SIZE)
    const { data, error } = await client
      .from('tenant_secrets')
      .select(`tenant_id, ${SECRET_COLUMNS}`)
      .in('tenant_id', chunk)

    if (error) {
      throw new Error(`Failed to list tenant secrets: ${error.message}`)
    }

    for (const row of (data ?? []) as Array<Partial<TenantSecretsRow>>) {
      if (row.tenant_id) result.set(row.tenant_id, toTenantSecrets(row))
    }
  }

  return result
}

/**
 * Write the defined keys of `patch` for the tenant, creating the row if it is
 * missing. Keys left `undefined` are not sent, so existing values survive.
 */
export async function upsertTenantSecrets(
  client: TenantSecretsClient,
  tenantId: string,
  patch: TenantSecretsPatch,
): Promise<void> {
  const defined = Object.fromEntries(
    TENANT_SECRET_KEYS.filter((key) => patch[key] !== undefined).map((key) => [key, patch[key]]),
  ) as Partial<Record<TenantSecretKey, string | null>>

  if (Object.keys(defined).length === 0) return

  const { error } = await client
    .from('tenant_secrets')
    .upsert({ tenant_id: tenantId, ...defined }, { onConflict: 'tenant_id' })

  if (error) {
    throw new Error(`Failed to save tenant secrets: ${error.message}`)
  }
}

/**
 * Overlay a secrets row onto a tenant object. Returns a new object; a missing
 * row reads as every secret being `null`, which is exactly what the old
 * nullable columns reported for an unconfigured tenant.
 */
export function mergeTenantSecrets<T extends object>(
  tenant: T,
  secrets: TenantSecrets | null,
): T & TenantSecrets {
  return { ...tenant, ...(secrets ?? EMPTY_TENANT_SECRETS) }
}
