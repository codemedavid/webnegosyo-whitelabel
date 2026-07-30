import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getOrdersByTenant } from '@/lib/orders-service'
import { resolveOrderBackend } from '@/lib/order-backend'
import type { AnalyticsOrderLike } from './branch-analytics'
import type { RosterStaff } from './branch-roster'
import type { Tenant } from '@/types/database'

/**
 * What the Branches pages read, in one place.
 *
 * The index and a branch's own page ask the same two questions — who works
 * here, and what has been sold — so they ask them the same way. Splitting these
 * across two route files is how the index came to count staff the detail page
 * did not list.
 */

/**
 * Orders to compare branches over.
 *
 * Only the platform database is read. The other two backends keep the branch
 * inside an unindexed blob, so a comparison there would mean pulling every
 * order into memory — that belongs with the indexed `outletId` work, not here.
 * Returning null lets the page say so plainly instead of showing empty figures
 * that read as "no branch has sold anything".
 *
 * `getOrdersByTenant` applies the caller's own branch scope, so a branch admin
 * who somehow reaches these pages sees one branch's orders rather than the
 * comparison.
 */
export async function loadBranchOrders(tenant: Tenant): Promise<AnalyticsOrderLike[] | null> {
  if (resolveOrderBackend(tenant) !== 'platform') return null

  const result = await getOrdersByTenant(tenant.id)
  return Array.isArray(result) ? result : result.orders
}

/**
 * Every admin account on the store, owner included.
 *
 * The owner is returned rather than filtered here because the roster is what
 * decides who is a manageable member — one rule, applied once, instead of a
 * query and a view model that can disagree about whose row is whose.
 *
 * Read with the service-role client, exactly as `listStaffAction` does: the
 * caller has already been established as store-wide by the page.
 */
export async function loadBranchStaff(tenantId: string): Promise<RosterStaff[]> {
  const { data, error } = await createAdminClient()
    .from('app_users')
    .select('user_id, outlet_id, is_owner, display_name, email, permissions')
    .eq('tenant_id', tenantId)
    .eq('role', 'admin')
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as RosterStaff[]
}
