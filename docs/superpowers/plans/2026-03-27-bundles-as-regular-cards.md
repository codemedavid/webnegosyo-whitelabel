# Bundles as Regular Cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bundles appear as a pinned "Bundles" category using regular card templates, and show bundle items in the cart drawer.

**Architecture:** Adapter pattern — `bundleToMenuItem()` maps bundle data to MenuItem shape at the display layer. Virtual "Bundles" category injected first. Click handler in `menu-client.tsx` intercepts bundle items to open customization modal. Cart drawer renders bundle line items alongside regular items.

**Tech Stack:** TypeScript, React, Next.js App Router, existing card template system, existing cart hook

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/bundle-adapter.ts` | Create | `bundleToMenuItem()` adapter + `BundleMenuItem` type |
| `src/app/[tenant]/menu/menu-client.tsx` | Modify | Remove BundlesSection, inject virtual category + adapted items, intercept bundle clicks |
| `src/components/customer/cart-drawer.tsx` | Modify | Add bundle line items rendering |

---

### Task 1: Create the Bundle Adapter

**Files:**
- Create: `src/lib/bundle-adapter.ts`

- [ ] **Step 1: Create `src/lib/bundle-adapter.ts`**

```typescript
import type { MenuItem } from '@/types/database'
import type { BundleWithItems } from '@/lib/bundles-service'

export interface BundleMenuItem extends MenuItem {
  _isBundle: true
  _bundleData: BundleWithItems
}

/**
 * Map a BundleWithItems to a MenuItem-compatible shape for card rendering.
 * Attaches `_isBundle` and `_bundleData` for click handler detection.
 */
export function bundleToMenuItem(bundle: BundleWithItems): BundleMenuItem {
  const items = bundle.items ?? []

  // Calculate original total from component items
  const originalTotal = items.reduce(
    (sum, bi) => sum + (bi.menu_item?.price ?? 0) * bi.quantity,
    0
  )

  // Calculate bundle price
  let bundlePrice: number
  if (bundle.pricing_type === 'fixed') {
    bundlePrice = bundle.fixed_price ?? 0
  } else {
    const discountPercent = Math.min(bundle.discount_percent ?? 0, 100)
    bundlePrice = Math.max(0, Math.round(originalTotal * (1 - discountPercent / 100) * 100) / 100)
  }

  // Auto-generate description from item names if none provided
  const autoDescription = items
    .map((bi) => {
      const name = bi.menu_item?.name ?? 'Item'
      return bi.quantity > 1 ? `${bi.quantity}× ${name}` : name
    })
    .join(' + ')

  // Use bundle image, fall back to first item's image
  const imageUrl =
    bundle.image_url ||
    items[0]?.menu_item?.image_url ||
    ''

  return {
    id: `bundle_${bundle.id}`,
    tenant_id: bundle.tenant_id,
    category_id: 'bundles',
    name: bundle.name,
    description: bundle.description || autoDescription,
    price: bundlePrice,
    discounted_price: originalTotal > bundlePrice ? originalTotal : undefined,
    image_url: imageUrl,
    variation_types: [],
    variations: [],
    addons: [],
    is_available: bundle.is_active,
    is_featured: false,
    order: bundle.display_order,
    created_at: bundle.created_at,
    updated_at: bundle.updated_at,
    _isBundle: true,
    _bundleData: bundle,
  }
}

/** Type guard: is this MenuItem actually an adapted bundle? */
export function isBundleMenuItem(item: MenuItem): item is BundleMenuItem {
  return '_isBundle' in item && (item as BundleMenuItem)._isBundle === true
}
```

- [ ] **Step 2: Verify file compiles**

Run: `npx tsc --noEmit src/lib/bundle-adapter.ts 2>&1 | head -20`
Expected: No errors (or only unrelated pre-existing errors)

- [ ] **Step 3: Commit**

```bash
git add src/lib/bundle-adapter.ts
git commit -m "feat: add bundle-to-menu-item adapter for card rendering"
```

---

### Task 2: Integrate Bundles into Menu Layout

**Files:**
- Modify: `src/app/[tenant]/menu/menu-client.tsx`

This task removes the separate `BundlesSection`, creates a virtual "Bundles" category, converts bundles to MenuItems, and intercepts bundle card clicks.

- [ ] **Step 1: Add imports for the adapter**

At the top of `menu-client.tsx`, add after the existing imports (around line 17):

```typescript
import { bundleToMenuItem, isBundleMenuItem } from '@/lib/bundle-adapter'
import type { Category } from '@/types/database'
```

Note: `Category` is already imported on line 14 — just add the bundle adapter import.

- [ ] **Step 2: Remove the BundlesSection dynamic import**

Remove these lines (53-58):

```typescript
// BundlesSection is conditionally rendered and may not appear at all; lazy-load it
// so it does not inflate the main bundle when bundles are not configured.
const BundlesSection = dynamic(
  () => import('@/components/customer/bundles-section').then(mod => ({ default: mod.BundlesSection })),
  { ssr: false }
)
```

- [ ] **Step 3: Add `useMemo` to create virtual category + adapted items**

Inside the `MenuClient` component, after the `filteredItems` useMemo (around line 163), add:

```typescript
// Virtual "Bundles" category + adapted bundle items
const { categoriesWithBundles, allItemsWithBundles } = useMemo(() => {
  if (bundles.length === 0) {
    return { categoriesWithBundles: categories, allItemsWithBundles: allMenuItems }
  }

  const bundleCategory: Category = {
    id: 'bundles',
    tenant_id: tenant?.id ?? '',
    name: 'Bundles',
    description: 'Special bundle deals',
    order: -1,
    is_active: true,
    display_layout: 'grid',
    created_at: '',
    updated_at: '',
  }

  const bundleMenuItems = bundles.map(bundleToMenuItem)

  return {
    categoriesWithBundles: [bundleCategory, ...categories],
    allItemsWithBundles: [...bundleMenuItems, ...allMenuItems],
  }
}, [bundles, categories, allMenuItems, tenant?.id])
```

- [ ] **Step 4: Update `filteredItems` to use `allItemsWithBundles`**

Change the `filteredItems` useMemo (line 135) to use `allItemsWithBundles` instead of `allMenuItems`:

Replace:
```typescript
const filteredItems = useMemo(() => {
    const query = debouncedSearchQuery.trim().toLowerCase()
    const items = allMenuItems.filter((item) => {
```

With:
```typescript
const filteredItems = useMemo(() => {
    const query = debouncedSearchQuery.trim().toLowerCase()
    const items = allItemsWithBundles.filter((item) => {
```

And update the dependency array at the end from `allMenuItems` to `allItemsWithBundles`:

Replace:
```typescript
}, [allMenuItems, activeCategory, debouncedSearchQuery, tenant?.menu_engineering_enabled])
```

With:
```typescript
}, [allItemsWithBundles, activeCategory, debouncedSearchQuery, tenant?.menu_engineering_enabled])
```

**Important ordering note:** The `categoriesWithBundles`/`allItemsWithBundles` useMemo must be placed **before** the `filteredItems` useMemo since `filteredItems` depends on `allItemsWithBundles`. Move the new useMemo above `filteredItems`.

- [ ] **Step 5: Update `handleItemSelect` to intercept bundle clicks**

Replace the existing `handleItemSelect` callback (lines 197-208):

```typescript
const handleItemSelect = useCallback((item: MenuItem) => {
    if (isBundleMenuItem(item)) {
      setSelectedBundle(item._bundleData)
      return
    }
    const hasCustomizations =
      item.variations.length > 0 ||
      (item.variation_types && item.variation_types.length > 0) ||
      item.addons.length > 0
    if (!hasCustomizations && !tenant?.menu_engineering_enabled) {
      addItem(item, undefined, [], 1, undefined)
      toast.success(`Added ${item.name} to cart`)
    } else {
      router.push(`/${tenantSlug}/menu/item/${item.id}`, { scroll: true })
    }
  }, [tenant?.menu_engineering_enabled, addItem, router, tenantSlug])
```

- [ ] **Step 6: Remove the BundlesSection JSX block**

Remove lines 573-583 (the bundles section rendering in the `<main>` tag):

```tsx
{/* Bundles section — shown at top when no active category filter */}
{bundles.length > 0 && !activeCategory && (
  <div className="mb-12">
    <BundlesSection
      bundles={bundles}
      onBundleSelect={setSelectedBundle}
      branding={branding}
      hideCurrencySymbol={!!(tenant?.menu_engineering_enabled && tenant?.hide_currency_symbol)}
    />
  </div>
)}
```

- [ ] **Step 7: Replace `categories` with `categoriesWithBundles` in all JSX**

In the JSX, replace every `categories` reference passed to `CategorySubmenu` and `MenuLayout` with `categoriesWithBundles`. There are multiple instances:

1. The `categories.length > 0` check (line 502) → `categoriesWithBundles.length > 0`
2. Every `categories={categories}` prop → `categories={categoriesWithBundles}`

There are 5 instances of `categories={categories}` in the component:
- 3 in `CategorySubmenu` components (lines 508, 520, 533)
- 3+ in `MenuLayout` components (lines 593, 619, 647)

Replace all with `categories={categoriesWithBundles}`.

- [ ] **Step 8: Verify the build compiles**

Run: `npx next build 2>&1 | tail -30`

If there are lint/type errors, fix them before proceeding.

- [ ] **Step 9: Commit**

```bash
git add src/app/[tenant]/menu/menu-client.tsx
git commit -m "feat: render bundles as regular cards in virtual Bundles category"
```

---

### Task 3: Add Bundle Items to Cart Drawer

**Files:**
- Modify: `src/components/customer/cart-drawer.tsx`

- [ ] **Step 1: Add bundle-related imports**

At the top of `cart-drawer.tsx`, add to the existing `useCart` destructure and imports:

Add `Package` to the lucide-react import:
```typescript
import { ShoppingCart, Minus, Plus, Trash2, Package } from 'lucide-react'
```

Add to the `cart-utils` import:
```typescript
import { formatPrice, calculateBundleSubtotal } from '@/lib/cart-utils'
```

Add `CartBundleItem` to the database types import:
```typescript
import type { CartItem, CartBundleItem } from '@/types/database'
```

- [ ] **Step 2: Destructure bundle methods from `useCart`**

Update the `useCart` destructure (line 60):

Replace:
```typescript
const { items, total, updateQuantity, removeItem } = useCart()
```

With:
```typescript
const { items, total, updateQuantity, removeItem, bundleItems, updateBundleQuantity, removeBundleFromCart } = useCart()
```

- [ ] **Step 3: Add bundle removal state and handlers**

After the existing `itemToRemove` state (line 61), add:

```typescript
const [bundleToRemove, setBundleToRemove] = useState<CartBundleItem | null>(null)
```

Add handlers after `handleCancelRemove` (line 100):

```typescript
const handleDecreaseBundleQuantity = (bundle: CartBundleItem) => {
  if (bundle.quantity <= 1) {
    setBundleToRemove(bundle)
  } else {
    updateBundleQuantity(bundle.id, bundle.quantity - 1)
  }
}

const handleConfirmBundleRemove = () => {
  if (bundleToRemove) {
    removeBundleFromCart(bundleToRemove.id)
    setBundleToRemove(null)
  }
}
```

- [ ] **Step 4: Update empty state check to include bundles**

Replace the empty check (line 121):

```typescript
{items.length === 0 ? (
```

With:

```typescript
{items.length === 0 && bundleItems.length === 0 ? (
```

- [ ] **Step 5: Update cart item count in header**

Replace the header item count display (line 116):

```typescript
<p className="text-[11px] font-normal text-gray-500 leading-tight">({items.length} items)</p>
```

With:

```typescript
<p className="text-[11px] font-normal text-gray-500 leading-tight">({items.length + bundleItems.length} items)</p>
```

- [ ] **Step 6: Add bundle items rendering after regular items**

Inside the `ScrollArea`, after the `items.map(...)` closing `)}` and before `</div></ScrollArea>` (after line 242), add:

```tsx
{bundleItems.map((bundleItem, index) => (
  <div key={bundleItem.id} className="group flex gap-3 rounded-xl bg-white p-4 shadow-sm border border-gray-100">
    <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
      {bundleItem.bundle.image_url || bundleItem.customizations[0]?.menu_item?.image_url ? (
        <OptimizedImage
          src={bundleItem.bundle.image_url || bundleItem.customizations[0]?.menu_item?.image_url || ''}
          alt={bundleItem.bundle.name}
          fill
          className="object-cover group-hover:scale-105 transition-transform"
          sizes="64px"
          lazy={index > 1}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Package className="h-6 w-6 text-gray-400" />
        </div>
      )}
    </div>

    <div className="flex flex-1 flex-col min-w-0">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm line-clamp-1 text-gray-900">
            {bundleItem.bundle.name}
          </h4>
          <Badge
            variant="outline"
            className="mt-1 text-xs"
            style={{
              borderColor: `${branding.primary}40`,
              color: branding.primary,
              backgroundColor: `${branding.primary}10`
            }}
          >
            {bundleItem.customizations.length} items
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 touch-manipulation"
          onClick={() => setBundleToRemove(bundleItem)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full hover:bg-orange-50 border-gray-200 touch-manipulation"
            onClick={() => handleDecreaseBundleQuantity(bundleItem)}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-8 text-center text-sm font-bold text-gray-900">
            {bundleItem.quantity}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full hover:bg-orange-50 border-gray-200 touch-manipulation"
            onClick={() => updateBundleQuantity(bundleItem.id, bundleItem.quantity + 1)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <span className="font-bold text-sm" style={{ color: branding.primary }}>
          {formatPrice(bundleItem.subtotal)}
        </span>
      </div>
    </div>
  </div>
))}
```

- [ ] **Step 7: Update footer item count text**

Replace the footer text (line 281):

```typescript
<p className="text-xs text-center text-gray-500 pt-2 pb-10">
  {items.length} item{items.length !== 1 ? 's' : ''} in cart
</p>
```

With:

```typescript
<p className="text-xs text-center text-gray-500 pt-2 pb-10">
  {items.length + bundleItems.length} item{items.length + bundleItems.length !== 1 ? 's' : ''} in cart
</p>
```

- [ ] **Step 8: Add bundle removal confirmation dialog**

After the existing `AlertDialog` (after line 311), add:

```tsx
<AlertDialog open={!!bundleToRemove} onOpenChange={(open) => !open && setBundleToRemove(null)}>
  <AlertDialogContent className="max-w-sm rounded-2xl">
    <AlertDialogHeader>
      <AlertDialogTitle className="text-center">Remove Bundle?</AlertDialogTitle>
      <AlertDialogDescription className="text-center">
        Do you want to remove <span className="font-semibold text-gray-900">{bundleToRemove?.bundle.name}</span> from your cart?
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter className="flex-row gap-3 sm:justify-center">
      <AlertDialogCancel className="flex-1 mt-0 rounded-xl">
        Keep Bundle
      </AlertDialogCancel>
      <AlertDialogAction
        className="flex-1 bg-red-500 hover:bg-red-600 rounded-xl"
        onClick={handleConfirmBundleRemove}
      >
        Remove
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 9: Verify the build compiles**

Run: `npx next build 2>&1 | tail -30`

Fix any lint or type errors.

- [ ] **Step 10: Commit**

```bash
git add src/components/customer/cart-drawer.tsx
git commit -m "feat: display bundle items in cart drawer with quantity controls"
```

---

### Task 4: Lint Check and Final Verification

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: No new errors introduced by our changes.

- [ ] **Step 2: Run build**

Run: `npm run build 2>&1 | tail -40`
Expected: Build succeeds (pre-existing errors may remain but no new ones).

- [ ] **Step 3: Fix any issues**

If lint or build fails on our new/modified files, fix and re-run.

- [ ] **Step 4: Final commit (if fixes were needed)**

```bash
git add -A
git commit -m "fix: resolve lint/build issues in bundles-as-cards feature"
```
