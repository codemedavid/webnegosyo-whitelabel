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
  Eye as EyeIcon,
  ShoppingBag,
  CreditCard,
  ChevronRight,
} from 'lucide-react'
import type { Category, UpsellPairWithItems, TagDefinition, PairingRuleWithDetails, MenuItemWithCategory } from '@/types/database'
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
  subtitle?: string
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  bundlesEnabled,
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
    for (const bundle of bundles) {
      if (bundle.is_active) {
        for (const slot of bundle.slots) {
          if (slot.included_item_ids) {
            for (const id of slot.included_item_ids) inUpsell.add(id)
          }
        }
      }
    }
    for (const item of menuItems) {
      if (item.show_in_checkout_upsell) inUpsell.add(item.id)
    }
    return menuItems.filter((i) => !inUpsell.has(i.id)).map((i) => i.id)
  }, [menuItems, upsellPairs, bundles])

  const tabStats = useMemo(() => {
    const activeBundles = bundles.filter(b => b.is_active).length
    const upgradePairs = upsellPairs.filter(p => p.pair_type === 'upgrade').length
    const activeRules = initialPairingRules.filter(r => r.is_active).length
    const checkoutPicks = menuItems.filter(i => i.show_in_checkout_upsell).length
    return { activeBundles, upgradePairs, activeRules, checkoutPicks }
  }, [bundles, upsellPairs, initialPairingRules, menuItems])

  const funnelSteps = [
    {
      icon: EyeIcon,
      title: 'Product Page',
      subtitle: 'Suggest an upgrade before they order',
      count: tabStats.upgradePairs,
      unit: 'active pair',
    },
    {
      icon: ShoppingBag,
      title: 'After Add to Cart',
      subtitle: 'Recommend items that go well together',
      count: tabStats.activeRules,
      unit: 'active rule',
    },
    {
      icon: CreditCard,
      title: 'Checkout',
      subtitle: 'Last chance to add more items',
      count: tabStats.checkoutPicks,
      unit: 'item',
    },
  ]

  const tabs: TabDef[] = [
    {
      value: 'bundles',
      label: 'Combos & Bundles',
      icon: LayoutGrid,
      badge: tabStats.activeBundles > 0 ? `${tabStats.activeBundles} active` : undefined,
    },
    {
      value: 'upgrades',
      label: 'Upgrade Prompts',
      subtitle: 'Suggest a bigger option',
      icon: ArrowUpRight,
      badge: tabStats.upgradePairs > 0 ? `${tabStats.upgradePairs} pairs` : undefined,
    },
    {
      value: 'rules',
      label: 'Pair Suggestions',
      subtitle: 'Recommend items that go together',
      icon: GitBranch,
      hidden: !pairingRulesEnabled,
    },
    {
      value: 'checkout',
      label: 'Checkout Offers',
      subtitle: 'Last-chance items before payment',
      icon: ShoppingCart,
      badge: tabStats.checkoutPicks > 0 ? `${tabStats.checkoutPicks} selected` : undefined,
    },
  ]

  const visibleTabs = tabs.filter(t => !t.hidden)

  return (
    <div className="space-y-6">
      {/* Hero Funnel */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-foreground">
            Your customers see upsells at 3 key moments
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Set up each touchpoint to increase your average order value.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-3">
          {funnelSteps.map((step, i) => {
            const StepIcon = step.icon
            return (
              <div key={step.title} className="contents">
                <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <StepIcon className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{step.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{step.subtitle}</p>
                    <p className="text-xs font-medium mt-2 text-primary">
                      {step.count > 0
                        ? `${step.count} ${step.unit}${step.count !== 1 ? 's' : ''}`
                        : 'Not set up yet'}
                    </p>
                  </div>
                </div>
                {i < funnelSteps.length - 1 && (
                  <div className="hidden md:flex items-center justify-center">
                    <ChevronRight className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

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
          <EyeIcon className="mr-2 h-4 w-4" />
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
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="border-b border-border overflow-x-auto scrollbar-hide">
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
                  <div className="text-left">
                    <span className="text-sm font-semibold">{tab.label}</span>
                    {isActive && tab.subtitle && (
                      <p className="text-[11px] font-normal text-muted-foreground leading-tight">{tab.subtitle}</p>
                    )}
                  </div>
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
