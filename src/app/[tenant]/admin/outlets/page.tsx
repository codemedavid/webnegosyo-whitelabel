import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug, getCachedCurrentUserRole } from '@/lib/cache'
import { canViewBranchDirectory } from '@/lib/outlets/branch-scope'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import { createSupabaseOutletRepository } from '@/lib/outlets/supabase-outlet-repository'
import { BranchDirectory } from '@/components/admin/branch-directory'
import { StorePeopleCard } from '@/components/admin/store-people-card'
import { buildBranchRoster } from '@/lib/outlets/branch-roster'
import { loadBranchOrders, loadBranchStaff } from '@/lib/outlets/branch-page-data'

export default async function AdminOutletsPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params

  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) {
    return <div>Tenant not found</div>
  }

  // Multi-branch is opt-in. With the flag off this route does not exist, so a
  // tenant can never reach a half-configured branches surface — and nothing
  // here runs a query for them.
  if (!isMultiBranchEnabled(tenant)) {
    notFound()
  }

  // This page names every branch the store has — addresses, hours, takings,
  // and now its people — so it is the owner's. Middleware already bounces a
  // branch manager; this is the layer that does not depend on which request
  // path reached the render.
  const caller = await getCachedCurrentUserRole()
  if (!caller || !canViewBranchDirectory(caller)) {
    notFound()
  }

  const [outlets, staff, orders] = await Promise.all([
    createSupabaseOutletRepository().listByTenant(tenant.id),
    loadBranchStaff(tenant.id),
    loadBranchOrders(tenant),
  ])

  // Built twice — here for the People card, and again inside the directory,
  // which owns the outlet list once the merchant starts reordering it. The
  // computation is a single pass over data already in memory.
  const roster = buildBranchRoster({ outlets, staff, orders })

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[{ label: 'Dashboard', href: `/${tenantSlug}/admin` }, { label: 'Branches' }]}
      />

      <div>
        <h1 className="text-3xl font-bold">Branches</h1>
        <p className="text-muted-foreground">
          Your physical outlets and the people who run them. Customers pick a branch before they
          browse, and the order records which branch fulfills it. All branches share the same menu.
        </p>
      </div>

      <BranchDirectory
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
        mapboxEnabled={tenant.mapbox_enabled ?? false}
        initialOutlets={outlets}
        staff={staff}
        orders={orders}
      />

      <StorePeopleCard
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
        outlets={outlets.map((outlet) => ({ id: outlet.id, name: outlet.name }))}
        storeWideMembers={roster.storeWideStaff}
        orphanedMembers={roster.orphanedStaff}
      />
    </div>
  )
}
