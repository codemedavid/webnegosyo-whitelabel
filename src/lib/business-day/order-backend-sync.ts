/**
 * After the business-day cutoff changes, tell the order backend that numbers
 * this store's orders (#01 resets at the cutoff):
 *
 * - platform: nothing to do, the trigger reads `business_day_cutoffs` itself;
 * - convex: push the `business_day_cutoffs` tenantConfig row (config sync);
 * - supabase (the store's own database): copy the rows in.
 *
 * The schedule is always re-read from the platform database (fail closed), so
 * nothing a caller sends reaches a backend. Reported, never thrown: the
 * change starts tomorrow at the earliest, and every deploy carries it again.
 */
import 'server-only'

import { readCutoffSchedule } from '@/lib/business-day/read-schedule'
import { writeCutoffsToTenantDb, type TenantCutoffDb } from '@/lib/business-day/tenant-db-sync'
import { syncTenantConvexConfig, type ConvexConfigSyncResult } from '@/lib/convex-config-sync'
import { hasTenantSupabaseOrderCredentials, resolveOrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'
import { createAdminClient } from '@/lib/supabase/admin'
import { createTenantOrderWriteClient } from '@/lib/supabase/tenant-order-client'
import { getTenantSecrets, mergeTenantSecrets } from '@/lib/tenant-secrets'

export type BusinessDaySyncResult = ConvexConfigSyncResult

const ROUTING_SELECT =
  'id, order_backend, convex_deployment_url, supabase_order_url, supabase_order_anon_key, supabase_order_service_key'

function failed(error: unknown): BusinessDaySyncResult {
  return { status: 'failed', error: error instanceof Error ? error.message : String(error) }
}

/** Copy the stored schedule into a tenant's own order database. */
export async function syncTenantDbCutoffs(tenant: OrderBackendTenantFields & { id: string }): Promise<BusinessDaySyncResult> {
  try {
    if (!hasTenantSupabaseOrderCredentials(tenant)) return { status: 'skipped', reason: 'No tenant order database' }
    const schedule = await readCutoffSchedule(createAdminClient(), tenant.id)
    const db = createTenantOrderWriteClient(tenant) as unknown as TenantCutoffDb
    await writeCutoffsToTenantDb(db, tenant.id, schedule)
    return { status: 'synced' }
  } catch (error) {
    return failed(error)
  }
}

export async function syncBusinessDayToOrderBackend(tenantId: string): Promise<BusinessDaySyncResult> {
  try {
    const admin = createAdminClient()
    const [routing, secrets] = await Promise.all([
      admin.from('tenants').select(ROUTING_SELECT).eq('id', tenantId).single(),
      getTenantSecrets(admin, tenantId),
    ])
    if (routing.error || !routing.data) return { status: 'failed', error: routing.error?.message ?? 'Tenant not found' }
    const tenant = mergeTenantSecrets(routing.data as unknown as OrderBackendTenantFields & { id: string }, secrets)

    const backend = resolveOrderBackend(tenant)
    if (backend === 'supabase') return syncTenantDbCutoffs(tenant)
    // A platform store reads business_day_cutoffs itself. A Convex deployment
    // left over on it must not be written to (CLAUDE.md: route through
    // resolveOrderBackend); an old one would also fail and report a 502.
    if (backend === 'platform') return { status: 'skipped', reason: 'Platform store: the database reads the cutoff itself' }
    return syncTenantConvexConfig(tenantId)
  } catch (error) {
    return failed(error)
  }
}
