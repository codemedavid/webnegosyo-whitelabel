import { Suspense } from 'react'
import { getCachedTenantBySlug } from '@/lib/cache'
import { getBoostMenu } from '@/lib/boost/workspace'
import { PickedTogetherSection, PickedTogetherSkeleton } from '@/components/admin/boost/picked-together-section'
import { ProductAnalyticsWrapper } from '@/components/admin/product-analytics-wrapper'

interface ProductAnalyticsPageProps {
  params: Promise<{ tenant: string }>
}

export default async function ProductAnalyticsPage({ params }: ProductAnalyticsPageProps) {
  const { tenant } = await params
  // The request-cached tenant the admin layout already read: no extra query.
  const tenantData = await getCachedTenantBySlug(tenant)

  // Basic per-product SALES reporting (units, revenue, last order) only needs
  // Convex. The advanced BCG/cost/recommendation layer is gated separately by
  // menu_engineering_enabled inside the content component, so we no longer
  // redirect away when the flag is off.
  if (!tenantData) return null

  // "Picked together" reads whichever order backend the store uses, so every
  // store gets it — not only the ones with Convex.
  const pickedTogether = (
    <Suspense fallback={<PickedTogetherSkeleton />}>
      <PickedTogetherSection tenant={{ id: tenantData.id }} className="mb-6" />
    </Suspense>
  )

  if (!tenantData.convex_deployment_url) {
    return (
      <div className="p-6">
        <h1 className="mb-4 text-2xl font-bold">Product Analytics</h1>
        {pickedTogether}
        <p className="text-muted-foreground">
          Per-product sales reporting requires Convex to be configured for this tenant.
          Please contact support to enable real-time features.
        </p>
      </div>
    )
  }

  // The full menu so EVERY available product is listed — including items with
  // zero sales (which never get a Convex productAnalytics row). menu_items.id
  // (uuid) is the same key as productAnalytics.menuItemId. Read through
  // getBoostMenu: it is request-cached, and "Picked together" above reads the
  // same menu in this render — one menu query, not two.
  const menu = await getBoostMenu({ id: tenantData.id })
  const menuItems = menu.items
    .map((item) => ({ id: item.id, name: item.name, isAvailable: item.isAvailable }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="p-6">
      {pickedTogether}
      <ProductAnalyticsWrapper
        convexUrl={tenantData.convex_deployment_url}
        menuItems={menuItems}
        menuEngineeringEnabled={!!tenantData.menu_engineering_enabled}
      />
    </div>
  )
}
