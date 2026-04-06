import { redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug, getCachedCategoriesByTenant } from '@/lib/cache'
import { getMenuItemsByBcgClassification, getUpsellPairsByTenant } from '@/lib/menu-engineering-service'
import { getBundlesByTenant } from '@/lib/bundles-service'
import { getPairingRules } from '@/lib/pairing-rules-service'
import { getTagDefinitions } from '@/lib/tags-service'
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

  const [menuItems, categories, upsellPairs, bundles, pairingRules, tagDefinitions] = await Promise.all([
    getMenuItemsByBcgClassification(tenant.id),
    getCachedCategoriesByTenant(tenant.id),
    getUpsellPairsByTenant(tenant.id),
    getBundlesByTenant(tenant.id),
    tenant.pairing_rules_enabled ? getPairingRules(tenant.id) : Promise.resolve([]),
    tenant.pairing_rules_enabled ? getTagDefinitions(tenant.id) : Promise.resolve([]),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Breadcrumbs
            items={[
              { label: 'Dashboard', href: `/${tenantSlug}/admin` },
              { label: 'Boost Sales' },
            ]}
          />
          <h1 className="text-2xl font-bold mt-2">Boost Sales</h1>
          <p className="text-sm text-muted-foreground">
            Set up upsell moments across your customer&apos;s ordering journey
          </p>
        </div>
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
        pairingRulesEnabled={tenant.pairing_rules_enabled ?? false}
        initialPairingRules={pairingRules}
        initialTagDefinitions={tagDefinitions}
      />
    </div>
  )
}
