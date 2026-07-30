import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug, getCachedCurrentUserRole } from '@/lib/cache'
import { canViewBranchDirectory } from '@/lib/outlets/branch-scope'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import { createSupabaseOutletRepository } from '@/lib/outlets/supabase-outlet-repository'
import { OutletsManager } from '@/components/admin/outlets-manager'
import { BranchComparisonTable } from '@/components/admin/branch-comparison-table'
import { getOrdersByTenant } from '@/lib/orders-service'
import { resolveOrderBackend } from '@/lib/order-backend'
import type { AnalyticsOrderLike } from '@/lib/outlets/branch-analytics'
import type { Tenant } from '@/types/database'

/**
 * Orders to compare branches over.
 *
 * Only the platform database is read. The other two backends keep the branch
 * inside an unindexed blob, so a comparison there would mean pulling every
 * order into memory — that belongs with the indexed `outletId` work, not here.
 * Returning null lets the page say so plainly instead of showing an empty
 * table that reads as "no branch has sold anything".
 *
 * `getOrdersByTenant` applies the caller's own branch scope, so a branch admin
 * who reaches this page sees one row — its own — rather than the comparison.
 */
async function loadComparableOrders(tenant: Tenant): Promise<AnalyticsOrderLike[] | null> {
  if (resolveOrderBackend(tenant) !== 'platform') return null

  const result = await getOrdersByTenant(tenant.id)
  return Array.isArray(result) ? result : result.orders
}

export default async function AdminOutletsPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params

  const tenantData = await getCachedTenantBySlug(tenantSlug)
  if (!tenantData) {
    return <div>Tenant not found</div>
  }
  const tenant: Tenant = tenantData

  // Multi-branch is opt-in. With the flag off this route does not exist, so a
  // tenant can never reach a half-configured branches surface — and nothing
  // here runs a query for them.
  if (!isMultiBranchEnabled(tenant)) {
    notFound()
  }

  // This page names every branch the store has — addresses, hours, takings —
  // so it is the owner's. Middleware already bounces a branch manager; this is
  // the layer that does not depend on which request path reached the render.
  const caller = await getCachedCurrentUserRole()
  if (!caller || !canViewBranchDirectory(caller)) {
    notFound()
  }

  const outlets = await createSupabaseOutletRepository().listByTenant(tenant.id)
  const comparableOrders = await loadComparableOrders(tenant)

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[{ label: 'Dashboard', href: `/${tenantSlug}/admin` }, { label: 'Branches' }]}
      />

      <div>
        <h1 className="text-3xl font-bold">Branches</h1>
        <p className="text-muted-foreground">
          Your physical outlets. Customers pick one before they browse, and the order records which
          branch fulfills it. All branches share the same menu.
        </p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Branch performance</h2>
          <p className="text-sm text-muted-foreground">
            How each branch is doing against the others. Cancelled orders are excluded, so these
            figures match your dashboard.
          </p>
        </div>

        {comparableOrders === null ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Branch comparison is available for stores whose orders are on the platform database.
            This store uses a different order backend.
          </p>
        ) : (
          <BranchComparisonTable orders={comparableOrders} />
        )}
      </section>

      <OutletsManager
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
        mapboxEnabled={tenant.mapbox_enabled ?? false}
        initialOutlets={outlets}
      />
    </div>
  )
}
