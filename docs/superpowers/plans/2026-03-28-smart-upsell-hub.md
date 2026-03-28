# Smart Upsell Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the fragmented admin upsell experience into a single "Boost Sales" hub with merchant-friendly language, add a client-side upsell orchestrator for relevance, and provide a performance analytics tab.

**Architecture:** New admin page (`boost-sales/`) wraps existing tab components with reworded labels and adds a Quick-Add flow, Quick Stats bar, Performance tab, and Customer Preview. A client-side `UpsellOrchestratorProvider` coordinates which upsell components fire during a customer session. Existing service functions and DB schema are preserved — changes are additive.

**Tech Stack:** Next.js 15 App Router, Supabase, Convex, React Context, Shadcn UI, Tailwind CSS, Jest

**Spec:** `docs/superpowers/specs/2026-03-28-smart-upsell-hub-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/XXXXXXXX_add_boost_priority.sql` | Add `boost_priority` column to `menu_items` |
| `src/lib/bcg-labels.ts` | BCG → merchant-friendly label mapping utility |
| `src/lib/upsell-orchestrator.tsx` | Client-side upsell session coordinator (provider + hooks) |
| `src/app/[tenant]/admin/boost-sales/page.tsx` | Server page: data fetching, feature guard |
| `src/components/admin/boost-sales-dashboard.tsx` | Client dashboard shell: stats bar, quick-add, tabs |
| `src/components/admin/boost-sales-stats-bar.tsx` | Quick stats bar (revenue, acceptance rate, AOV lift) |
| `src/components/admin/push-item-flow.tsx` | Quick-Add "Push Item" wizard with auto-recommendation |
| `src/components/admin/boost-sales-performance-tab.tsx` | Performance analytics tab |
| `src/components/admin/upsell-preview-panel.tsx` | "Preview Customer Experience" simulation |
| `tests/unit/bcg-labels.test.ts` | Tests for label mapping |
| `tests/unit/upsell-orchestrator.test.tsx` | Tests for orchestrator logic |
| `convex-template/convex/upsellPerformance.ts` | New Convex queries for performance aggregation |

### Modified Files
| File | Change |
|------|--------|
| `src/types/database.ts` | Add `boost_priority` to `MenuItem` interface |
| `src/lib/menu-engineering-service.ts` | Add `getRecommendedPlacement`, `getItemsNotInAnyUpsell`, `getUpsellCoverageForItem` |
| `src/app/actions/menu-engineering.ts` | Add server actions wrapping new service functions |
| `src/components/shared/sidebar.tsx` | Replace "Menu Engineering" + "Bundles" nav items with "Boost Sales" |
| `src/components/admin/smart-pair-suggestions-tab.tsx` | Remap strategy labels to merchant-friendly language |
| `src/components/admin/checkout-upsell-settings-tab.tsx` | Add cross-reference indicators |
| `src/components/customer/inline-upgrade-section.tsx` | Check orchestrator before rendering |
| `src/components/customer/pair-suggestion-sheet.tsx` | Check orchestrator before rendering |
| `src/components/customer/bundle-upsell-modal.tsx` | Check orchestrator before rendering |
| `src/components/customer/upsell-suggestion-modal.tsx` | Check orchestrator before rendering |

---

## Phase 1: Foundation

### Task 1: Database Migration — Add `boost_priority` to `menu_items`

**Files:**
- Create: `supabase/migrations/20260328100000_add_boost_priority.sql`
- Modify: `src/types/database.ts:187-209`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Add boost_priority to menu_items for merchant "Push Item" flow
-- Higher value = more likely to appear in upsell suggestions
ALTER TABLE menu_items
ADD COLUMN IF NOT EXISTS boost_priority integer DEFAULT 0;

-- Index for efficient sorting by boost priority
CREATE INDEX IF NOT EXISTS idx_menu_items_boost_priority
ON menu_items (tenant_id, boost_priority DESC)
WHERE boost_priority > 0;
```

Save to `supabase/migrations/20260328100000_add_boost_priority.sql`.

- [ ] **Step 2: Update the TypeScript type**

In `src/types/database.ts`, add `boost_priority` to the `MenuItem` interface after `show_in_checkout_upsell`:

```typescript
show_in_checkout_upsell?: boolean;
boost_priority?: number;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260328100000_add_boost_priority.sql src/types/database.ts
git commit -m "feat: add boost_priority column to menu_items"
```

---

### Task 2: BCG Label Mapping Utility

**Files:**
- Create: `src/lib/bcg-labels.ts`
- Create: `tests/unit/bcg-labels.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/bcg-labels.test.ts
import {
  getBcgLabel,
  getBcgDescription,
  getStrategyLabel,
  getStrategyDescription,
  BCG_MERCHANT_LABELS,
  STRATEGY_MERCHANT_LABELS,
} from '@/lib/bcg-labels'

describe('bcg-labels', () => {
  describe('getBcgLabel', () => {
    it('maps star to Best Seller', () => {
      expect(getBcgLabel('star')).toBe('Best Seller')
    })

    it('maps plowhorse to Popular', () => {
      expect(getBcgLabel('plowhorse')).toBe('Popular')
    })

    it('maps puzzle to Hidden Gem', () => {
      expect(getBcgLabel('puzzle')).toBe('Hidden Gem')
    })

    it('maps dog to Slow Mover', () => {
      expect(getBcgLabel('dog')).toBe('Slow Mover')
    })

    it('maps unclassified to New', () => {
      expect(getBcgLabel('unclassified')).toBe('New')
    })

    it('returns New for undefined', () => {
      expect(getBcgLabel(undefined)).toBe('New')
    })
  })

  describe('getStrategyLabel', () => {
    it('maps plowhorse_to_star to Boost your margins', () => {
      expect(getStrategyLabel('plowhorse_to_star')).toBe('Boost your margins')
    })

    it('maps star_to_star to Maximize order value', () => {
      expect(getStrategyLabel('star_to_star')).toBe('Maximize order value')
    })

    it('maps puzzle_to_plowhorse to Get hidden gems noticed', () => {
      expect(getStrategyLabel('puzzle_to_plowhorse')).toBe('Get hidden gems noticed')
    })

    it('returns the key for unknown strategies', () => {
      expect(getStrategyLabel('unknown_strategy')).toBe('unknown_strategy')
    })
  })

  describe('getStrategyDescription', () => {
    it('returns merchant-friendly description for plowhorse_to_star', () => {
      expect(getStrategyDescription('plowhorse_to_star')).toBe(
        'These popular items could pull in higher-profit add-ons'
      )
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern="bcg-labels"`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/bcg-labels.ts
import type { BcgClassification } from '@/types/database'

/**
 * Maps internal BCG classifications to merchant-friendly labels.
 * The BCG engine runs under the hood — merchants never see jargon.
 */

export const BCG_MERCHANT_LABELS: Record<string, { label: string; description: string; color: string }> = {
  star: {
    label: 'Best Seller',
    description: 'High popularity, high profit — your top performers',
    color: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  plowhorse: {
    label: 'Popular',
    description: 'Customers love these — good for driving traffic',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  puzzle: {
    label: 'Hidden Gem',
    description: 'High profit potential — needs more visibility',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  dog: {
    label: 'Slow Mover',
    description: 'Low popularity, low profit — consider promoting or removing',
    color: 'bg-red-100 text-red-800 border-red-200',
  },
  unclassified: {
    label: 'New',
    description: 'Not yet classified — needs more sales data',
    color: 'bg-gray-100 text-gray-800 border-gray-200',
  },
}

export const STRATEGY_MERCHANT_LABELS: Record<string, { label: string; description: string; color: string }> = {
  plowhorse_to_star: {
    label: 'Boost your margins',
    description: 'These popular items could pull in higher-profit add-ons',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  star_to_star: {
    label: 'Maximize order value',
    description: 'Your best sellers paired together',
    color: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  puzzle_to_plowhorse: {
    label: 'Get hidden gems noticed',
    description: 'Pair underrated items with your bestsellers to give them exposure',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
  },
}

export function getBcgLabel(classification?: BcgClassification | string): string {
  if (!classification) return BCG_MERCHANT_LABELS.unclassified.label
  return BCG_MERCHANT_LABELS[classification]?.label ?? BCG_MERCHANT_LABELS.unclassified.label
}

export function getBcgDescription(classification?: BcgClassification | string): string {
  if (!classification) return BCG_MERCHANT_LABELS.unclassified.description
  return BCG_MERCHANT_LABELS[classification]?.description ?? BCG_MERCHANT_LABELS.unclassified.description
}

export function getBcgColor(classification?: BcgClassification | string): string {
  if (!classification) return BCG_MERCHANT_LABELS.unclassified.color
  return BCG_MERCHANT_LABELS[classification]?.color ?? BCG_MERCHANT_LABELS.unclassified.color
}

export function getStrategyLabel(strategy: string): string {
  return STRATEGY_MERCHANT_LABELS[strategy]?.label ?? strategy
}

export function getStrategyDescription(strategy: string): string {
  return STRATEGY_MERCHANT_LABELS[strategy]?.description ?? strategy
}

export function getStrategyColor(strategy: string): string {
  return STRATEGY_MERCHANT_LABELS[strategy]?.color ?? 'bg-gray-100 text-gray-800 border-gray-200'
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern="bcg-labels"`
Expected: PASS — all 8 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/bcg-labels.ts tests/unit/bcg-labels.test.ts
git commit -m "feat: add BCG to merchant-friendly label mapping utility"
```

---

### Task 3: New Service Functions

**Files:**
- Modify: `src/lib/menu-engineering-service.ts`
- Modify: `src/app/actions/menu-engineering.ts`

- [ ] **Step 1: Add `getItemsNotInAnyUpsell` to menu-engineering-service.ts**

Append to the end of `src/lib/menu-engineering-service.ts`:

```typescript
// ============================================
// Boost Sales — Coverage & Recommendations
// ============================================

/**
 * Returns menu items that are not part of any upsell flow:
 * - Not in any upsell_pairs (as source or target)
 * - Not in any bundle_slots (via included_item_ids or category match)
 * - Not marked as show_in_checkout_upsell
 */
export async function getItemsNotInAnyUpsell(tenantId: string): Promise<MenuItem[]> {
  const supabase = createAdminClient()

  // Get all item IDs that appear in upsell_pairs
  const { data: upsellPairItems } = await supabase
    .from('upsell_pairs')
    .select('source_item_id, target_item_id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)

  const upsellItemIds = new Set<string>()
  for (const pair of upsellPairItems || []) {
    upsellItemIds.add(pair.source_item_id)
    upsellItemIds.add(pair.target_item_id)
  }

  // Get all item IDs that appear in bundle slot included_item_ids
  const { data: bundleSlots } = await supabase
    .from('bundle_slots')
    .select('included_item_ids, bundle_id')
    .not('included_item_ids', 'is', null)

  for (const slot of bundleSlots || []) {
    if (slot.included_item_ids) {
      for (const id of slot.included_item_ids) {
        upsellItemIds.add(id)
      }
    }
  }

  // Get all menu items for this tenant that are NOT in any upsell
  const { data: allItems, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_available', true)
    .eq('show_in_checkout_upsell', false)
    .order('name')

  if (error) throw error

  return (allItems || [])
    .filter((item: MenuItem) => !upsellItemIds.has(item.id))
    .map((item: MenuItem) => ({
      ...item,
      variations: item.variations || [],
      variation_types: item.variation_types || [],
      addons: item.addons || [],
    }))
}

/**
 * Returns which upsell types an item appears in.
 * Used by the cross-reference indicator in Checkout Picks tab.
 */
export async function getUpsellCoverageForItem(
  itemId: string,
  tenantId: string
): Promise<{ pairCount: number; bundleCount: number; isCheckoutPick: boolean }> {
  const supabase = createAdminClient()

  // Count upsell pairs where this item is source or target
  const { count: pairCount } = await supabase
    .from('upsell_pairs')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .or(`source_item_id.eq.${itemId},target_item_id.eq.${itemId}`)

  // Count bundles containing this item's category via slots
  const { data: item } = await supabase
    .from('menu_items')
    .select('category_id, show_in_checkout_upsell')
    .eq('id', itemId)
    .single()

  let bundleCount = 0
  if (item?.category_id) {
    const { count } = await supabase
      .from('bundle_slots')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', item.category_id)

    bundleCount = count ?? 0
  }

  return {
    pairCount: pairCount ?? 0,
    bundleCount,
    isCheckoutPick: item?.show_in_checkout_upsell ?? false,
  }
}

type RecommendedPlacement = 'upgrade' | 'complementary' | 'checkout_pick' | 'bundle'

/**
 * Analyzes an item and recommends the best upsell placement.
 * Logic:
 * - If item is in a bundle category and has higher-priced siblings → upgrade
 * - If item is lower price than category avg (side/drink/dessert) → complementary pair
 * - If item is standalone, high-margin → checkout pick
 * - If item is already in a bundle → suggest more bundles
 */
export async function getRecommendedPlacement(
  itemId: string,
  tenantId: string
): Promise<{ placement: RecommendedPlacement; reason: string; suggestedTargets?: MenuItem[] }> {
  const supabase = createAdminClient()

  // Get the item with its category
  const { data: item } = await supabase
    .from('menu_items')
    .select('*, category:categories(id, name)')
    .eq('id', itemId)
    .eq('tenant_id', tenantId)
    .single()

  if (!item) throw new Error('Item not found')

  // Check if item is in any bundle slot
  const { count: bundleSlotCount } = await supabase
    .from('bundle_slots')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', item.category_id)

  // Get category average price
  const { data: categoryItems } = await supabase
    .from('menu_items')
    .select('price')
    .eq('tenant_id', tenantId)
    .eq('category_id', item.category_id)
    .eq('is_available', true)

  const categoryAvg = categoryItems && categoryItems.length > 0
    ? categoryItems.reduce((sum: number, i: { price: number }) => sum + i.price, 0) / categoryItems.length
    : item.price

  // Get higher-priced items in same category for upgrade suggestions
  const { data: higherItems } = await supabase
    .from('menu_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('category_id', item.category_id)
    .eq('is_available', true)
    .gt('price', item.price)
    .order('price', { ascending: true })
    .limit(3)

  const suggestedTargets = (higherItems || []).map((i: MenuItem) => ({
    ...i,
    variations: i.variations || [],
    variation_types: i.variation_types || [],
    addons: i.addons || [],
  })) as MenuItem[]

  // Decision logic
  if ((bundleSlotCount ?? 0) > 0 && suggestedTargets.length > 0) {
    return {
      placement: 'upgrade',
      reason: 'This item has higher-priced alternatives in its category — great for "Upgrade to Meal" prompts',
      suggestedTargets,
    }
  }

  if (item.price < categoryAvg * 0.7) {
    return {
      placement: 'complementary',
      reason: 'This is a lower-priced item — works well as a "Goes well with" suggestion alongside mains',
    }
  }

  if ((bundleSlotCount ?? 0) > 0) {
    return {
      placement: 'bundle',
      reason: 'This item\'s category is already in a bundle — consider adding it to more combos',
    }
  }

  return {
    placement: 'checkout_pick',
    reason: 'This standalone item works well as a last-chance checkout suggestion',
  }
}
```

- [ ] **Step 2: Add server actions for the new functions**

Append to `src/app/actions/menu-engineering.ts`:

```typescript
// ============================================
// Boost Sales Actions
// ============================================

export async function getItemsNotInAnyUpsellAction(tenantId: string) {
  'use server'
  const { getItemsNotInAnyUpsell } = await import('@/lib/menu-engineering-service')
  return getItemsNotInAnyUpsell(tenantId)
}

export async function getUpsellCoverageForItemAction(itemId: string, tenantId: string) {
  'use server'
  const { getUpsellCoverageForItem } = await import('@/lib/menu-engineering-service')
  return getUpsellCoverageForItem(itemId, tenantId)
}

export async function getRecommendedPlacementAction(itemId: string, tenantId: string) {
  'use server'
  const { getRecommendedPlacement } = await import('@/lib/menu-engineering-service')
  return getRecommendedPlacement(itemId, tenantId)
}

export async function setBoostPriorityAction(
  itemId: string,
  tenantId: string,
  tenantSlug: string,
  priority: number
) {
  'use server'
  const { createClient } = await import('@/lib/supabase/server')
  const { revalidatePath } = await import('next/cache')
  const supabase = await createClient()

  const { error } = await supabase
    .from('menu_items')
    .update({ boost_priority: priority })
    .eq('id', itemId)
    .eq('tenant_id', tenantId)

  if (error) throw error
  revalidatePath(`/${tenantSlug}/admin/boost-sales`)
}
```

- [ ] **Step 3: Run lint to verify no errors**

Run: `npm run lint`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/menu-engineering-service.ts src/app/actions/menu-engineering.ts
git commit -m "feat: add boost sales service functions and server actions"
```

---

## Phase 2: Admin Hub

### Task 4: Sidebar Navigation Update

**Files:**
- Modify: `src/components/shared/sidebar.tsx:127-162`

- [ ] **Step 1: Replace Menu Engineering + Bundles nav items with Boost Sales**

In `src/components/shared/sidebar.tsx`, replace the "Menu Engineering" and "Bundles" entries (lines 153-162) with a single "Boost Sales" entry:

```typescript
// Replace these two entries:
//   { label: 'Menu Engineering', href: '/admin/menu-engineering', icon: TrendingUp },
//   { label: 'Bundles', href: '/admin/bundles', icon: Package },
// With:
  {
    label: 'Boost Sales',
    href: '/admin/boost-sales',
    icon: TrendingUp,
  },
```

Also add the `Rocket` import from `lucide-react` if you prefer a different icon, but `TrendingUp` is fine.

- [ ] **Step 2: Update sidebar filtering**

Find the filtering logic in the Sidebar component that checks `menuEngineeringEnabled` and `bundlesEnabled`. The "Boost Sales" item should show when `menuEngineeringEnabled` is true (it subsumes bundles). Update the filter condition accordingly — look for where `menu-engineering` and `bundles` hrefs are checked and replace with `boost-sales`.

- [ ] **Step 3: Verify the build compiles**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/sidebar.tsx
git commit -m "feat: replace Menu Engineering + Bundles nav with Boost Sales"
```

---

### Task 5: Boost Sales Page Shell

**Files:**
- Create: `src/app/[tenant]/admin/boost-sales/page.tsx`
- Create: `src/components/admin/boost-sales-dashboard.tsx`

- [ ] **Step 1: Create the server page**

Model it after the existing `menu-engineering/page.tsx`. This page fetches data and passes it to the dashboard.

```typescript
// src/app/[tenant]/admin/boost-sales/page.tsx
import { redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { getCachedTenantBySlug, getCachedCategoriesByTenant } from '@/lib/cache'
import { getMenuItemsByBcgClassification, getUpsellPairsByTenant } from '@/lib/menu-engineering-service'
import { getBundlesByTenant } from '@/lib/bundles-service'
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

  const [menuItems, categories, upsellPairs, bundles] = await Promise.all([
    getMenuItemsByBcgClassification(tenant.id),
    getCachedCategoriesByTenant(tenant.id),
    getUpsellPairsByTenant(tenant.id),
    getBundlesByTenant(tenant.id),
  ])

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/${tenantSlug}/admin` },
          { label: 'Boost Sales' },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold">Boost Sales</h1>
        <p className="text-muted-foreground">
          Push your best items, create combos, and track what&apos;s working
        </p>
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
        convexDeploymentUrl={tenant.convex_deployment_url ?? null}
      />
    </div>
  )
}
```

- [ ] **Step 2: Create the dashboard shell**

This is the client component that orchestrates the tabs. Model the structure after `MenuEngineeringDashboard` but with the new tab layout.

```typescript
// src/components/admin/boost-sales-dashboard.tsx
'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Eye } from 'lucide-react'
import type { MenuItem, Category, UpsellPairWithItems, BundleWithSlots } from '@/types/database'

// Lazy-load tab components
const BundlesList = dynamic(
  () => import('@/components/admin/bundles-list').then(mod => ({ default: mod.BundlesList })),
  { ssr: false, loading: () => <div className="p-8 text-center text-muted-foreground animate-pulse">Loading...</div> }
)

const SmartPairSuggestionsTab = dynamic(
  () => import('@/components/admin/smart-pair-suggestions-tab').then(mod => ({ default: mod.SmartPairSuggestionsTab })),
  { ssr: false, loading: () => <div className="p-8 text-center text-muted-foreground animate-pulse">Loading...</div> }
)

const CheckoutUpsellSettingsTab = dynamic(
  () => import('@/components/admin/checkout-upsell-settings-tab').then(mod => ({ default: mod.CheckoutUpsellSettingsTab })),
  { ssr: false, loading: () => <div className="p-8 text-center text-muted-foreground animate-pulse">Loading...</div> }
)

const BoostSalesPerformanceTab = dynamic(
  () => import('@/components/admin/boost-sales-performance-tab').then(mod => ({ default: mod.BoostSalesPerformanceTab })),
  { ssr: false, loading: () => <div className="p-8 text-center text-muted-foreground animate-pulse">Loading...</div> }
)

const UpsellPreviewPanel = dynamic(
  () => import('@/components/admin/upsell-preview-panel').then(mod => ({ default: mod.UpsellPreviewPanel })),
  { ssr: false }
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
  categories,
  upsellPairs,
  bundles,
  tenantId,
  tenantSlug,
  checkoutUpsellEnabled,
  checkoutUpsellTitle,
  checkoutUpsellSubtitle,
  checkoutUpsellMaxItems,
  bundlesEnabled,
  convexDeploymentUrl,
}: BoostSalesDashboardProps) {
  const [showPreview, setShowPreview] = useState(false)

  return (
    <div className="space-y-6">
      {/* Quick Stats Bar — Task 6 */}
      {/* <BoostSalesStatsBar ... /> */}

      {/* Quick-Add Bar — Task 7 */}
      {/* <PushItemFlow ... /> */}

      {/* Preview Panel */}
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
      <div className="flex items-center justify-between">
        <div />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPreview(!showPreview)}
        >
          <Eye className="mr-2 h-4 w-4" />
          Preview Customer Experience
        </Button>
      </div>

      <Tabs defaultValue="bundles" className="space-y-6">
        <TabsList>
          <TabsTrigger value="bundles">Combos & Bundles</TabsTrigger>
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
          <BoostSalesPerformanceTab
            tenantId={tenantId}
            convexDeploymentUrl={convexDeploymentUrl}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

- [ ] **Step 3: Add redirect from old menu-engineering route**

In `src/app/[tenant]/admin/menu-engineering/page.tsx`, add a redirect to the new page at the top after the tenant check:

```typescript
// After line 24 (the menu_engineering_enabled check), add:
redirect(`/${tenantSlug}/admin/boost-sales`)
```

This ensures any bookmarks or links to the old page still work. The full page becomes just a redirect.

- [ ] **Step 4: Verify the page loads**

Run: `npm run build` (or `npm run dev` and navigate to `/[tenant]/admin/boost-sales`)
Expected: Page renders with tabs, no errors

- [ ] **Step 5: Commit**

```bash
git add src/app/[tenant]/admin/boost-sales/page.tsx src/components/admin/boost-sales-dashboard.tsx src/app/[tenant]/admin/menu-engineering/page.tsx
git commit -m "feat: add Boost Sales page shell with tab navigation"
```

---

### Task 6: Quick Stats Bar

**Files:**
- Create: `src/components/admin/boost-sales-stats-bar.tsx`
- Modify: `src/components/admin/boost-sales-dashboard.tsx`

- [ ] **Step 1: Create the stats bar component**

This component shows 4 key metrics. For now, it calculates stats from the props data (upsellPairs count, menuItems with upsell coverage). In the Performance tab task (Task 10), we'll wire it to Convex analytics.

```typescript
// src/components/admin/boost-sales-stats-bar.tsx
'use client'

import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { TrendingUp, Target, DollarSign, Zap } from 'lucide-react'
import type { MenuItem, UpsellPairWithItems, BundleWithSlots } from '@/types/database'

interface BoostSalesStatsBarProps {
  menuItems: MenuItem[]
  upsellPairs: UpsellPairWithItems[]
  bundles: BundleWithSlots[]
}

export function BoostSalesStatsBar({ menuItems, upsellPairs, bundles }: BoostSalesStatsBarProps) {
  const stats = useMemo(() => {
    const activePairs = upsellPairs.filter(p => p.is_active).length
    const activeBundles = bundles.filter(b => b.is_active).length
    const checkoutPicks = menuItems.filter(i => i.show_in_checkout_upsell).length
    const totalActive = activePairs + activeBundles + checkoutPicks

    const itemsInUpsell = new Set<string>()
    for (const pair of upsellPairs) {
      if (pair.is_active) {
        itemsInUpsell.add(pair.source_item_id)
        itemsInUpsell.add(pair.target_item_id)
      }
    }
    for (const item of menuItems) {
      if (item.show_in_checkout_upsell) itemsInUpsell.add(item.id)
    }
    const coveragePercent = menuItems.length > 0
      ? Math.round((itemsInUpsell.size / menuItems.length) * 100)
      : 0

    return { totalActive, activePairs, activeBundles, checkoutPicks, coveragePercent }
  }, [menuItems, upsellPairs, bundles])

  const cards = [
    {
      label: 'Active Upsells',
      value: stats.totalActive,
      detail: `${stats.activePairs} pairs, ${stats.activeBundles} combos, ${stats.checkoutPicks} checkout`,
      icon: Zap,
    },
    {
      label: 'Menu Coverage',
      value: `${stats.coveragePercent}%`,
      detail: 'of items are in at least one upsell',
      icon: Target,
    },
    {
      label: 'Acceptance Rate',
      value: '—',
      detail: 'Connect analytics to see live data',
      icon: TrendingUp,
    },
    {
      label: 'Extra Revenue',
      value: '—',
      detail: 'Connect analytics to see live data',
      icon: DollarSign,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <card.icon className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
            </div>
            <p className="mt-2 text-2xl font-bold">{card.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{card.detail}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Wire into the dashboard**

In `src/components/admin/boost-sales-dashboard.tsx`, replace the `{/* Quick Stats Bar — Task 6 */}` comment with:

```typescript
import { BoostSalesStatsBar } from '@/components/admin/boost-sales-stats-bar'

// In the JSX, replace the comment with:
<BoostSalesStatsBar
  menuItems={menuItems}
  upsellPairs={upsellPairs}
  bundles={bundles}
/>
```

Add the import at the top (not dynamic — it's lightweight).

- [ ] **Step 3: Verify it renders**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/boost-sales-stats-bar.tsx src/components/admin/boost-sales-dashboard.tsx
git commit -m "feat: add Quick Stats bar to Boost Sales dashboard"
```

---

### Task 7: Push Item Flow (Quick-Add Wizard)

**Files:**
- Create: `src/components/admin/push-item-flow.tsx`
- Modify: `src/components/admin/boost-sales-dashboard.tsx`

- [ ] **Step 1: Create the Push Item flow component**

This component has two states: (1) search/tile selection, (2) recommendation display.

```typescript
// src/components/admin/push-item-flow.tsx
'use client'

import { useState, useTransition, useMemo } from 'react'
import { Search, Star, Gem, TrendingDown, AlertCircle, Loader2, Check, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { formatPrice } from '@/lib/cart-utils'
import { getBcgLabel, getBcgColor } from '@/lib/bcg-labels'
import {
  getRecommendedPlacementAction,
  setBoostPriorityAction,
  createUpsellPairAction,
  setCheckoutUpsellItemsAction,
} from '@/app/actions/menu-engineering'
import type { MenuItem } from '@/types/database'

interface MenuItemWithCategory extends MenuItem {
  category: { id: string; name: string } | null
}

interface PushItemFlowProps {
  menuItems: MenuItemWithCategory[]
  tenantId: string
  tenantSlug: string
  itemsNotInUpsell: string[] // IDs of items not in any upsell
}

type PlacementResult = {
  placement: 'upgrade' | 'complementary' | 'checkout_pick' | 'bundle'
  reason: string
  suggestedTargets?: MenuItem[]
}

const PLACEMENT_LABELS: Record<string, { label: string; description: string }> = {
  upgrade: {
    label: 'Upgrade to Meal',
    description: 'Show when someone orders a lower-priced version',
  },
  complementary: {
    label: 'Goes well with',
    description: 'Suggest alongside mains and combos',
  },
  checkout_pick: {
    label: 'Checkout pick',
    description: 'Show before payment as an impulse add',
  },
  bundle: {
    label: 'Add to a combo',
    description: 'Include in more bundle deals',
  },
}

export function PushItemFlow({
  menuItems,
  tenantId,
  tenantSlug,
  itemsNotInUpsell,
}: PushItemFlowProps) {
  const [search, setSearch] = useState('')
  const [selectedItem, setSelectedItem] = useState<MenuItemWithCategory | null>(null)
  const [recommendation, setRecommendation] = useState<PlacementResult | null>(null)
  const [isPending, startTransition] = useTransition()

  const bcgCounts = useMemo(() => {
    const counts = { star: 0, puzzle: 0, dog: 0, noUpsell: itemsNotInUpsell.length }
    for (const item of menuItems) {
      if (item.bcg_classification === 'star') counts.star++
      else if (item.bcg_classification === 'puzzle') counts.puzzle++
      else if (item.bcg_classification === 'dog') counts.dog++
    }
    return counts
  }, [menuItems, itemsNotInUpsell])

  const filteredItems = useMemo(() => {
    if (!search) return []
    const q = search.toLowerCase()
    return menuItems.filter(i =>
      i.name.toLowerCase().includes(q) ||
      i.category?.name.toLowerCase().includes(q)
    ).slice(0, 8)
  }, [search, menuItems])

  function handleSelectItem(item: MenuItemWithCategory) {
    setSelectedItem(item)
    setSearch('')
    startTransition(async () => {
      try {
        const result = await getRecommendedPlacementAction(item.id, tenantId)
        setRecommendation(result)
      } catch {
        toast.error('Failed to get recommendation')
      }
    })
  }

  function handleAccept() {
    if (!selectedItem || !recommendation) return
    startTransition(async () => {
      try {
        await setBoostPriorityAction(selectedItem.id, tenantId, tenantSlug, 10)
        toast.success(`${selectedItem.name} added to Boost Sales`)
        setSelectedItem(null)
        setRecommendation(null)
      } catch {
        toast.error('Failed to add item')
      }
    })
  }

  function handleReset() {
    setSelectedItem(null)
    setRecommendation(null)
    setSearch('')
  }

  const tiles = [
    { label: 'Best Sellers', count: bcgCounts.star, icon: Star, filter: 'star' as const, color: 'text-amber-600' },
    { label: 'Hidden Gems', count: bcgCounts.puzzle, icon: Gem, filter: 'puzzle' as const, color: 'text-purple-600' },
    { label: 'Slow Movers', count: bcgCounts.dog, icon: TrendingDown, filter: 'dog' as const, color: 'text-red-600' },
    { label: 'Not in any upsell', count: bcgCounts.noUpsell, icon: AlertCircle, filter: 'none' as const, color: 'text-gray-600' },
  ]

  // Selection state — show recommendation
  if (selectedItem) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-muted-foreground">Pushing:</p>
              <p className="text-lg font-semibold">{selectedItem.name} ({formatPrice(selectedItem.price)})</p>
            </div>
            <Button variant="ghost" size="sm" onClick={handleReset}>Change item</Button>
          </div>

          {isPending ? (
            <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing item...
            </div>
          ) : recommendation ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">We recommend:</p>
              <Card className="border-primary bg-primary/5">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium">{PLACEMENT_LABELS[recommendation.placement]?.label}</p>
                      <p className="text-sm text-muted-foreground mt-1">{recommendation.reason}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleAccept} disabled={isPending}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Add to Boost Sales
                </Button>
                <Button variant="outline" onClick={handleReset}>Cancel</Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    )
  }

  // Default state — search + tiles
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm font-medium mb-3">What do you want to sell more of?</p>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search menu items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
          {filteredItems.length > 0 && (
            <div className="absolute z-10 top-full mt-1 w-full rounded-md border bg-popover shadow-md max-h-64 overflow-y-auto">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  className="w-full text-left px-3 py-2 hover:bg-accent flex items-center justify-between text-sm"
                  onClick={() => handleSelectItem(item)}
                >
                  <span>{item.name}</span>
                  <span className="text-muted-foreground">{formatPrice(item.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Suggestion tiles */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map((tile) => (
            <button
              key={tile.label}
              className="rounded-lg border p-3 text-left hover:bg-accent transition-colors"
              onClick={() => {
                // Filter items by tile type and show first match
                const items = tile.filter === 'none'
                  ? menuItems.filter(i => itemsNotInUpsell.includes(i.id))
                  : menuItems.filter(i => i.bcg_classification === tile.filter)
                if (items.length > 0) handleSelectItem(items[0])
              }}
            >
              <tile.icon className={`h-5 w-5 ${tile.color} mb-1`} />
              <p className="text-sm font-medium">{tile.label}</p>
              <p className="text-xs text-muted-foreground">{tile.count} items</p>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Wire into the dashboard**

In `src/components/admin/boost-sales-dashboard.tsx`, replace the `{/* Quick-Add Bar — Task 7 */}` comment. You'll need to compute `itemsNotInUpsell` from the props:

```typescript
import { PushItemFlow } from '@/components/admin/push-item-flow'

// Inside the component, compute items not in upsell:
const itemsNotInUpsellIds = useMemo(() => {
  const inUpsell = new Set<string>()
  for (const pair of upsellPairs) {
    inUpsell.add(pair.source_item_id)
    inUpsell.add(pair.target_item_id)
  }
  for (const item of menuItems) {
    if (item.show_in_checkout_upsell) inUpsell.add(item.id)
  }
  return menuItems.filter(i => !inUpsell.has(i.id)).map(i => i.id)
}, [menuItems, upsellPairs])

// In JSX:
<PushItemFlow
  menuItems={menuItems}
  tenantId={tenantId}
  tenantSlug={tenantSlug}
  itemsNotInUpsell={itemsNotInUpsellIds}
/>
```

Add the `useMemo` import if not already present.

- [ ] **Step 3: Verify it renders**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/push-item-flow.tsx src/components/admin/boost-sales-dashboard.tsx
git commit -m "feat: add Push Item quick-add flow to Boost Sales"
```

---

### Task 8: Remap Strategy Labels in Smart Pair Suggestions Tab

**Files:**
- Modify: `src/components/admin/smart-pair-suggestions-tab.tsx:39-58`

- [ ] **Step 1: Replace the hardcoded strategyConfig with bcg-labels imports**

In `src/components/admin/smart-pair-suggestions-tab.tsx`, replace the `strategyConfig` object (lines 39-58) with:

```typescript
import { getStrategyLabel, getStrategyDescription, getStrategyColor } from '@/lib/bcg-labels'

// Replace strategyConfig with a function that builds config from bcg-labels:
function getStrategyConfig(strategy: string) {
  return {
    label: getStrategyLabel(strategy),
    description: getStrategyDescription(strategy),
    color: getStrategyColor(strategy),
  }
}
```

Then update all references from `strategyConfig[strategy]?.label` to `getStrategyConfig(strategy).label`, etc. throughout the component.

- [ ] **Step 2: Update the "Generate Suggestions" button label**

Find the button that says "Generate Suggestions" and rename it to "Find new pairings".

- [ ] **Step 3: Update AOV language**

Search the file for "AOV" and replace with "extra revenue per order" in user-facing strings.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/smart-pair-suggestions-tab.tsx
git commit -m "feat: remap BCG strategy labels to merchant-friendly language"
```

---

### Task 8b: Bundle Post-Create Placement Prompt

**Files:**
- Modify: `src/components/admin/bundle-form.tsx` (the form used when creating/editing bundles)

The spec requires that after creating or editing a bundle, a prompt shows: "Where should this combo appear?" with 3 checkboxes mapping to `show_on_menu`, `show_as_upsell`, and auto-creating upgrade pairs.

- [ ] **Step 1: Find the bundle form submit handler**

Read `src/components/admin/bundle-form.tsx` and locate the form submission or save handler. The placement prompt should appear as a section at the bottom of the form, before the submit button.

- [ ] **Step 2: Add placement checkboxes to the bundle form**

Add a "Where should this combo appear?" section with 3 checkboxes at the bottom of the form:

```typescript
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

// In the form JSX, before the submit button:
<div className="space-y-3 rounded-lg border p-4">
  <p className="text-sm font-medium">Where should this combo appear?</p>
  <div className="flex items-center gap-2">
    <Checkbox
      id="show_on_menu"
      checked={showOnMenu}
      onCheckedChange={(checked) => setShowOnMenu(!!checked)}
    />
    <Label htmlFor="show_on_menu" className="text-sm">Show on menu (customers browse it directly)</Label>
  </div>
  <div className="flex items-center gap-2">
    <Checkbox
      id="show_as_upsell"
      checked={showAsUpsell}
      onCheckedChange={(checked) => setShowAsUpsell(!!checked)}
    />
    <Label htmlFor="show_as_upsell" className="text-sm">Suggest when customer adds a matching item</Label>
  </div>
  <div className="flex items-center gap-2">
    <Checkbox
      id="create_upgrade_pairs"
      checked={createUpgradePairs}
      onCheckedChange={(checked) => setCreateUpgradePairs(!!checked)}
    />
    <Label htmlFor="create_upgrade_pairs" className="text-sm">Show as upgrade option on item pages</Label>
  </div>
</div>
```

Wire `showOnMenu` and `showAsUpsell` to the existing bundle fields. The `createUpgradePairs` checkbox, when checked, should trigger a post-save action that creates upgrade `upsell_pairs` for items in the bundle's slot categories.

- [ ] **Step 3: Handle the auto-create upgrade pairs on save**

After the bundle is saved, if `createUpgradePairs` is checked, call `createUpsellPairAction` for each menu item in the bundle's slot categories that isn't already in an upgrade pair:

```typescript
if (createUpgradePairs && savedBundle) {
  for (const slot of savedBundle.slots) {
    // Get items in this slot's category
    const { items } = await getSlotItemsAction(slot.category_id, tenantId)
    for (const item of items) {
      // Create upgrade pair: item → bundle
      try {
        await createUpsellPairAction(tenantId, tenantSlug, {
          source_item_id: item.id,
          target_item_id: item.id, // Points to same item but bundled
          pair_type: 'upgrade',
          is_active: true,
          upgrade_header: `Upgrade to ${savedBundle.name}`,
        })
      } catch {
        // Skip if pair already exists
      }
    }
  }
}
```

- [ ] **Step 4: Verify lint passes**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/bundle-form.tsx
git commit -m "feat: add placement prompt after bundle create/edit"
```

---

### Task 8c: Checkout Picks Cross-Reference Indicator

**Files:**
- Modify: `src/components/admin/checkout-upsell-settings-tab.tsx`

The spec requires each selected checkout pick item to show "Also in: 2 pair suggestions, 1 combo" so merchants understand cross-channel coverage.

- [ ] **Step 1: Add coverage data fetching**

In `src/components/admin/checkout-upsell-settings-tab.tsx`, add a state for coverage data and fetch it when items load:

```typescript
import { getUpsellCoverageForItemAction } from '@/app/actions/menu-engineering'

const [coverageMap, setCoverageMap] = useState<Record<string, { pairCount: number; bundleCount: number }>>({})

// After items are loaded/filtered, fetch coverage for selected items:
useEffect(() => {
  async function fetchCoverage() {
    const selected = menuItems.filter(i => i.show_in_checkout_upsell)
    const entries: Record<string, { pairCount: number; bundleCount: number }> = {}
    // Fetch in parallel (batch of selected items only)
    await Promise.all(
      selected.map(async (item) => {
        try {
          const coverage = await getUpsellCoverageForItemAction(item.id, tenantId)
          entries[item.id] = { pairCount: coverage.pairCount, bundleCount: coverage.bundleCount }
        } catch {
          // Ignore fetch errors
        }
      })
    )
    setCoverageMap(entries)
  }
  fetchCoverage()
}, [menuItems, tenantId])
```

- [ ] **Step 2: Render the cross-reference badge on each selected item**

In the item grid where selected items are rendered (look for the checkbox grid), add a small text indicator below each selected item:

```typescript
{coverageMap[item.id] && (coverageMap[item.id].pairCount > 0 || coverageMap[item.id].bundleCount > 0) && (
  <p className="text-[10px] text-muted-foreground mt-1">
    Also in: {[
      coverageMap[item.id].pairCount > 0 && `${coverageMap[item.id].pairCount} pair${coverageMap[item.id].pairCount > 1 ? 's' : ''}`,
      coverageMap[item.id].bundleCount > 0 && `${coverageMap[item.id].bundleCount} combo${coverageMap[item.id].bundleCount > 1 ? 's' : ''}`,
    ].filter(Boolean).join(', ')}
  </p>
)}
```

- [ ] **Step 3: Verify lint passes**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/checkout-upsell-settings-tab.tsx
git commit -m "feat: add cross-reference indicator on checkout picks"
```

---

## Phase 3: Customer-Side Orchestration

### Task 9: Upsell Orchestrator Provider

**Files:**
- Create: `src/lib/upsell-orchestrator.tsx`
- Create: `tests/unit/upsell-orchestrator.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/upsell-orchestrator.test.tsx
import { renderHook, act } from '@testing-library/react'
import { UpsellOrchestratorProvider, useUpsellOrchestrator } from '@/lib/upsell-orchestrator'

function wrapper({ children }: { children: React.ReactNode }) {
  return <UpsellOrchestratorProvider>{children}</UpsellOrchestratorProvider>
}

describe('useUpsellOrchestrator', () => {
  it('starts with full budget (2)', () => {
    const { result } = renderHook(() => useUpsellOrchestrator(), { wrapper })
    expect(result.current.budgetRemaining).toBe(2)
  })

  it('allows first upsell prompt', () => {
    const { result } = renderHook(() => useUpsellOrchestrator(), { wrapper })
    expect(result.current.canShowUpsell('upgrade')).toBe(true)
  })

  it('decrements budget when prompt is recorded', () => {
    const { result } = renderHook(() => useUpsellOrchestrator(), { wrapper })
    act(() => { result.current.recordShown('upgrade', 'item-1') })
    expect(result.current.budgetRemaining).toBe(1)
  })

  it('blocks mid-flow prompts when budget is spent', () => {
    const { result } = renderHook(() => useUpsellOrchestrator(), { wrapper })
    act(() => { result.current.recordShown('upgrade', 'item-1') })
    act(() => { result.current.recordShown('pair', 'item-2') })
    expect(result.current.canShowUpsell('bundle')).toBe(false)
  })

  it('always allows checkout picks regardless of budget', () => {
    const { result } = renderHook(() => useUpsellOrchestrator(), { wrapper })
    act(() => { result.current.recordShown('upgrade', 'item-1') })
    act(() => { result.current.recordShown('pair', 'item-2') })
    expect(result.current.canShowUpsell('checkout')).toBe(true)
  })

  it('forfeits remaining budget on dismiss', () => {
    const { result } = renderHook(() => useUpsellOrchestrator(), { wrapper })
    act(() => { result.current.recordShown('upgrade', 'item-1') })
    act(() => { result.current.recordDismissed() })
    expect(result.current.budgetRemaining).toBe(0)
    expect(result.current.canShowUpsell('pair')).toBe(false)
    expect(result.current.canShowUpsell('checkout')).toBe(true)
  })

  it('tracks suggested items to avoid repeats', () => {
    const { result } = renderHook(() => useUpsellOrchestrator(), { wrapper })
    act(() => { result.current.recordShown('upgrade', 'item-1') })
    expect(result.current.wasItemSuggested('item-1')).toBe(true)
    expect(result.current.wasItemSuggested('item-2')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern="upsell-orchestrator"`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/upsell-orchestrator.tsx
'use client'

import { createContext, useContext, useCallback, useRef, type ReactNode } from 'react'

const MAX_MID_FLOW_PROMPTS = 2

type UpsellType = 'upgrade' | 'bundle' | 'pair' | 'checkout'

interface UpsellSession {
  promptsShown: number
  dismissed: boolean
  suggestedItemIds: Set<string>
  shownTypes: Set<UpsellType>
}

interface UpsellOrchestratorValue {
  budgetRemaining: number
  canShowUpsell: (type: UpsellType) => boolean
  recordShown: (type: UpsellType, itemId: string) => void
  recordDismissed: () => void
  wasItemSuggested: (itemId: string) => boolean
  filterSuggestedItems: <T extends { id: string }>(items: T[]) => T[]
}

const UpsellOrchestratorContext = createContext<UpsellOrchestratorValue>({
  budgetRemaining: MAX_MID_FLOW_PROMPTS,
  canShowUpsell: () => true,
  recordShown: () => {},
  recordDismissed: () => {},
  wasItemSuggested: () => false,
  filterSuggestedItems: (items) => items,
})

export function useUpsellOrchestrator() {
  return useContext(UpsellOrchestratorContext)
}

export function UpsellOrchestratorProvider({ children }: { children: ReactNode }) {
  // Use ref to avoid re-renders on state changes — orchestrator is imperative
  const sessionRef = useRef<UpsellSession>({
    promptsShown: 0,
    dismissed: false,
    suggestedItemIds: new Set(),
    shownTypes: new Set(),
  })

  // Force re-render counter for consumers that read budgetRemaining
  const [, setTick] = [0, () => {}] // No-op — consumers check imperatively
  // Actually, we need a state-based approach for the hook to work in tests.
  // Use a simple counter ref and expose computed values.

  const getSession = useCallback(() => sessionRef.current, [])

  const budgetRemaining = MAX_MID_FLOW_PROMPTS - sessionRef.current.promptsShown

  const canShowUpsell = useCallback((type: UpsellType): boolean => {
    const session = sessionRef.current
    // Checkout picks always allowed
    if (type === 'checkout') return true
    // If dismissed, no more mid-flow prompts
    if (session.dismissed) return false
    // If budget spent, no more mid-flow prompts
    if (session.promptsShown >= MAX_MID_FLOW_PROMPTS) return false
    return true
  }, [])

  const recordShown = useCallback((type: UpsellType, itemId: string) => {
    const session = sessionRef.current
    if (type !== 'checkout') {
      session.promptsShown++
    }
    session.shownTypes.add(type)
    session.suggestedItemIds.add(itemId)
  }, [])

  const recordDismissed = useCallback(() => {
    sessionRef.current.dismissed = true
    sessionRef.current.promptsShown = MAX_MID_FLOW_PROMPTS // Forfeit remaining
  }, [])

  const wasItemSuggested = useCallback((itemId: string): boolean => {
    return sessionRef.current.suggestedItemIds.has(itemId)
  }, [])

  const filterSuggestedItems = useCallback(<T extends { id: string }>(items: T[]): T[] => {
    return items.filter(item => !sessionRef.current.suggestedItemIds.has(item.id))
  }, [])

  const value: UpsellOrchestratorValue = {
    budgetRemaining: MAX_MID_FLOW_PROMPTS - sessionRef.current.promptsShown,
    canShowUpsell,
    recordShown,
    recordDismissed,
    wasItemSuggested,
    filterSuggestedItems,
  }

  return (
    <UpsellOrchestratorContext.Provider value={value}>
      {children}
    </UpsellOrchestratorContext.Provider>
  )
}
```

**Note:** The `budgetRemaining` as a direct property won't update reactively with refs. For test compatibility, refactor to use `useState` internally:

Replace the ref approach with:

```typescript
import { createContext, useContext, useCallback, useState, useRef, type ReactNode } from 'react'

// ... (types same as above)

export function UpsellOrchestratorProvider({ children }: { children: ReactNode }) {
  const [promptsShown, setPromptsShown] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const suggestedItemIdsRef = useRef(new Set<string>())

  const canShowUpsell = useCallback((type: UpsellType): boolean => {
    if (type === 'checkout') return true
    if (dismissed) return false
    if (promptsShown >= MAX_MID_FLOW_PROMPTS) return false
    return true
  }, [promptsShown, dismissed])

  const recordShown = useCallback((type: UpsellType, itemId: string) => {
    if (type !== 'checkout') {
      setPromptsShown(prev => prev + 1)
    }
    suggestedItemIdsRef.current.add(itemId)
  }, [])

  const recordDismissed = useCallback(() => {
    setDismissed(true)
    setPromptsShown(MAX_MID_FLOW_PROMPTS)
  }, [])

  const wasItemSuggested = useCallback((itemId: string): boolean => {
    return suggestedItemIdsRef.current.has(itemId)
  }, [])

  const filterSuggestedItems = useCallback(<T extends { id: string }>(items: T[]): T[] => {
    return items.filter(item => !suggestedItemIdsRef.current.has(item.id))
  }, [])

  const value: UpsellOrchestratorValue = {
    budgetRemaining: MAX_MID_FLOW_PROMPTS - promptsShown,
    canShowUpsell,
    recordShown,
    recordDismissed,
    wasItemSuggested,
    filterSuggestedItems,
  }

  return (
    <UpsellOrchestratorContext.Provider value={value}>
      {children}
    </UpsellOrchestratorContext.Provider>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern="upsell-orchestrator"`
Expected: PASS — all 7 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/upsell-orchestrator.tsx tests/unit/upsell-orchestrator.test.tsx
git commit -m "feat: add UpsellOrchestratorProvider with session budget tracking"
```

---

### Task 10: Wire Orchestrator into Customer Components

**Files:**
- Modify: `src/components/customer/inline-upgrade-section.tsx`
- Modify: `src/components/customer/pair-suggestion-sheet.tsx`
- Modify: `src/components/customer/bundle-upsell-modal.tsx`
- Modify: `src/components/customer/upsell-suggestion-modal.tsx`
- Modify: Customer layout where `AnalyticsProvider` is rendered (to wrap with `UpsellOrchestratorProvider`)

- [ ] **Step 1: Add UpsellOrchestratorProvider to the customer layout**

Find where `AnalyticsProvider` wraps the customer app (likely in a layout file under `src/app/[tenant]/`). Add `UpsellOrchestratorProvider` as a sibling wrapper inside it:

```typescript
import { UpsellOrchestratorProvider } from '@/lib/upsell-orchestrator'

// Wrap children:
<AnalyticsProvider convexUrl={convexUrl}>
  <UpsellOrchestratorProvider>
    {children}
  </UpsellOrchestratorProvider>
</AnalyticsProvider>
```

Search for the file containing `<AnalyticsProvider` to find the exact location.

- [ ] **Step 2: Add orchestrator check to InlineUpgradeSection**

In `src/components/customer/inline-upgrade-section.tsx`, add at the top of the component:

```typescript
import { useUpsellOrchestrator } from '@/lib/upsell-orchestrator'

// Inside the component function, before the existing analytics tracking:
const orchestrator = useUpsellOrchestrator()

// Guard: don't render if orchestrator says no
if (!orchestrator.canShowUpsell('upgrade')) return null

// In the useEffect that tracks upsell_shown, also record with orchestrator:
orchestrator.recordShown('upgrade', sourceItem.id)
```

When the user dismisses (calls `onDismiss`), also record with the orchestrator:

```typescript
// In the dismiss handler:
orchestrator.recordDismissed()
```

- [ ] **Step 3: Add orchestrator check to PairSuggestionSheet**

In `src/components/customer/pair-suggestion-sheet.tsx`:

```typescript
import { useUpsellOrchestrator } from '@/lib/upsell-orchestrator'

const orchestrator = useUpsellOrchestrator()

// Guard the open prop:
if (!orchestrator.canShowUpsell('pair')) return null

// On shown, record:
orchestrator.recordShown('pair', sourceItemId)

// On close/dismiss:
orchestrator.recordDismissed()

// Filter already-suggested items from suggestions:
const filteredSuggestions = orchestrator.filterSuggestedItems(suggestions)
```

- [ ] **Step 4: Add orchestrator check to BundleUpsellModal**

In `src/components/customer/bundle-upsell-modal.tsx`:

```typescript
import { useUpsellOrchestrator } from '@/lib/upsell-orchestrator'

const orchestrator = useUpsellOrchestrator()

if (!orchestrator.canShowUpsell('bundle')) return null

// On shown:
orchestrator.recordShown('bundle', sourceItemId)

// On dismiss:
orchestrator.recordDismissed()
```

- [ ] **Step 5: Add orchestrator check to UpsellSuggestionModal**

In `src/components/customer/upsell-suggestion-modal.tsx`:

```typescript
import { useUpsellOrchestrator } from '@/lib/upsell-orchestrator'

const orchestrator = useUpsellOrchestrator()

if (!orchestrator.canShowUpsell('pair')) return null

// On shown:
orchestrator.recordShown('pair', sourceItemId)

// On dismiss:
orchestrator.recordDismissed()
```

- [ ] **Step 6: Run lint and verify build**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/upsell-orchestrator.tsx src/components/customer/inline-upgrade-section.tsx src/components/customer/pair-suggestion-sheet.tsx src/components/customer/bundle-upsell-modal.tsx src/components/customer/upsell-suggestion-modal.tsx
git commit -m "feat: wire upsell orchestrator into all customer upsell components"
```

Find and add the layout file too.

---

## Phase 4: Performance & Preview

### Task 11: Performance Tab

**Files:**
- Create: `src/components/admin/boost-sales-performance-tab.tsx`

- [ ] **Step 1: Create the Performance tab component**

This tab shows upsell analytics. It uses Convex queries when available, falls back to an empty state.

```typescript
// src/components/admin/boost-sales-performance-tab.tsx
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, BarChart3, AlertTriangle } from 'lucide-react'

interface BoostSalesPerformanceTabProps {
  tenantId: string
  convexDeploymentUrl: string | null
}

export function BoostSalesPerformanceTab({
  tenantId,
  convexDeploymentUrl,
}: BoostSalesPerformanceTabProps) {
  // If no Convex URL, show setup prompt
  if (!convexDeploymentUrl) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold">Analytics Not Connected</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
              Connect your analytics backend to see upsell performance data.
              Track acceptance rates, revenue impact, and find what&apos;s working.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // When Convex is available, render the analytics dashboard.
  // This will use ConvexProvider + useQuery to fetch live data.
  return <PerformanceDashboard convexUrl={convexDeploymentUrl} tenantId={tenantId} />
}

function PerformanceDashboard({ convexUrl, tenantId }: { convexUrl: string; tenantId: string }) {
  // TODO in future: wire to Convex queries (getUpsellPerformanceSummary, etc.)
  // For now, render the layout with placeholder data structure

  const channels = [
    { name: 'Upgrade to Meal', shown: 0, accepted: 0, rate: '—', revenue: '—' },
    { name: 'Pair Suggestions', shown: 0, accepted: 0, rate: '—', revenue: '—' },
    { name: 'Checkout Picks', shown: 0, accepted: 0, rate: '—', revenue: '—' },
    { name: 'Bundle Upsell', shown: 0, accepted: 0, rate: '—', revenue: '—' },
  ]

  return (
    <div className="space-y-6">
      {/* Top-level metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Acceptance Rate</p>
            <p className="text-2xl font-bold mt-1">—</p>
            <p className="text-xs text-muted-foreground mt-1">Across all channels</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Revenue from Upsells</p>
            <p className="text-2xl font-bold mt-1">—</p>
            <p className="text-xs text-muted-foreground mt-1">Last 30 days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Extra per Order</p>
            <p className="text-2xl font-bold mt-1">—</p>
            <p className="text-xs text-muted-foreground mt-1">Avg from upsold items</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Best Channel</p>
            <p className="text-2xl font-bold mt-1">—</p>
            <p className="text-xs text-muted-foreground mt-1">Highest acceptance rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-channel breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Performance by Channel</CardTitle>
          <CardDescription>How each upsell type is performing</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">Channel</th>
                  <th className="pb-2 font-medium text-right">Shown</th>
                  <th className="pb-2 font-medium text-right">Accepted</th>
                  <th className="pb-2 font-medium text-right">Rate</th>
                  <th className="pb-2 font-medium text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((ch) => (
                  <tr key={ch.name} className="border-b last:border-0">
                    <td className="py-3">{ch.name}</td>
                    <td className="py-3 text-right text-muted-foreground">{ch.shown}</td>
                    <td className="py-3 text-right text-muted-foreground">{ch.accepted}</td>
                    <td className="py-3 text-right">{ch.rate}</td>
                    <td className="py-3 text-right">{ch.revenue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Data updates as customers interact with your upsell suggestions.
          </p>
        </CardContent>
      </Card>

      {/* Actionable nudges */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Tips to Improve
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Performance tips will appear here once you have enough data from customer interactions.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Verify lint passes**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/boost-sales-performance-tab.tsx
git commit -m "feat: add Performance tab with channel breakdown layout"
```

---

### Task 12: Upsell Preview Panel

**Files:**
- Create: `src/components/admin/upsell-preview-panel.tsx`

- [ ] **Step 1: Create the preview component**

This simulates the customer journey for a selected item, showing which upsell fires at each step.

```typescript
// src/components/admin/upsell-preview-panel.tsx
'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { X, Search, CheckCircle2, SkipForward, ShoppingCart, ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/lib/cart-utils'
import type { MenuItem, UpsellPairWithItems, BundleWithSlots } from '@/types/database'

interface MenuItemWithCategory extends MenuItem {
  category: { id: string; name: string } | null
}

interface UpsellPreviewPanelProps {
  menuItems: MenuItemWithCategory[]
  upsellPairs: UpsellPairWithItems[]
  bundles: BundleWithSlots[]
  tenantId: string
  onClose: () => void
}

type StepResult = {
  step: string
  label: string
  status: 'shown' | 'skipped' | 'none'
  detail: string
  items?: string[]
}

export function UpsellPreviewPanel({
  menuItems,
  upsellPairs,
  bundles,
  tenantId,
  onClose,
}: UpsellPreviewPanelProps) {
  const [search, setSearch] = useState('')
  const [selectedItem, setSelectedItem] = useState<MenuItemWithCategory | null>(null)

  const filteredItems = useMemo(() => {
    if (!search) return []
    const q = search.toLowerCase()
    return menuItems.filter(i => i.name.toLowerCase().includes(q)).slice(0, 6)
  }, [search, menuItems])

  // Simulate the orchestrator logic for the selected item
  const steps = useMemo((): StepResult[] => {
    if (!selectedItem) return []

    let budgetUsed = 0
    const results: StepResult[] = []

    // Step 1: Product page — check for upgrade pairs
    const upgradePairs = upsellPairs.filter(
      p => p.is_active && p.pair_type === 'upgrade' && p.source_item_id === selectedItem.id
    )
    const matchingBundles = bundles.filter(b =>
      b.is_active && b.show_as_upsell &&
      b.slots?.some(s => s.category_id === selectedItem.category_id)
    )

    if (upgradePairs.length > 0 && budgetUsed < 2) {
      results.push({
        step: '1',
        label: 'Product Page',
        status: 'shown',
        detail: `"Upgrade to Meal" — ${upgradePairs.length} upgrade option(s) available`,
        items: upgradePairs.map(p => p.target_item_id),
      })
      budgetUsed++
    } else if (matchingBundles.length > 0 && budgetUsed < 2) {
      results.push({
        step: '1',
        label: 'Product Page',
        status: 'shown',
        detail: `"Bundle Upsell" — ${matchingBundles.length} combo(s) suggested`,
        items: matchingBundles.map(b => b.name),
      })
      budgetUsed++
    } else {
      results.push({
        step: '1',
        label: 'Product Page',
        status: 'none',
        detail: 'No upgrade or bundle configured for this item',
      })
    }

    // Step 2: After add to cart — check for complementary pairs
    const compPairs = upsellPairs.filter(
      p => p.is_active && p.pair_type === 'complementary' && p.source_item_id === selectedItem.id
    )

    if (compPairs.length > 0 && budgetUsed < 2) {
      results.push({
        step: '2',
        label: 'After Add to Cart',
        status: 'shown',
        detail: `"Goes well with" — ${compPairs.length} suggestion(s)`,
      })
      budgetUsed++
    } else if (compPairs.length > 0 && budgetUsed >= 2) {
      results.push({
        step: '2',
        label: 'After Add to Cart',
        status: 'skipped',
        detail: 'Pair suggestion available but skipped — budget used by earlier prompt',
      })
    } else {
      results.push({
        step: '2',
        label: 'After Add to Cart',
        status: 'none',
        detail: 'No pair suggestions configured for this item',
      })
    }

    // Step 3: Checkout — always check for checkout picks
    const checkoutPicks = menuItems.filter(
      i => i.show_in_checkout_upsell && i.id !== selectedItem.id
    )

    if (checkoutPicks.length > 0) {
      results.push({
        step: '3',
        label: 'Checkout',
        status: 'shown',
        detail: `${checkoutPicks.length} checkout pick(s) available`,
        items: checkoutPicks.slice(0, 4).map(i => i.name),
      })
    } else {
      results.push({
        step: '3',
        label: 'Checkout',
        status: 'none',
        detail: 'No checkout picks configured',
      })
    }

    return results
  }, [selectedItem, upsellPairs, bundles, menuItems])

  const upsellMoments = steps.filter(s => s.status === 'shown').length

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Preview Customer Experience</CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {/* Item selector */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Select a menu item to simulate..."
            value={selectedItem ? selectedItem.name : search}
            onChange={(e) => {
              setSearch(e.target.value)
              setSelectedItem(null)
            }}
            className="pl-9"
          />
          {filteredItems.length > 0 && !selectedItem && (
            <div className="absolute z-10 top-full mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                  onClick={() => { setSelectedItem(item); setSearch('') }}
                >
                  {item.name} — {formatPrice(item.price)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Simulation results */}
        {selectedItem && steps.length > 0 && (
          <div className="space-y-3">
            {steps.map((step, i) => (
              <div key={step.step}>
                <div className="flex items-start gap-3">
                  {step.status === 'shown' ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                  ) : step.status === 'skipped' ? (
                    <SkipForward className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted mt-0.5 shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      Step {step.step}: {step.label}
                      {step.status === 'shown' && (
                        <Badge variant="outline" className="ml-2 text-green-700 border-green-300">Active</Badge>
                      )}
                      {step.status === 'skipped' && (
                        <Badge variant="outline" className="ml-2 text-amber-700 border-amber-300">Skipped</Badge>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">{step.detail}</p>
                    {step.items && step.items.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Items: {step.items.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
                {i < steps.length - 1 && (
                  <div className="ml-2.5 mt-1 mb-1 border-l-2 border-dashed h-4 border-muted" />
                )}
              </div>
            ))}

            <div className="pt-3 border-t">
              <p className="text-sm">
                Customer sees <span className="font-semibold">{upsellMoments} upsell moment{upsellMoments !== 1 ? 's' : ''}</span>.
              </p>
              {upsellMoments === 0 && (
                <p className="text-sm text-amber-600 mt-1">
                  No upsell moments for this item. Consider pushing it via the quick-add bar above.
                </p>
              )}
            </div>
          </div>
        )}

        {!selectedItem && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Search for a menu item to see what your customers will experience.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Verify lint passes**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/upsell-preview-panel.tsx
git commit -m "feat: add customer experience preview panel"
```

---

## Phase 5: Old Route Redirect + Cleanup

### Task 13: Redirect Old Routes and Final Wiring

**Files:**
- Modify: `src/app/[tenant]/admin/menu-engineering/page.tsx`
- Modify: `src/components/admin/boost-sales-dashboard.tsx` (remove placeholder comments)

- [ ] **Step 1: Make menu-engineering page redirect to boost-sales**

Replace the entire content of `src/app/[tenant]/admin/menu-engineering/page.tsx` with:

```typescript
import { redirect } from 'next/navigation'

export default async function MenuEngineeringPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  redirect(`/${tenantSlug}/admin/boost-sales`)
}
```

- [ ] **Step 2: Do the same for the bundles page if it exists**

Check if `src/app/[tenant]/admin/bundles/page.tsx` exists. If so, redirect it to boost-sales:

```typescript
import { redirect } from 'next/navigation'

export default async function BundlesPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  redirect(`/${tenantSlug}/admin/boost-sales`)
}
```

- [ ] **Step 3: Run full lint check**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 4: Run existing tests to verify nothing is broken**

Run: `npm test`
Expected: All existing tests pass. New tests (bcg-labels, upsell-orchestrator) also pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/[tenant]/admin/menu-engineering/page.tsx
git commit -m "feat: redirect old routes to Boost Sales, final wiring"
```

Add bundles page if it was modified too.

---

## Checkpoint: Review

At this point, the following should be working:

1. **Sidebar** shows "Boost Sales" instead of "Menu Engineering" + "Bundles"
2. **Boost Sales page** renders with Quick Stats bar, Push Item flow, 4 tabs
3. **Push Item flow** lets merchants search items and get auto-recommendations
4. **Pair Suggestions tab** uses merchant-friendly language
5. **Performance tab** shows analytics layout (wired to Convex when available)
6. **Preview panel** simulates customer journey for any selected item
7. **Orchestrator** limits customer-side upsell prompts to max 2 per session
8. **Old routes** redirect to the new page
9. **All tests pass** (bcg-labels, upsell-orchestrator, plus existing)

Verify by running:
```bash
npm run lint && npm test && npm run build
```
