# Boost Sales Dashboard Simplification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip the Boost Sales dashboard from ~10 visual zones / 6 tabs down to 1 header row / 3-4 tabs by deleting dead code, placeholder analytics, and unused pairing methods.

**Architecture:** Surgical deletion — remove 5 component files, gut the dashboard component, rewrite Push Item Flow as a simple dialog. No new abstractions.

**Tech Stack:** Next.js 15 App Router, React, shadcn/ui Dialog, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-04-boost-sales-simplification-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/admin/boost-sales-stats-bar.tsx` | Delete | Was stats bar — removed |
| `src/components/admin/boost-sales-performance-tab.tsx` | Delete | Was placeholder analytics — removed |
| `src/components/admin/smart-pair-suggestions-tab.tsx` | Delete | Was AI pair suggestions — removed |
| `src/components/admin/complementary-pairs-tab.tsx` | Delete | Was dead code — removed |
| `src/components/admin/menu-engineering-dashboard.tsx` | Delete | Old dashboard, no importers — dead code |
| `src/components/admin/push-item-flow.tsx` | Rewrite | Becomes uncovered-items dialog (~80 lines) |
| `src/components/admin/boost-sales-dashboard.tsx` | Simplify | Remove dead imports, state, memos, inline components (~200 lines) |
| `src/app/[tenant]/admin/boost-sales/page.tsx` | Simplify | Remove `convexDeploymentUrl` prop |

---

### Task 1: Delete dead component files

**Files:**
- Delete: `src/components/admin/boost-sales-stats-bar.tsx`
- Delete: `src/components/admin/boost-sales-performance-tab.tsx`
- Delete: `src/components/admin/smart-pair-suggestions-tab.tsx`
- Delete: `src/components/admin/complementary-pairs-tab.tsx`
- Delete: `src/components/admin/menu-engineering-dashboard.tsx`

- [ ] **Step 1: Delete the 5 files**

```bash
rm src/components/admin/boost-sales-stats-bar.tsx
rm src/components/admin/boost-sales-performance-tab.tsx
rm src/components/admin/smart-pair-suggestions-tab.tsx
rm src/components/admin/complementary-pairs-tab.tsx
rm src/components/admin/menu-engineering-dashboard.tsx
```

- [ ] **Step 2: Verify no other source files import them**

```bash
grep -r "boost-sales-stats-bar\|boost-sales-performance-tab\|smart-pair-suggestions-tab\|complementary-pairs-tab\|menu-engineering-dashboard" src/ --include="*.ts" --include="*.tsx"
```

Expected: No results (the only importer was `boost-sales-dashboard.tsx` which we fix in Task 2, and `menu-engineering-dashboard.tsx` which we just deleted).

- [ ] **Step 3: Commit**

```bash
git add -A src/components/admin/boost-sales-stats-bar.tsx \
  src/components/admin/boost-sales-performance-tab.tsx \
  src/components/admin/smart-pair-suggestions-tab.tsx \
  src/components/admin/complementary-pairs-tab.tsx \
  src/components/admin/menu-engineering-dashboard.tsx
git commit -m "refactor: delete dead boost-sales components

Remove stats bar, performance tab, smart pair suggestions,
complementary pairs tab, and old menu engineering dashboard.
All either placeholder-only, unused, or superseded."
```

---

### Task 2: Simplify the dashboard component

**Files:**
- Modify: `src/components/admin/boost-sales-dashboard.tsx`

- [ ] **Step 1: Replace the entire file with the simplified version**

Replace `src/components/admin/boost-sales-dashboard.tsx` with:

```tsx
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
```

- [ ] **Step 2: Verify the file compiles**

```bash
npx tsc --noEmit src/components/admin/boost-sales-dashboard.tsx 2>&1 | head -20
```

Expected: May show errors for `UncoveredItemsDialog` not existing yet (created in Task 3). Other imports should resolve.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/boost-sales-dashboard.tsx
git commit -m "refactor: simplify boost-sales dashboard

Remove stats bar, search/category pills, Push Item Flow,
Performance Snapshot, Smart Pairs tab, and Performance tab.
Dashboard drops from 463 to ~200 lines. Add action buttons
for uncovered items dialog and Preview CX in header area."
```

---

### Task 3: Rewrite Push Item Flow as uncovered-items dialog

**Files:**
- Rewrite: `src/components/admin/push-item-flow.tsx`

- [ ] **Step 1: Replace the entire file**

Replace `src/components/admin/push-item-flow.tsx` with:

```tsx
'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { formatPrice } from '@/lib/cart-utils'
import type { MenuItem } from '@/types/database'

interface MenuItemWithCategory extends MenuItem {
  category: { id: string; name: string } | null
}

interface UncoveredItemsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  menuItems: MenuItemWithCategory[]
  uncoveredItemIds: string[]
}

export function UncoveredItemsDialog({
  open,
  onOpenChange,
  menuItems,
  uncoveredItemIds,
}: UncoveredItemsDialogProps) {
  const [search, setSearch] = useState('')

  const uncoveredItems = useMemo(() => {
    const idSet = new Set(uncoveredItemIds)
    let items = menuItems.filter((i) => idSet.has(i.id))
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.category?.name.toLowerCase().includes(q)
      )
    }
    return items
  }, [menuItems, uncoveredItemIds, search])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Uncovered Items</DialogTitle>
          <DialogDescription>
            {uncoveredItemIds.length} menu items are not in any upsell, bundle, or checkout pick.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {uncoveredItems.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {search ? 'No items match your search.' : 'All items are covered!'}
            </p>
          ) : (
            <ul className="divide-y">
              {uncoveredItems.map((item) => (
                <li key={item.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{item.name}</p>
                    {item.category?.name && (
                      <p className="text-xs text-muted-foreground">{item.category.name}</p>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {formatPrice(item.price)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify no remaining imports of old exports**

```bash
grep -r "PushItemFlow\|PushItemFlowProps\|PlacementResult\|PLACEMENT_LABELS" src/ --include="*.ts" --include="*.tsx"
```

Expected: No results (dashboard no longer imports `PushItemFlow`).

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/push-item-flow.tsx
git commit -m "refactor: rewrite push-item-flow as uncovered-items dialog

Replace 258-line Push Item Flow (BCG tiles, recommendation engine,
placement labels) with 80-line UncoveredItemsDialog. Shows a
searchable list of items not in any upsell. Triggered by button
in dashboard header."
```

---

### Task 4: Simplify the server page component

**Files:**
- Modify: `src/app/[tenant]/admin/boost-sales/page.tsx`

- [ ] **Step 1: Remove convexDeploymentUrl from props**

In `src/app/[tenant]/admin/boost-sales/page.tsx`, replace the `BoostSalesDashboard` JSX (lines 53-69) with:

```tsx
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
```

This removes the `convexDeploymentUrl` prop that was only used by the deleted stats bar and performance components.

- [ ] **Step 2: Commit**

```bash
git add src/app/[tenant]/admin/boost-sales/page.tsx
git commit -m "refactor: remove convexDeploymentUrl prop from boost-sales page

No longer needed after deleting stats bar and performance tab."
```

---

### Task 5: Lint and verify build

**Files:**
- All modified files

- [ ] **Step 1: Run linter**

```bash
npm run lint
```

Expected: No new errors. Existing errors (if any) should not be from our changed files.

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: Build succeeds. No broken imports or missing exports.

- [ ] **Step 3: Verify deleted files are gone**

```bash
ls src/components/admin/boost-sales-stats-bar.tsx 2>&1
ls src/components/admin/boost-sales-performance-tab.tsx 2>&1
ls src/components/admin/smart-pair-suggestions-tab.tsx 2>&1
ls src/components/admin/complementary-pairs-tab.tsx 2>&1
ls src/components/admin/menu-engineering-dashboard.tsx 2>&1
```

Expected: All 5 return "No such file or directory".

- [ ] **Step 4: Verify line counts**

```bash
wc -l src/components/admin/boost-sales-dashboard.tsx src/components/admin/push-item-flow.tsx
```

Expected: Dashboard ~200 lines, push-item-flow ~80 lines.

- [ ] **Step 5: Commit any lint fixes if needed**

```bash
git add -A
git commit -m "fix: lint fixes after boost-sales simplification"
```

Only run this step if Step 1 found fixable issues in our changed files.
