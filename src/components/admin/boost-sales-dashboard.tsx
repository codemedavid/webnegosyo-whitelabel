'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import {
  Search,
  LayoutGrid,
  ArrowUpRight,
  Sparkles,
  GitBranch,
  ShoppingCart,
  BarChart3,
  AlertCircle,
} from 'lucide-react'
import type { Category, UpsellPairWithItems, TagDefinition, PairingRuleWithDetails } from '@/types/database'
import type { MenuItem } from '@/types/database'
import type { BundleWithSlots } from '@/lib/bundles-service'
import { BoostSalesStatsBar } from '@/components/admin/boost-sales-stats-bar'
import { PushItemFlow } from '@/components/admin/push-item-flow'

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

const BoostSalesPerformanceTab = dynamic(
  () => import('@/components/admin/boost-sales-performance-tab').then(mod => ({ default: mod.BoostSalesPerformanceTab })),
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
  convexDeploymentUrl: string | null
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
  convexDeploymentUrl,
  pairingRulesEnabled,
  initialPairingRules,
  initialTagDefinitions,
}: BoostSalesDashboardProps) {
  const [showPreview, setShowPreview] = useState(false)
  const [activeTab, setActiveTab] = useState('bundles')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const itemsNotInUpsellIds = useMemo(() => {
    const inUpsell = new Set<string>()
    for (const pair of upsellPairs) {
      inUpsell.add(pair.source_item_id)
      inUpsell.add(pair.target_item_id)
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

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const item of menuItems) {
      const catName = item.category?.name ?? 'Uncategorized'
      counts[catName] = (counts[catName] || 0) + 1
    }
    return counts
  }, [menuItems])

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
      value: 'pairs',
      label: 'Pair Suggestions',
      icon: Sparkles,
      badge: 'Smart',
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
    {
      value: 'performance',
      label: 'Performance',
      icon: BarChart3,
    },
  ]

  const visibleTabs = tabs.filter(t => !t.hidden)

  return (
    <div className="space-y-8">
      {/* Revenue Pulse Bar */}
      <BoostSalesStatsBar
        menuItems={menuItems}
        upsellPairs={upsellPairs}
        bundles={bundles}
        onTogglePreview={() => setShowPreview(!showPreview)}
        showPreview={showPreview}
        convexDeploymentUrl={convexDeploymentUrl}
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

      {/* Search + Category Filters + Coverage Alert */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 max-w-2xl">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search menu items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-muted/50 border-none"
            />
          </div>

          {/* Category pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button
              className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                selectedCategory === null
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
              onClick={() => setSelectedCategory(null)}
            >
              All
            </button>
            {Object.entries(categoryCounts)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 4)
              .map(([catName, count]) => (
                <button
                  key={catName}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                    selectedCategory === catName
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                  onClick={() =>
                    setSelectedCategory(selectedCategory === catName ? null : catName)
                  }
                >
                  {catName} ({count})
                </button>
              ))}
          </div>
        </div>

        {/* Uncovered items alert */}
        {itemsNotInUpsellIds.length > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-2 bg-primary/5 rounded-lg border border-primary/10 text-xs font-semibold text-primary/80">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {itemsNotInUpsellIds.length} items have no upsell coverage
          </div>
        )}
      </div>

      {/* Push Item Flow */}
      <PushItemFlow
        menuItems={menuItems}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        itemsNotInUpsell={itemsNotInUpsellIds}
      />

      {/* Enhanced Tab Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        {/* Custom tab bar with icons + badges + underline style */}
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

        <TabsContent value="pairs">
          <SmartPairSuggestionsTab
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

        <TabsContent value="performance">
          <BoostSalesPerformanceTab
            tenantId={tenantId}
            convexDeploymentUrl={convexDeploymentUrl}
          />
        </TabsContent>
      </Tabs>

      {/* Performance Snapshot (always visible at bottom) */}
      <PerformanceSnapshot convexDeploymentUrl={convexDeploymentUrl} />
    </div>
  )
}

/* ------------------------------------------------------------------
 * Performance Snapshot — compact metrics strip below the tabs
 * ------------------------------------------------------------------ */

function PerformanceSnapshot({
  convexDeploymentUrl,
}: {
  convexDeploymentUrl: string | null
}) {
  return (
    <section className="space-y-6 pt-8 border-t border-border">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">Performance Snapshot</h3>
        {convexDeploymentUrl ? (
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live data updating
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
            Analytics not connected
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Acceptance Rate"
          value={convexDeploymentUrl ? '—' : '—'}
          trend={convexDeploymentUrl ? undefined : undefined}
        />
        <MetricCard
          label="Upsell Revenue"
          value={convexDeploymentUrl ? '—' : '—'}
          trend={convexDeploymentUrl ? undefined : undefined}
        />
        <MetricCard
          label="Avg. Upsell Value"
          value={convexDeploymentUrl ? '—' : '—'}
        />
        <SetupProgressCard />
      </div>
    </section>
  )
}

function MetricCard({
  label,
  value,
  trend,
}: {
  label: string
  value: string
  trend?: { text: string; positive: boolean }
}) {
  return (
    <div className="bg-card p-5 rounded-xl shadow-sm border border-border">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
        {label}
      </p>
      <div className="flex items-end justify-between">
        <span className="text-2xl font-bold">{value}</span>
        {trend && (
          <span
            className={`text-[10px] font-bold flex items-center ${
              trend.positive ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {trend.text}
          </span>
        )}
      </div>
    </div>
  )
}

function SetupProgressCard() {
  return (
    <div className="bg-primary p-5 rounded-xl shadow-lg shadow-primary/10">
      <p className="text-[10px] font-bold text-primary-foreground/60 uppercase tracking-widest mb-1">
        Setup Progress
      </p>
      <div className="flex flex-col gap-2 mt-2">
        <div className="flex justify-between text-[10px] font-bold text-primary-foreground">
          <span>Connect analytics to unlock</span>
        </div>
        <div className="h-1.5 w-full bg-primary-foreground/20 rounded-full overflow-hidden">
          <div className="h-full bg-primary-foreground w-[25%] transition-all" />
        </div>
      </div>
    </div>
  )
}
