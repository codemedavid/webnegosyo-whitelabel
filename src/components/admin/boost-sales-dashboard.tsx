'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Eye } from 'lucide-react'
import type { Category, UpsellPairWithItems } from '@/types/database'
import type { MenuItem } from '@/types/database'
import type { BundleWithSlots } from '@/lib/bundles-service'

const LoadingPlaceholder = () => (
  <div className="p-8 text-center text-muted-foreground animate-pulse">Loading...</div>
)

// Lazy-load tab components
const BundlesList = dynamic(
  () => import('@/components/admin/bundles-list').then(mod => ({ default: mod.BundlesList })),
  { ssr: false, loading: LoadingPlaceholder }
)

const SmartPairSuggestionsTab = dynamic(
  () => import('@/components/admin/smart-pair-suggestions-tab').then(mod => ({ default: mod.SmartPairSuggestionsTab })),
  { ssr: false, loading: LoadingPlaceholder }
)

const CheckoutUpsellSettingsTab = dynamic(
  () => import('@/components/admin/checkout-upsell-settings-tab').then(mod => ({ default: mod.CheckoutUpsellSettingsTab })),
  { ssr: false, loading: LoadingPlaceholder }
)

interface MenuItemWithCategory extends MenuItem {
  category: { id: string; name: string } | null
}

interface BoostSalesDashboardProps {
  menuItems: MenuItemWithCategory[]
  categories: Category[]
  upsellPairs: UpsellPairWithItems[]
  bundles: BundleWithSlots[]
  tenantId: string
  tenantSlug: string
  checkoutUpsellEnabled: boolean
  checkoutUpsellTitle: string
  checkoutUpsellSubtitle: string
  checkoutUpsellMaxItems: number
  bundlesEnabled: boolean
  convexDeploymentUrl: string | null
}

export function BoostSalesDashboard({
  menuItems,
  categories: _categories,
  upsellPairs: _upsellPairs,
  bundles,
  tenantId,
  tenantSlug,
  checkoutUpsellEnabled,
  checkoutUpsellTitle,
  checkoutUpsellSubtitle,
  checkoutUpsellMaxItems,
  bundlesEnabled: _bundlesEnabled,
  convexDeploymentUrl: _convexDeploymentUrl,
}: BoostSalesDashboardProps) {
  const [showPreview, setShowPreview] = useState(false)

  return (
    <div className="space-y-6">
      {/* Quick Stats Bar — will be added in Task 6 */}

      {/* Push Item Flow — will be added in Task 7 */}

      {/* Preview button */}
      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPreview(!showPreview)}
        >
          <Eye className="mr-2 h-4 w-4" />
          Preview Customer Experience
        </Button>
      </div>

      {/* Tab Navigation */}
      <Tabs defaultValue="bundles" className="space-y-6">
        <TabsList>
          <TabsTrigger value="bundles">Combos &amp; Bundles</TabsTrigger>
          <TabsTrigger value="pairs">Pair Suggestions</TabsTrigger>
          <TabsTrigger value="checkout">Checkout Picks</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="bundles">
          <BundlesList
            bundles={bundles}
            tenantId={tenantId}
            tenantSlug={tenantSlug}
          />
        </TabsContent>

        <TabsContent value="pairs">
          <SmartPairSuggestionsTab
            tenantId={tenantId}
            tenantSlug={tenantSlug}
          />
        </TabsContent>

        <TabsContent value="checkout">
          <CheckoutUpsellSettingsTab
            tenantId={tenantId}
            tenantSlug={tenantSlug}
            initialEnabled={checkoutUpsellEnabled}
            initialTitle={checkoutUpsellTitle}
            initialSubtitle={checkoutUpsellSubtitle}
            initialMaxItems={checkoutUpsellMaxItems}
            menuItems={menuItems}
          />
        </TabsContent>

        <TabsContent value="performance">
          <div className="rounded-lg border p-8 text-center text-muted-foreground">
            <p className="text-lg font-semibold mb-2">Performance Analytics</p>
            <p className="text-sm">Coming in Task 11 — will show upsell acceptance rates, revenue impact, and channel breakdown.</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
