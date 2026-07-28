import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug } from '@/lib/cache'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import { createSupabaseOutletRepository } from '@/lib/outlets/supabase-outlet-repository'
import { OutletsManager } from '@/components/admin/outlets-manager'
import type { Tenant } from '@/types/database'

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

  const outlets = await createSupabaseOutletRepository().listByTenant(tenant.id)

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

      <OutletsManager tenantId={tenant.id} tenantSlug={tenantSlug} initialOutlets={outlets} />
    </div>
  )
}
