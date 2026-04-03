'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  LayoutGrid,
  ArrowUpRight,
  GitBranch,
  ShoppingCart,
  AlertCircle,
  Eye,
} from 'lucide-react'
import type { Category, UpsellPairWithItems, TagDefinition, PairingRuleWithDetails } from '@/types/database'
import type { MenuItem } from '@/types/database'
import type { BundleWithSlots } from '@/lib/bundles-service'
import { UncoveredItemsDialog } from '@/components/admin/push-item-flow'

const LoadingPlaceholder = () => (
  <div className="p-8 text-center text-muted-foreground animate-pulse">Loading...</div>
)

const BundlesList = dynamic(
  () => import('@/components/admin/bundles-list').then(mod => ({ default: mod.BundlesList })),
  { ssr: false, loading: LoadingPlaceholder }
)

const CheckoutUpsellSettingsTab = dynamic(
  () => import('@/components/admin/checkout-upsell-settings-tab').then(mod => ({ default: mod.CheckoutUpsellSettingsTab })),
  { ssr: false, loading: LoadingPlaceholder }
)

const UpsellPairsTab = dynamic(
  () => import('@/components/admin/upsell-pairs-tab').then(mod => ({ default: mod.UpsellPairsTab })),
  { ssr: false, loading: LoadingPlaceholder }
)

const PairingRulesTab = dynamic(
  () => import('@/components/admin/pairing-rules-tab').then(mod => ({ default: mod.PairingRulesTab })),
  { ssr: false, loading: LoadingPlaceholder }
)

const UpsellPreviewPanel = dynamic(
  () => import('@/components/admin/upsell-preview-panel').then(mod => ({ default: mod.UpsellPreviewPanel })),
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
  pairingRulesEnabled: boolean
  initialPairingRules: PairingRuleWithDetails[]
  initialTagDefinitions: TagDefinition[]
}

interface TabDef {
  value: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  hidden?: boolean
}

export function BoostSalesDashboard({
  menuItems,
  categories,
  upsellPairs,
  bundles,
  tenantId,
  tenantSlug,
  checkoutUpsellEnabled,
  checkoutUpsellTitle,
  checkoutUpsellSubtitle,
  checkoutUpsellMaxItems,
  bundlesEnabled: _bundlesEnabled,
  pairingRulesEnabled,
  initialPairingRules,
  initialTagDefinitions,
}: BoostSalesDashboardProps) {
  const [showPreview, setShowPreview] = useState(false)
  const [showUncovered, setShowUncovered] = useState(false)
  const [activeTab, setActiveTab] = useState('bundles')

  const uncoveredItemIds = useMemo(() => {
    const inUpsell = new Set<string>()
    for (const pair of upsellPairs) {
      if (pair.is_active) {
        inUpsell.add(pair.source_item_id)
        inUpsell.add(pair.target_item_id)
      }
    }
    for (const item of menuItems) {
      if (item.show_in_checkout_upsell) inUpsell.add(item.id)
    }
    return menuItems.filter((i) => !inUpsell.has(i.id)).map((i) => i.id)
  }, [menuItems, upsellPairs])

  const tabStats = useMemo(() => {
    const activeBundles = bundles.filter(b => b.is_active).length
    const upgradePairs = upsellPairs.filter(p => p.pair_type === 'upgrade').length
    const checkoutPicks = menuItems.filter(i => i.show_in_checkout_upsell).length
    return { activeBundles, upgradePairs, checkoutPicks }
  }, [bundles, upsellPairs, menuItems])

  const tabs: TabDef[] = [
    {
      value: 'bundles',
      label: 'Combos & Bundles',
      icon: LayoutGrid,
      badge: tabStats.activeBundles > 0 ? `${tabStats.activeBundles} active` : undefined,
    },
    {
      value: 'upgrades',
      label: 'Upgrade Pairs',
      icon: ArrowUpRight,
      badge: tabStats.upgradePairs > 0 ? `${tabStats.upgradePairs} pairs` : undefined,
    },
    {
      value: 'rules',
      label: 'Pairing Rules',
      icon: GitBranch,
      hidden: !pairingRulesEnabled,
    },
    {
      value: 'checkout',
      label: 'Checkout Picks',
      icon: ShoppingCart,
      badge: tabStats.checkoutPicks > 0 ? `${tabStats.checkoutPicks} selected` : undefined,
    },
  ]

  const visibleTabs = tabs.filter(t => !t.hidden)

  return (
    <div className="space-y-6">
      {/* Action buttons */}
      <div className="flex items-center gap-3">
        {uncoveredItemIds.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowUncovered(true)}
          >
            <AlertCircle className="mr-2 h-4 w-4" />
            {uncoveredItemIds.length} uncovered items
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPreview(!showPreview)}
        >
          <Eye className="mr-2 h-4 w-4" />
          {showPreview ? 'Hide Preview' : 'Preview CX'}
        </Button>
      </div>

      {/* Uncovered items dialog */}
      <UncoveredItemsDialog
        open={showUncovered}
        onOpenChange={setShowUncovered}
        menuItems={menuItems}
        uncoveredItemIds={uncoveredItemIds}
      />

      {/* Preview panel */}
      {showPreview && (
        <UpsellPreviewPanel
          menuItems={menuItems}
          upsellPairs={upsellPairs}
          bundles={bundles}
          tenantId={tenantId}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="border-b border-border overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-8 min-w-max">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.value
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={`flex items-center gap-2 pb-4 border-b-2 transition-all ${
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-sm font-semibold">{tab.label}</span>
                  {tab.badge && (
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <TabsContent value="bundles">
          <BundlesList
            bundles={bundles}
            tenantId={tenantId}
            tenantSlug={tenantSlug}
          />
        </TabsContent>

        <TabsContent value="upgrades">
          <UpsellPairsTab
            menuItems={menuItems}
            upsellPairs={upsellPairs}
            tenantId={tenantId}
            tenantSlug={tenantSlug}
          />
        </TabsContent>

        {pairingRulesEnabled && (
          <TabsContent value="rules">
            <PairingRulesTab
              tenantId={tenantId}
              tenantSlug={tenantSlug}
              categories={categories}
              menuItems={menuItems}
              initialRules={initialPairingRules}
              initialTags={initialTagDefinitions}
            />
          </TabsContent>
        )}

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
      </Tabs>
    </div>
  )
}
