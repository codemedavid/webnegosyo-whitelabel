import { redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug, getCachedCategoriesByTenant } from '@/lib/cache'
import { getMenuItemsByBcgClassification, getUpsellPairsByTenant } from '@/lib/menu-engineering-service'
import { getBundlesByTenant } from '@/lib/bundles-service'
import { BoostSalesDashboard } from '@/components/admin/boost-sales-dashboard'

export default async function BoostSalesPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params

  const tenant = await getCachedTenantBySlug(tenantSlug)

  if (!tenant) {
    return <div>Tenant not found</div>
  }

  if (!tenant.menu_engineering_enabled) {
    redirect(`/${tenantSlug}/admin`)
  }

  const [menuItems, categories, upsellPairs, bundles] = await Promise.all([
    getMenuItemsByBcgClassification(tenant.id),
    getCachedCategoriesByTenant(tenant.id),
    getUpsellPairsByTenant(tenant.id),
    getBundlesByTenant(tenant.id),
  ])

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/${tenantSlug}/admin` },
          { label: 'Boost Sales' },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold">Boost Sales</h1>
        <p className="text-muted-foreground">
          Push your best items, create combos, and track what&apos;s working
        </p>
      </div>

      <BoostSalesDashboard
        menuItems={menuItems}
        categories={categories}
        upsellPairs={upsellPairs}
        bundles={bundles}
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
        checkoutUpsellEnabled={tenant.checkout_upsell_enabled ?? false}
        checkoutUpsellTitle={tenant.checkout_upsell_title ?? 'Before you go...'}
        checkoutUpsellSubtitle={tenant.checkout_upsell_subtitle ?? 'You might also enjoy these items'}
        checkoutUpsellMaxItems={tenant.checkout_upsell_max_items ?? 4}
        bundlesEnabled={tenant.bundles_enabled ?? false}
        convexDeploymentUrl={tenant.convex_deployment_url ?? null}
      />
    </div>
  )
}
