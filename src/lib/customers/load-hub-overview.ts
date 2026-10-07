/**
 * The Customer Hub overview for one store: repeat rate over 7/30/90 days, new
 * versus returning, at-risk, identified-order coverage, top items, and the
 * Reports dashboard with saved names put on the best customers.
 *
 * Shared by `POST /api/customers/hub-overview` (merchant app) and the owner
 * assistant, so the repeat-rate definition exists once.
 *
 * Callers MUST authenticate the caller and check the `customers` permission
 * and branch scope first: this runs with the service role.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOrderBackend, type OrderBackendTenantFields } from '@/lib/order-backend'
import { fetchCustomerOrderFacts } from '@/lib/queries/customer-facts'
import { buildCustomerHubOverview, type CustomerHubOverview } from '@/lib/customer-hub-overview'
import { attachCustomerNames, isCustomerHubOn, topCustomerIds } from '@/lib/customer-dashboard'

export interface LoadHubOverviewOptions {
  /** One read covers every window the Hub shows, so it spans the widest. */
  windowDays: number
  /** Null is the whole business. Branch scope is the caller's job. */
  outletId: string | null
}

export type HubOverviewLoad =
  | { ok: true; overview: CustomerHubOverview }
  | { ok: false; status: 403 | 404; error: string }

export async function loadCustomerHubOverview(
  tenantId: string,
  { windowDays, outletId }: LoadHubOverviewOptions,
): Promise<HubOverviewLoad> {
  const admin = createAdminClient()

  const { data: tenant } = await admin
    .from('tenants')
    .select('id, customer_hub_enabled, order_backend, convex_deployment_url')
    .eq('id', tenantId)
    .single()

  if (!tenant) return { ok: false, status: 404, error: 'Store not found.' }

  // The column is typed `string`; `resolveOrderBackend` validates the value itself.
  const backendFields = tenant as OrderBackendTenantFields & { customer_hub_enabled: boolean | null }
  if (!isCustomerHubOn(backendFields)) {
    return { ok: false, status: 403, error: 'Customer Hub is not enabled for this store.' }
  }

  const read = await fetchCustomerOrderFacts(
    { ...(tenant as Record<string, unknown>), id: tenantId } as never,
    { days: windowDays, includeLifetime: true, outletId, platformClient: admin as never },
  )

  const overview = buildCustomerHubOverview(read, {
    // Only the platform read sees every order, named or not; the ledger behind
    // other backends records named guests alone.
    tillComplete: resolveOrderBackend(backendFields) === 'platform',
  })
  const namesById = await fetchCustomerNames(admin, tenantId, topCustomerIds(overview.dashboard))

  return { ok: true, overview: { ...overview, dashboard: attachCustomerNames(overview.dashboard, namesById) } }
}

/**
 * Saved names for the dashboard's best customers. A failed lookup is logged and
 * leaves them unnamed (callers fall back to the number) rather than failing
 * the whole dashboard over a label.
 */
async function fetchCustomerNames(
  admin: SupabaseClient<Database>,
  tenantId: string,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await admin
    .from('customers')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .in('id', ids)
  if (error) {
    console.error('[hub-overview] customer names lookup failed', { tenantId, message: error.message })
    return new Map()
  }
  return new Map((data ?? []).flatMap((row) => (row.name?.trim() ? [[row.id, row.name.trim()] as const] : [])))
}
