'use client'

import { Component, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { MenuItem, Category, UpsellPairWithItems } from '@/types/database'

// Error boundary to catch rendering issues in tab panels
class TabErrorBoundary extends Component<
  { children: ReactNode; fallback: string },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: ReactNode; fallback: string }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
          <p className="text-sm font-medium text-destructive">
            Failed to load {this.props.fallback}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{this.state.error}</p>
          <button
            className="mt-3 text-xs text-primary underline"
            onClick={() => this.setState({ hasError: false, error: '' })}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// Lazy-load tab components for code splitting
const BcgMatrixTab = dynamic(
  () => import('@/components/admin/bcg-matrix-tab').then(mod => ({ default: mod.BcgMatrixTab })),
  { ssr: false, loading: () => <div className="p-8 text-center text-muted-foreground animate-pulse">Loading...</div> }
)

const UpsellPairsTab = dynamic(
  () => import('@/components/admin/upsell-pairs-tab').then(mod => ({ default: mod.UpsellPairsTab })),
  { ssr: false, loading: () => <div className="p-8 text-center text-muted-foreground animate-pulse">Loading...</div> }
)

const CheckoutUpsellSettingsTab = dynamic(
  () => import('@/components/admin/checkout-upsell-settings-tab').then(mod => ({ default: mod.CheckoutUpsellSettingsTab })),
  { ssr: false, loading: () => <div className="p-8 text-center text-muted-foreground animate-pulse">Loading...</div> }
)

const SmartPairSuggestionsTab = dynamic(
  () => import('@/components/admin/smart-pair-suggestions-tab').then(mod => ({ default: mod.SmartPairSuggestionsTab })),
  { ssr: false, loading: () => <div className="p-8 text-center text-muted-foreground animate-pulse">Loading...</div> }
)

const ComplementaryPairsTab = dynamic(
  () => import('@/components/admin/complementary-pairs-tab').then(mod => ({ default: mod.ComplementaryPairsTab })),
  { ssr: false, loading: () => <div className="p-8 text-center text-muted-foreground animate-pulse">Loading...</div> }
)

// ============================================
// Types
// ============================================

interface MenuItemWithCategory extends MenuItem {
  category: { id: string; name: string } | null
}

interface MenuEngineeringDashboardProps {
  menuItems: MenuItemWithCategory[]
  categories: Category[]
  upsellPairs: UpsellPairWithItems[]
  tenantId: string
  tenantSlug: string
  checkoutUpsellEnabled: boolean
  checkoutUpsellTitle: string
  checkoutUpsellSubtitle: string
  checkoutUpsellMaxItems: number
}

// ============================================
// Main Dashboard Component
// ============================================

export function MenuEngineeringDashboard({
  menuItems,
  categories,
  upsellPairs,
  tenantId,
  tenantSlug,
  checkoutUpsellEnabled,
  checkoutUpsellTitle,
  checkoutUpsellSubtitle,
  checkoutUpsellMaxItems,
}: MenuEngineeringDashboardProps) {
  return (
    <Tabs defaultValue="bcg" className="space-y-6">
      <TabsList>
        <TabsTrigger value="bcg">BCG Matrix</TabsTrigger>
        <TabsTrigger value="upsells">Upsell Pairs</TabsTrigger>
        <TabsTrigger value="checkout">Checkout Settings</TabsTrigger>
        <TabsTrigger value="smart-pairs">Smart Pairs</TabsTrigger>
        <TabsTrigger value="complementary">Complementary</TabsTrigger>
      </TabsList>

      <TabsContent value="bcg">
        <TabErrorBoundary fallback="BCG Matrix">
          <BcgMatrixTab
            menuItems={menuItems}
            categories={categories}
            tenantId={tenantId}
            tenantSlug={tenantSlug}
          />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="upsells">
        <TabErrorBoundary fallback="Upsell Pairs">
          <UpsellPairsTab
            menuItems={menuItems}
            upsellPairs={upsellPairs}
            tenantId={tenantId}
            tenantSlug={tenantSlug}
          />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="checkout">
        <TabErrorBoundary fallback="Checkout Settings">
          <CheckoutUpsellSettingsTab
            tenantId={tenantId}
            tenantSlug={tenantSlug}
            initialEnabled={checkoutUpsellEnabled}
            initialTitle={checkoutUpsellTitle}
            initialSubtitle={checkoutUpsellSubtitle}
            initialMaxItems={checkoutUpsellMaxItems}
            menuItems={menuItems}
          />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="smart-pairs">
        <TabErrorBoundary fallback="Smart Pairs">
          <SmartPairSuggestionsTab
            tenantId={tenantId}
            tenantSlug={tenantSlug}
          />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="complementary">
        <TabErrorBoundary fallback="Complementary Pairs">
          <ComplementaryPairsTab
            menuItems={menuItems}
            categories={categories}
            tenantId={tenantId}
            tenantSlug={tenantSlug}
          />
        </TabErrorBoundary>
      </TabsContent>
    </Tabs>
  )
}
