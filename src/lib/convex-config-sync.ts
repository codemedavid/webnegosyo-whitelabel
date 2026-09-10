/**
 * Push a tenant's settings into its own Convex deployment.
 *
 * Convex-backed stores book Lalamove through `convex/lalamove.ts`, which reads
 * its credentials from `tenantConfig` — never from Supabase. Until this ran,
 * the only thing that ever wrote those rows was the superadmin "Deploy Schema"
 * button, so a merchant whose Lalamove keys were saved in the tenant form saw
 * "Lalamove not configured" on the order screen until someone happened to
 * redeploy. Every place that saves those settings now calls this.
 *
 * Failure is reported, never thrown: a Convex deployment being unreachable
 * must not fail the Supabase save that just succeeded. Callers surface the
 * warning instead.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantSecrets, mergeTenantSecrets } from '@/lib/tenant-secrets'
import { syncTenantConfig } from '@/lib/convex-deploy'
import {
  buildTenantConfigPayload,
  CONVEX_CONFIG_TENANT_COLUMNS,
  type ConvexTenantConfigSource,
} from '@/lib/convex-tenant-config'

export type ConvexConfigSyncResult =
  /** Pushed to the deployment. */
  | { status: 'synced' }
  /** Nothing to push to — the store has no Convex deployment configured. */
  | { status: 'skipped'; reason: string }
  /** The deployment was there and refused the write. */
  | { status: 'failed'; error: string }

type TenantConfigRow = ConvexTenantConfigSource & {
  id: string
  convex_deployment_url: string | null
}

/**
 * Sync one tenant. Safe to call after any save that touches the Lalamove
 * settings, the store address, or the store's phone numbers.
 */
export async function syncTenantConvexConfig(tenantId: string): Promise<ConvexConfigSyncResult> {
  try {
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('tenants')
      .select(CONVEX_CONFIG_TENANT_COLUMNS)
      .eq('id', tenantId)
      .single()

    if (error || !data) {
      return { status: 'failed', error: error?.message ?? 'Tenant not found' }
    }

    const tenant = data as unknown as TenantConfigRow
    if (!tenant.convex_deployment_url) {
      return { status: 'skipped', reason: 'No Convex deployment URL' }
    }

    const secrets = await getTenantSecrets(supabase, tenantId)
    if (!secrets?.convex_deploy_key) {
      return { status: 'skipped', reason: 'No Convex deploy key' }
    }

    const payload = buildTenantConfigPayload(mergeTenantSecrets(tenant, secrets))
    const synced = await syncTenantConfig(
      tenant.convex_deployment_url,
      secrets.convex_deploy_key,
      payload
    )

    return synced
      ? { status: 'synced' }
      : { status: 'failed', error: 'Convex rejected the config write' }
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Failed to sync Convex config',
    }
  }
}

/**
 * A one-line warning for a sync that did not go through, or `null` when there
 * is nothing worth telling the operator. A skipped sync is normal (most
 * stores have no Convex deployment), so only a real failure speaks up.
 */
export function convexConfigSyncWarning(result: ConvexConfigSyncResult): string | null {
  if (result.status !== 'failed') return null
  return `Saved, but the store's app backend did not pick up the change: ${result.error}. Re-deploy the Convex schema from the tenant page.`
}
