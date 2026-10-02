/**
 * The one way Loyverse server code reads a tenant: the handful of columns the
 * integration uses (never `select('*')`), with the access token merged in
 * from tenant_secrets — it does not live on the anon-readable tenants row.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { getTenantSecrets, listTenantSecrets } from '@/lib/tenant-secrets'
import type { LoyverseTenantFields } from '@/lib/loyverse/config'

type AdminClient = ReturnType<typeof createAdminClient>

export const LOYVERSE_TENANT_COLUMNS =
  'id, slug, loyverse_enabled, loyverse_store_id, loyverse_payment_type_id, loyverse_push_mode, loyverse_last_synced_at'

export interface LoyverseTenant extends LoyverseTenantFields {
  id: string
  slug?: string | null
  loyverse_last_synced_at?: string | null
}

type LoyverseTenantRow = Omit<LoyverseTenant, 'loyverse_access_token'>

function withToken(row: LoyverseTenantRow, token: string | null | undefined): LoyverseTenant {
  return { ...row, loyverse_access_token: token ?? null }
}

/** null when the tenant does not exist or cannot be read. */
export async function loadLoyverseTenant(
  admin: AdminClient,
  tenantId: string
): Promise<LoyverseTenant | null> {
  const { data, error } = await admin
    .from('tenants')
    .select(LOYVERSE_TENANT_COLUMNS)
    .eq('id', tenantId)
    .maybeSingle()
  if (error || !data) return null
  const secrets = await getTenantSecrets(admin, tenantId)
  return withToken(data as unknown as LoyverseTenantRow, secrets?.loyverse_access_token)
}

/**
 * Every Loyverse-enabled tenant, stalest sync first — so a reconcile that
 * runs out of time always leaves the most recently synced tenants behind,
 * never the same unlucky tail on every run.
 */
export async function listLoyverseTenants(admin: AdminClient): Promise<LoyverseTenant[]> {
  const { data, error } = await admin
    .from('tenants')
    .select(LOYVERSE_TENANT_COLUMNS)
    .eq('loyverse_enabled', true)
    .order('loyverse_last_synced_at', { ascending: true, nullsFirst: true })
  if (error) throw new Error(`Failed to list Loyverse tenants: ${error.message}`)

  const rows = (data ?? []) as unknown as LoyverseTenantRow[]
  const secretsByTenant = await listTenantSecrets(admin, rows.map((row) => row.id))
  return rows.map((row) => withToken(row, secretsByTenant.get(row.id)?.loyverse_access_token))
}
