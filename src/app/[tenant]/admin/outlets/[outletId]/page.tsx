import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug, getCachedCurrentUserRole } from '@/lib/cache'
import { canViewBranchDirectory } from '@/lib/outlets/branch-scope'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import { createSupabaseOutletRepository } from '@/lib/outlets/supabase-outlet-repository'
import { buildBranchRoster } from '@/lib/outlets/branch-roster'
import { loadBranchOrders, loadBranchStaff } from '@/lib/outlets/branch-page-data'
import { BranchDetail } from '@/components/admin/branch-detail'

export default async function AdminBranchPage({
  params,
}: {
  params: Promise<{ tenant: string; outletId: string }>
}) {
  const { tenant: tenantSlug, outletId } = await params

  const tenant = await getCachedTenantBySlug(tenantSlug)
  if (!tenant) {
    return <div>Tenant not found</div>
  }

  if (!isMultiBranchEnabled(tenant)) {
    notFound()
  }

  // `isStoreWideAdminPath` gates the whole `outlets` section in middleware, so a
  // branch manager is bounced before this renders. Re-checked here because
  // middleware does not cover every render path — and this page carries another
  // branch's takings and its people.
  const caller = await getCachedCurrentUserRole()
  if (!caller || !canViewBranchDirectory(caller)) {
    notFound()
  }

  const [outlets, staff, orders] = await Promise.all([
    createSupabaseOutletRepository().listByTenant(tenant.id),
    loadBranchStaff(tenant.id),
    loadBranchOrders(tenant),
  ])

  const roster = buildBranchRoster({ outlets, staff, orders })
  // Found through the roster rather than by a second query: the branch on
  // screen is then the same object the index counted staff and takings for.
  const entry = roster.branches.find((branch) => branch.outlet.id === outletId)
  if (!entry) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/${tenantSlug}/admin` },
          { label: 'Branches', href: `/${tenantSlug}/admin/outlets` },
          { label: entry.outlet.name },
        ]}
      />

      <BranchDetail
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
        outlet={entry.outlet}
        mapboxEnabled={tenant.mapbox_enabled ?? false}
        outlets={outlets.map((outlet) => ({ id: outlet.id, name: outlet.name }))}
        members={entry.staff}
        storeWideMembers={roster.storeWideStaff}
        metrics={entry.metrics}
        hasMetrics={roster.hasMetrics}
      />
    </div>
  )
}
