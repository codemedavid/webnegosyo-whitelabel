import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { PickedTogetherSection, PickedTogetherSkeleton } from '@/components/admin/boost/picked-together-section'
import { ProductAnalyticsWrapper } from '@/components/admin/product-analytics-wrapper'

interface ProductAnalyticsPageProps {
  params: Promise<{ tenant: string }>
}

export default async function ProductAnalyticsPage({ params }: ProductAnalyticsPageProps) {
  const { tenant } = await params
  const supabase = await createClient()

  const { data: tenantData } = await supabase
    .from('tenants')
    .select('id, convex_deployment_url, menu_engineering_enabled')
    .eq('slug', tenant)
    .single()

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

  // Fetch the full menu so EVERY available product is listed — including items
  // with zero sales (which never get a Convex productAnalytics row). menu_items.id
  // (uuid) is the same key as productAnalytics.menuItemId.
  const { data: menuItemsData } = await supabase
    .from('menu_items')
    .select('id, name, is_available')
    .eq('tenant_id', tenantData.id)
    .order('name', { ascending: true })

  const menuItems = (menuItemsData ?? []).map((m) => ({
    id: m.id as string,
    name: m.name as string,
    isAvailable: (m.is_available as boolean | null) ?? true,
  }))

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
