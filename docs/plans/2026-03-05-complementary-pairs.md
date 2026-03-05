# Complementary Pairs ("Perfect With") Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate complementary upselling from upgrade upselling with a dedicated `complementary_pairs` table, supporting both item-level and category-level pairing, with a new admin tab and redesigned customer UI matching the checkout interstitial.

**Architecture:** New `complementary_pairs` table with `source_type` discriminator (item/category). Resolution: item-level overrides category-level, max 4 items. Existing `upsell_pairs` becomes upgrade-only. Customer UI reuses checkout interstitial card design. Admin gets a new "Complementary Pairs" tab in Menu Engineering dashboard.

**Tech Stack:** Supabase PostgreSQL (migration + RLS), Next.js Server Actions, React (Shadcn/Radix tabs, selects, buttons), Framer Motion, TanStack React Query.

**Design doc:** `docs/plans/2026-03-05-complementary-pairs-design.md`

---

### Task 1: Database Migration — Create `complementary_pairs` table

**Files:**
- Create: `supabase/migrations/XXXXXX_create_complementary_pairs.sql` (via Supabase MCP)

**Step 1: Apply migration via Supabase MCP**

```sql
-- Create complementary_pairs table
CREATE TABLE IF NOT EXISTS complementary_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('item', 'category')),
  source_item_id uuid REFERENCES menu_items(id) ON DELETE CASCADE,
  source_category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  target_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Ensure exactly one source is set based on source_type
  CONSTRAINT complementary_pairs_source_check CHECK (
    (source_type = 'item' AND source_item_id IS NOT NULL AND source_category_id IS NULL) OR
    (source_type = 'category' AND source_category_id IS NOT NULL AND source_item_id IS NULL)
  ),

  -- No duplicate pairs
  CONSTRAINT complementary_pairs_unique UNIQUE (
    tenant_id, source_type,
    COALESCE(source_item_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(source_category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    target_item_id
  )
);

-- Index for item-level lookups
CREATE INDEX idx_complementary_pairs_item
  ON complementary_pairs (tenant_id, source_item_id)
  WHERE source_type = 'item' AND is_active = true;

-- Index for category-level lookups
CREATE INDEX idx_complementary_pairs_category
  ON complementary_pairs (tenant_id, source_category_id)
  WHERE source_type = 'category' AND is_active = true;

-- Enable RLS
ALTER TABLE complementary_pairs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Tenants can view own complementary pairs"
  ON complementary_pairs FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY "Tenants can manage own complementary pairs"
  ON complementary_pairs FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Allow service role full access
CREATE POLICY "Service role full access on complementary_pairs"
  ON complementary_pairs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

**Step 2: Migrate existing complementary pairs from upsell_pairs**

```sql
-- Migrate existing complementary pairs to new table
INSERT INTO complementary_pairs (tenant_id, source_type, source_item_id, target_item_id, display_order, is_active, created_at, updated_at)
SELECT tenant_id, 'item', source_item_id, target_item_id, display_order, is_active, created_at, updated_at
FROM upsell_pairs
WHERE pair_type = 'complementary'
ON CONFLICT DO NOTHING;

-- Remove migrated complementary pairs from upsell_pairs
DELETE FROM upsell_pairs WHERE pair_type = 'complementary';
```

**Step 3: Verify migration**

Run SQL: `SELECT count(*) FROM complementary_pairs;` and `SELECT count(*) FROM upsell_pairs WHERE pair_type = 'complementary';` (should be 0).

**Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: create complementary_pairs table with item/category support"
```

---

### Task 2: TypeScript Types — Add `ComplementaryPair` interface

**Files:**
- Modify: `src/types/database.ts:395-425` (after existing UpsellPair types)

**Step 1: Add ComplementaryPair interface**

Add after the `UpsellPairWithItems` interface (around line 425) in `src/types/database.ts`:

```typescript
// Complementary Pairs (Phase 2 — "Perfect With")
export interface ComplementaryPair {
  id: string
  tenant_id: string
  source_type: 'item' | 'category'
  source_item_id: string | null
  source_category_id: string | null
  target_item_id: string
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ComplementaryPairWithTarget extends ComplementaryPair {
  target_item: MenuItem
}

export interface ComplementaryPairWithDetails extends ComplementaryPair {
  target_item: MenuItem
  source_item?: MenuItem
  source_category?: Category
}
```

**Step 2: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add ComplementaryPair TypeScript interfaces"
```

---

### Task 3: Service Layer — Create `complementary-pairs-service.ts`

**Files:**
- Create: `src/lib/complementary-pairs-service.ts`
- Reference: `src/lib/menu-engineering-service.ts:208-247` (pattern for Supabase queries)

**Step 1: Write the service file**

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { MenuItem, ComplementaryPair, ComplementaryPairWithDetails } from '@/types/database'

/**
 * Get complementary items for a menu item.
 * Resolution: item-level pairs override category-level pairs, max 4 items.
 */
export async function getComplementaryItems(
  itemId: string,
  categoryId: string,
  tenantId: string
): Promise<MenuItem[]> {
  const supabase = await createClient()

  // 1. Try item-level pairs first
  const { data: itemPairs } = await supabase
    .from('complementary_pairs')
    .select('target_item_id, display_order, target_item:menu_items!target_item_id(*)')
    .eq('tenant_id', tenantId)
    .eq('source_type', 'item')
    .eq('source_item_id', itemId)
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .limit(4)

  if (itemPairs && itemPairs.length > 0) {
    return itemPairs
      .map((p: Record<string, unknown>) => p.target_item as MenuItem)
      .filter((item: MenuItem) => item && item.is_available)
  }

  // 2. Fall back to category-level pairs
  const { data: categoryPairs } = await supabase
    .from('complementary_pairs')
    .select('target_item_id, display_order, target_item:menu_items!target_item_id(*)')
    .eq('tenant_id', tenantId)
    .eq('source_type', 'category')
    .eq('source_category_id', categoryId)
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .limit(4)

  if (categoryPairs && categoryPairs.length > 0) {
    return categoryPairs
      .map((p: Record<string, unknown>) => p.target_item as MenuItem)
      .filter((item: MenuItem) => item && item.is_available)
  }

  return []
}

/**
 * Get all complementary pairs for a tenant (admin list).
 */
export async function getComplementaryPairsByTenant(
  tenantId: string
): Promise<ComplementaryPairWithDetails[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('complementary_pairs')
    .select(`
      *,
      target_item:menu_items!target_item_id(id, name, price, discounted_price, image_url, is_available),
      source_item:menu_items!source_item_id(id, name, image_url),
      source_category:categories!source_category_id(id, name)
    `)
    .eq('tenant_id', tenantId)
    .order('source_type', { ascending: true })
    .order('display_order', { ascending: true })

  if (error) {
    console.error('Error fetching complementary pairs:', error)
    return []
  }

  return (data || []) as unknown as ComplementaryPairWithDetails[]
}

/**
 * Create complementary pairs (bulk — one source to multiple targets).
 */
export async function createComplementaryPairs(
  tenantId: string,
  sourceType: 'item' | 'category',
  sourceId: string,
  targetItemIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient()

  const rows = targetItemIds.map((targetId, index) => ({
    tenant_id: tenantId,
    source_type: sourceType,
    source_item_id: sourceType === 'item' ? sourceId : null,
    source_category_id: sourceType === 'category' ? sourceId : null,
    target_item_id: targetId,
    display_order: index,
    is_active: true,
  }))

  // @ts-expect-error Supabase types don't know about complementary_pairs yet
  const { error } = await supabase.from('complementary_pairs').insert(rows)

  if (error) {
    console.error('Error creating complementary pairs:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Delete a complementary pair.
 */
export async function deleteComplementaryPair(
  id: string,
  tenantId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient()

  // @ts-expect-error Supabase types don't know about complementary_pairs yet
  const { error } = await supabase
    .from('complementary_pairs')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error) {
    console.error('Error deleting complementary pair:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Delete all complementary pairs for a source (used when re-setting pairs).
 */
export async function deleteComplementaryPairsForSource(
  tenantId: string,
  sourceType: 'item' | 'category',
  sourceId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient()

  let query = supabase
    .from('complementary_pairs')
    // @ts-expect-error Supabase types don't know about complementary_pairs yet
    .delete()
    .eq('tenant_id', tenantId)
    .eq('source_type', sourceType)

  if (sourceType === 'item') {
    query = query.eq('source_item_id', sourceId)
  } else {
    query = query.eq('source_category_id', sourceId)
  }

  const { error } = await query

  if (error) {
    console.error('Error deleting complementary pairs for source:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}
```

**Step 2: Commit**

```bash
git add src/lib/complementary-pairs-service.ts
git commit -m "feat: add complementary-pairs-service with item/category resolution"
```

---

### Task 4: Server Actions — Create `complementary-pairs.ts` actions

**Files:**
- Create: `src/app/actions/complementary-pairs.ts`
- Reference: `src/app/actions/menu-engineering.ts:137-168` (pattern for revalidation)

**Step 1: Write the actions file**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import {
  getComplementaryItems,
  getComplementaryPairsByTenant,
  createComplementaryPairs,
  deleteComplementaryPair,
  deleteComplementaryPairsForSource,
} from '@/lib/complementary-pairs-service'
import type { MenuItem, ComplementaryPairWithDetails } from '@/types/database'

export async function getComplementaryItemsAction(
  itemId: string,
  categoryId: string,
  tenantId: string
): Promise<MenuItem[]> {
  return getComplementaryItems(itemId, categoryId, tenantId)
}

export async function getComplementaryPairsAction(
  tenantId: string
): Promise<ComplementaryPairWithDetails[]> {
  return getComplementaryPairsByTenant(tenantId)
}

export async function createComplementaryPairsAction(
  tenantId: string,
  tenantSlug: string,
  sourceType: 'item' | 'category',
  sourceId: string,
  targetItemIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const result = await createComplementaryPairs(tenantId, sourceType, sourceId, targetItemIds)

  if (result.success) {
    revalidatePath(`/${tenantSlug}/admin/menu-engineering`)
    revalidatePath(`/${tenantSlug}/menu`, 'layout')
  }

  return result
}

export async function deleteComplementaryPairAction(
  id: string,
  tenantId: string,
  tenantSlug: string
): Promise<{ success: boolean; error?: string }> {
  const result = await deleteComplementaryPair(id, tenantId)

  if (result.success) {
    revalidatePath(`/${tenantSlug}/admin/menu-engineering`)
    revalidatePath(`/${tenantSlug}/menu`, 'layout')
  }

  return result
}

export async function updateComplementaryPairsAction(
  tenantId: string,
  tenantSlug: string,
  sourceType: 'item' | 'category',
  sourceId: string,
  targetItemIds: string[]
): Promise<{ success: boolean; error?: string }> {
  // Delete existing pairs for this source, then create new ones
  const deleteResult = await deleteComplementaryPairsForSource(tenantId, sourceType, sourceId)
  if (!deleteResult.success) return deleteResult

  if (targetItemIds.length === 0) {
    revalidatePath(`/${tenantSlug}/admin/menu-engineering`)
    revalidatePath(`/${tenantSlug}/menu`, 'layout')
    return { success: true }
  }

  const createResult = await createComplementaryPairs(tenantId, sourceType, sourceId, targetItemIds)

  if (createResult.success) {
    revalidatePath(`/${tenantSlug}/admin/menu-engineering`)
    revalidatePath(`/${tenantSlug}/menu`, 'layout')
  }

  return createResult
}
```

**Step 2: Commit**

```bash
git add src/app/actions/complementary-pairs.ts
git commit -m "feat: add server actions for complementary pairs CRUD"
```

---

### Task 5: Update Data Loading — Wire `product-detail-data.ts` to new table

**Files:**
- Modify: `src/lib/product-detail-data.ts:276-359` (replace complementary query)

**Step 1: Update `getCachedUpsellsForItem`**

In `src/lib/product-detail-data.ts`, the function `getCachedUpsellsForItem` (lines 276-359) currently queries `upsell_pairs` for complementary pairs. Replace the complementary query portion with a call to the new service.

Replace the existing `getCachedUpsellsForItem` function:
- Remove the `complementaryResult` query from `Promise.all` (lines 285-297)
- Import `getComplementaryItems` from `@/lib/complementary-pairs-service`
- Query new `complementary_pairs` table instead
- The function also needs the item's `category_id` as a parameter (currently only takes `itemId` and `tenantId`)

**Changes:**
1. Add import: `import { getComplementaryItems } from '@/lib/complementary-pairs-service'`
2. Update function signature to accept `categoryId: string`
3. Replace complementary query with `getComplementaryItems(itemId, categoryId, tenantId)`
4. Keep upgrade query as-is (still from `upsell_pairs`)

The calling code in `product-detail-data.ts` (or the page that calls it) must pass `categoryId` from the menu item.

**Step 2: Update callers**

Find where `getCachedUpsellsForItem` is called (likely in `src/app/[tenant]/menu/item/[itemId]/page.tsx` or the product detail data loading) and pass `categoryId`.

**Step 3: Verify build**

Run: `npm run build` — should compile without errors.

**Step 4: Commit**

```bash
git add src/lib/product-detail-data.ts src/lib/complementary-pairs-service.ts
git commit -m "feat: wire product detail data loading to complementary_pairs table"
```

---

### Task 6: Redesign `PairSuggestionSheet` to match checkout interstitial

**Files:**
- Modify: `src/components/customer/pair-suggestion-sheet.tsx` (full file, 270 lines)
- Reference: `src/components/customer/checkout-upsell-modal.tsx:76-168` (ItemCard to match)

**Step 1: Redesign the PairSuggestionSheet**

Rewrite `pair-suggestion-sheet.tsx` to visually match `checkout-upsell-modal.tsx`:

Key changes from current implementation:
- Grid: change from `grid-cols-2` to responsive `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`
- Card design: match `ItemCard` from checkout-upsell-modal exactly:
  - `aspect-[4/3]` images (not `aspect-square`)
  - Same border, padding, text sizing
  - Same "Added!" overlay with green checkmark
- Title stays "Perfect with [Item Name]"
- Subtitle stays "Complete your meal"
- Dismiss button: change from "Not Today" to "Continue" (primary action text)
- Keep all existing analytics tracking (`upsell_shown`, `upsell_clicked`, `upsell_dismissed` with `source: 'pair_suggestion'`)
- Keep all existing props interface
- Keep Framer Motion animations

**Step 2: Test visually**

Run dev server: `npm run dev`
Navigate to a product detail page with complementary pairs configured.
Tap "Add to Cart" — the redesigned sheet should appear matching the checkout interstitial style.

**Step 3: Commit**

```bash
git add src/components/customer/pair-suggestion-sheet.tsx
git commit -m "feat: redesign PairSuggestionSheet to match checkout interstitial"
```

---

### Task 7: Admin Component — Create `ComplementaryPairsTab`

**Files:**
- Create: `src/components/admin/complementary-pairs-tab.tsx`
- Reference: `src/components/admin/upsell-pairs-tab.tsx` (similar pattern, 588 lines)
- Reference: `src/components/admin/checkout-upsell-settings-tab.tsx` (tab pattern)

**Step 1: Write the admin tab component**

Create `src/components/admin/complementary-pairs-tab.tsx`:

The component should have:

**Props:**
```typescript
interface ComplementaryPairsTabProps {
  menuItems: MenuItemWithCategory[]
  categories: Category[]
  tenantId: string
  tenantSlug: string
}
```

**Create Pair Form (top section):**
- Segment control / radio group: "Per Item" / "Per Category"
- **Per Item mode:**
  - Source: searchable Select dropdown of all menu items (grouped by category)
  - Targets: multi-select of menu items (max 4, exclude source item). Show thumbnails.
- **Per Category mode:**
  - Source: Select dropdown of all categories
  - Targets: multi-select of menu items (max 4). Show thumbnails.
  - Helper text: "These will show for all items in [Category] unless overridden at item level"
- "Save Pairs" button → calls `updateComplementaryPairsAction` (clears existing + creates new)
- Toast on success/error

**Existing Pairs List (bottom section):**
- Filter: "All" / "Item Pairs" / "Category Pairs" tabs or buttons
- Each row:
  - Source badge: item name (with thumbnail) or category name (with icon)
  - Arrow →
  - Target items: row of up to 4 small thumbnails with names
  - "Edit" button → populates the form above with this pair's data
  - "Delete" button → confirms and deletes via `deleteComplementaryPairAction`
- Empty state: "No complementary pairs configured. Add pairs above to show 'Perfect with' suggestions to customers."

**Data loading:**
- On mount, call `getComplementaryPairsAction(tenantId)` to populate the list
- After create/delete, refetch the list

**Step 2: Commit**

```bash
git add src/components/admin/complementary-pairs-tab.tsx
git commit -m "feat: add ComplementaryPairsTab admin component"
```

---

### Task 8: Wire Admin Tab into Menu Engineering Dashboard

**Files:**
- Modify: `src/components/admin/menu-engineering-dashboard.tsx:7-27,64-107` (add tab import + render)
- Modify: `src/app/[tenant]/admin/menu-engineering/page.tsx:27-31,49-59` (pass categories prop)

**Step 1: Add dynamic import in dashboard**

In `src/components/admin/menu-engineering-dashboard.tsx`, add after line 26:

```typescript
const ComplementaryPairsTab = dynamic(
  () => import('@/components/admin/complementary-pairs-tab').then(mod => ({ default: mod.ComplementaryPairsTab })),
  { ssr: false, loading: () => <div className="p-8 text-center text-gray-500">Loading...</div> }
)
```

**Step 2: Add `categories` to props interface**

In `MenuEngineeringDashboardProps` (line 36-46), add `categories` if not already present:

```typescript
categories: Category[]
```

**Step 3: Add tab trigger and content**

In the `<TabsList>` (lines 65-70), add a new trigger:

```tsx
<TabsTrigger value="complementary">Complementary</TabsTrigger>
```

Add the tab content after the Smart Pairs tab content (after line 107):

```tsx
<TabsContent value="complementary">
  <ComplementaryPairsTab
    menuItems={menuItemsWithCategory}
    categories={categories}
    tenantId={tenantId}
    tenantSlug={tenantSlug}
  />
</TabsContent>
```

**Step 4: Ensure page passes categories**

In `src/app/[tenant]/admin/menu-engineering/page.tsx`, verify `categories` is fetched (line 27-31) and passed to `<MenuEngineeringDashboard>` (line 49-59).

**Step 5: Commit**

```bash
git add src/components/admin/menu-engineering-dashboard.tsx src/app/[tenant]/admin/menu-engineering/page.tsx
git commit -m "feat: add Complementary Pairs tab to Menu Engineering dashboard"
```

---

### Task 9: Clean Up Upsell Pairs Tab — Remove Complementary Option

**Files:**
- Modify: `src/components/admin/upsell-pairs-tab.tsx:232-282` (pair type selector)
- Modify: `src/components/admin/upsell-pairs-tab.tsx:437-462` (filter)

**Step 1: Remove complementary pair type from creation form**

In the pair type selector (lines 232-282), remove the "Complementary" option. The tab should only allow creating `upgrade` pairs now. Set `pairType` default to `'upgrade'` and remove the selector entirely (or keep it disabled showing "Upgrade" only).

**Step 2: Remove complementary filter from existing pairs list**

In the filter section (lines 437-462), remove the "Complementary" filter option. Only show upgrade pairs in this tab.

**Step 3: Filter out any remaining complementary pairs from display**

Add `.filter(p => p.pair_type === 'upgrade')` to the pairs list rendering if needed.

**Step 4: Commit**

```bash
git add src/components/admin/upsell-pairs-tab.tsx
git commit -m "refactor: make upsell-pairs-tab upgrade-only, complementary moved to dedicated tab"
```

---

### Task 10: Lint, Build Verification, and Final Cleanup

**Files:**
- All modified files

**Step 1: Run linter**

Run: `npm run lint`
Fix any lint errors.

**Step 2: Run build**

Run: `npm run build`
Fix any type errors or build failures.

**Step 3: Run existing tests**

Run: `npm run test`
Ensure no regressions.

**Step 4: Manual smoke test checklist**

- [ ] Admin: Menu Engineering → "Complementary" tab loads
- [ ] Admin: Can create item-level complementary pair (select source item + up to 4 targets)
- [ ] Admin: Can create category-level complementary pair (select source category + up to 4 targets)
- [ ] Admin: Pairs list shows both item and category pairs with filter
- [ ] Admin: Can delete a pair
- [ ] Admin: "Upsell Pairs" tab only shows upgrade pairs now
- [ ] Customer: Add item with item-level pairs → "Perfect with" screen appears
- [ ] Customer: Add item without item-level pairs but with category-level pairs → category pairs shown
- [ ] Customer: Add item with no pairs → no interstitial, normal add-to-cart flow
- [ ] Customer: Can add complementary items from the interstitial
- [ ] Customer: "Continue" button navigates back to menu

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: lint fixes and final cleanup for complementary pairs feature"
```
