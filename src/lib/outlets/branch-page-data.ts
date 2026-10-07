import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { verifyTenantPermission } from '@/lib/admin-service'
import { resolveOrderBackend } from '@/lib/order-backend'
import { resolveBranchScope } from './branch-scope'
import { scopeOrdersQuery } from './branch-scope-query'
import { readPagesConcurrently } from '@/lib/dashboard/paged-read'
import { compareBranches, type AnalyticsOrderLike, type BranchComparisonRow } from './branch-analytics'
import type { RosterStaff } from './branch-roster'
import type { BranchMenuItem } from './branch-menu-item'
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
 * The only order columns a branch comparison reads: the branch carriers
 * (`outlet_id`, and `customer_data` for the branch id/name snapshot) plus the
 * takings. Everything else — every column of every order and an embedded
 * `order_items(*)` — was being read and then thrown away.
 */
const BRANCH_METRIC_COLUMNS = 'outlet_id, total, status, customer_data'

/** Page size is PostgREST's row cap; the ceiling bounds one shared-DB read. */
const BRANCH_METRIC_PAGING = { pageSize: 1000, maxRows: 50_000, concurrency: 4 } as const

/**
 * Takings per branch, computed here so the page ships a handful of rows to the
 * browser instead of the store's order history.
 *
 * The figures cover the store's order history (newest first, paged past the
 * API's 1000-row cap up to BRANCH_METRIC_PAGING.maxRows), through the same
 * `compareBranches`. What changed is that the comparison runs on the
 * server over four columns, where it used to run in the browser over full order
 * rows with their line items, serialized into the page.
 *
 * Only the platform database is read. The other two backends keep the branch
 * inside an unindexed blob, so a comparison there would mean pulling every
 * order into memory — that belongs with the indexed `outletId` work, not here.
 * Returning null lets the page say so plainly instead of showing empty figures
 * that read as "no branch has sold anything".
 *
 * The same gate and branch scope `getOrdersByTenant` applied: the caller needs
 * `orders` view, and a branch admin who somehow reaches these pages sees one
 * branch's orders rather than the comparison.
 */
export async function loadBranchMetrics(tenant: Tenant): Promise<BranchComparisonRow[] | null> {
  if (resolveOrderBackend(tenant) !== 'platform') return null

  const { userRole } = await verifyTenantPermission(tenant.id, 'orders', 'view')
  const supabase = await createClient()
  const scope = resolveBranchScope(userRole)

  // Paged past PostgREST's 1000-row cap: one bare read stopped at the newest
  // 1000 orders, so a busy store's branch figures silently covered days, not
  // its history. `id` breaks created_at ties so offset pages never overlap.
  const { rows, error } = await readPagesConcurrently<AnalyticsOrderLike>(
    async (from, to) => {
      const { data, error: pageError } = await scopeOrdersQuery(
        supabase.from('orders').select(BRANCH_METRIC_COLUMNS).eq('tenant_id', tenant.id),
        scope
      )
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)
      return { data: (data ?? null) as unknown as AnalyticsOrderLike[] | null, error: pageError }
    },
    BRANCH_METRIC_PAGING
  )

  if (error) throw new Error(error)
  return compareBranches(rows)
}

/**
 * The store-wide menu as the branch menu panel draws it — six columns, not
 * every variation, add-on and modifier JSON blob plus an embedded category,
 * all of which used to be serialized into the branch page for a list of names
 * and prices. Same order as the admin menu list (`order`, then `id`).
 */
export async function loadBranchMenuItems(tenantId: string): Promise<BranchMenuItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('menu_items')
    .select('id, name, category_id, price, discounted_price, is_available')
    .eq('tenant_id', tenantId)
    .order('order', { ascending: true })
    .order('id', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as BranchMenuItem[]
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
    .select('user_id, outlet_id, is_owner, display_name, email, permissions, default_tab')
    .eq('tenant_id', tenantId)
    .eq('role', 'admin')
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as RosterStaff[]
}
