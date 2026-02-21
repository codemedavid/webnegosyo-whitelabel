import { redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getTenantBySlug, getCategoriesByTenant } from '@/lib/admin-service'
import { getMenuItemsByBcgClassification } from '@/lib/menu-engineering-service'
import { getUpsellPairsByTenant } from '@/lib/menu-engineering-service'
import { MenuEngineeringDashboard } from '@/components/admin/menu-engineering-dashboard'
import type { Tenant } from '@/types/database'

export default async function MenuEngineeringPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params

  const tenantData = await getTenantBySlug(tenantSlug)

  if (!tenantData) {
    return <div>Tenant not found</div>
  }

  const tenant: Tenant = tenantData

  // Feature guard: redirect if menu engineering is not enabled
  if (!tenant.menu_engineering_enabled) {
    redirect(`/${tenantSlug}/admin`)
  }

  // Fetch data in parallel
  const [menuItems, categories, upsellPairs] = await Promise.all([
    getMenuItemsByBcgClassification(tenant.id),
    getCategoriesByTenant(tenant.id),
    getUpsellPairsByTenant(tenant.id),
  ])

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/${tenantSlug}/admin` },
          { label: 'Menu Engineering' },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold">Menu Engineering</h1>
        <p className="text-muted-foreground">
          Classify items, manage upsell pairs, and configure checkout suggestions
        </p>
      </div>

      <MenuEngineeringDashboard
        menuItems={menuItems}
        categories={categories}
        upsellPairs={upsellPairs}
        tenantId={tenant.id}
        tenantSlug={tenantSlug}
        checkoutUpsellEnabled={tenant.checkout_upsell_enabled ?? false}
        checkoutUpsellTitle={tenant.checkout_upsell_title ?? 'Before you go...'}
        checkoutUpsellSubtitle={tenant.checkout_upsell_subtitle ?? 'You might also enjoy these items'}
        checkoutUpsellMaxItems={tenant.checkout_upsell_max_items ?? 4}
      />
    </div>
  )
}
