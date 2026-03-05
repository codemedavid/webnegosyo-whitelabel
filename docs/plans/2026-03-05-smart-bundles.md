# Smart Bundles Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the broken superadmin bundles toggle, build proper cart integration for bundles as grouped entities with per-item customization, add BCG-powered smart bundle suggestions for admins, and wire up the bundle upsell system for customers.

**Architecture:** The cart context (`useCart`) gains bundle-aware state (`bundleItems`) alongside existing `items`. Bundles are stored as `CartBundleItem` with per-item `BundleItemCustomization` (variations + addons). Admin gets a `BundleSuggestions` component that queries BCG classifications to recommend pairings. Customer-facing `BundleUpsellModal` (already built) gets wired into the product detail flow.

**Tech Stack:** Next.js 15, React 19, Supabase, Zod, Framer Motion, Tailwind CSS 4, Shadcn UI

---

### Task 1: Fix Superadmin Toggle — Zod Schema

**Files:**
- Modify: `src/lib/tenants-service.ts:77-78` (tenantSchema)

**Step 1: Add `bundles_enabled` and `checkout_upsell_enabled` to tenantSchema**

In `src/lib/tenants-service.ts`, find the comment `// Menu engineering` around line 76-78 where `menu_engineering_enabled` is defined. Add the two missing fields after `hide_currency_symbol`:

```typescript
// Menu engineering
menu_engineering_enabled: z.boolean().default(false),
hide_currency_symbol: z.boolean().default(false),
checkout_upsell_enabled: z.boolean().default(false),
bundles_enabled: z.boolean().default(false),
```

**Step 2: Add to `createTenantSupabase` insert payload**

In the same file, find `createTenantSupabase` around line 217-219 where `menu_engineering_enabled` is set. Add after `hide_currency_symbol`:

```typescript
menu_engineering_enabled: parsed.menu_engineering_enabled,
hide_currency_symbol: parsed.hide_currency_symbol,
checkout_upsell_enabled: parsed.checkout_upsell_enabled,
bundles_enabled: parsed.bundles_enabled,
```

**Step 3: Add to `updateTenantSupabase` update payload**

In the same file, find `updateTenantSupabase` around line 324-326. Add after `hide_currency_symbol`:

```typescript
menu_engineering_enabled: parsed.menu_engineering_enabled,
hide_currency_symbol: parsed.hide_currency_symbol,
checkout_upsell_enabled: parsed.checkout_upsell_enabled,
bundles_enabled: parsed.bundles_enabled,
```

**Step 4: Commit**

```bash
git add src/lib/tenants-service.ts
git commit -m "fix: add bundles_enabled and checkout_upsell_enabled to tenant schema and service payloads"
```

---

### Task 2: Fix Superadmin Toggle — Server Action Payloads

**Files:**
- Modify: `src/actions/tenants.ts:116-118` (createTenantAction) and `src/actions/tenants.ts:251-253` (updateTenantAction)

**Step 1: Add to `createTenantAction` insert payload**

Find the `createTenantAction` function. Around line 116-118 where `menu_engineering_enabled` is set in the insertPayload, add:

```typescript
menu_engineering_enabled: parsed.menu_engineering_enabled,
hide_currency_symbol: parsed.hide_currency_symbol,
checkout_upsell_enabled: parsed.checkout_upsell_enabled,
bundles_enabled: parsed.bundles_enabled,
```

**Step 2: Add to `updateTenantAction` update payload**

Find the `updateTenantAction` function. Around line 251-253 where `menu_engineering_enabled` is set in the updatePayload, add:

```typescript
menu_engineering_enabled: parsed.menu_engineering_enabled,
hide_currency_symbol: parsed.hide_currency_symbol,
checkout_upsell_enabled: parsed.checkout_upsell_enabled,
bundles_enabled: parsed.bundles_enabled,
```

**Step 3: Verify by running lint**

```bash
npx eslint src/actions/tenants.ts src/lib/tenants-service.ts
```

Expected: No errors.

**Step 4: Commit**

```bash
git add src/actions/tenants.ts
git commit -m "fix: add bundles_enabled and checkout_upsell_enabled to tenant action payloads"
```

---

### Task 3: Cart Utils — Bundle Price Calculation Helpers

**Files:**
- Modify: `src/lib/cart-utils.ts`

**Step 1: Add bundle price calculation functions**

Add these functions to the end of `src/lib/cart-utils.ts`:

```typescript
import type { CartItem, Variation, Addon, VariationOption, CartBundleItem, Bundle, BundleItemCustomization } from '@/types/database'

/**
 * Calculate the base price of a bundle (before customization extras)
 */
export function calculateBundleBasePrice(bundle: Bundle, itemsOriginalTotal: number): number {
  if (bundle.pricing_type === 'fixed') {
    return bundle.fixed_price ?? 0
  }
  // discount type
  const discountMultiplier = 1 - ((bundle.discount_percent ?? 0) / 100)
  return itemsOriginalTotal * discountMultiplier
}

/**
 * Calculate the original total of items in a bundle (sum of individual prices * quantities)
 */
export function calculateBundleOriginalTotal(customizations: BundleItemCustomization[]): number {
  return customizations.reduce((sum, c) => sum + c.menu_item.price * c.quantity, 0)
}

/**
 * Calculate extras cost (variation modifiers + addons) across all items in a bundle
 */
export function calculateBundleExtras(customizations: BundleItemCustomization[]): number {
  return customizations.reduce((sum, c) => {
    let variationExtra = 0
    if (c.selected_variations) {
      variationExtra = Object.values(c.selected_variations).reduce(
        (s, opt) => s + opt.price_modifier, 0
      )
    } else if (c.selected_variation) {
      variationExtra = c.selected_variation.price_modifier || 0
    }
    const addonExtra = c.selected_addons.reduce((s, a) => s + a.price, 0)
    return sum + (variationExtra + addonExtra) * c.quantity
  }, 0)
}

/**
 * Calculate the full subtotal for a cart bundle item
 */
export function calculateBundleSubtotal(bundleItem: CartBundleItem): number {
  const originalTotal = calculateBundleOriginalTotal(bundleItem.customizations)
  const basePrice = calculateBundleBasePrice(bundleItem.bundle, originalTotal)
  const extras = calculateBundleExtras(bundleItem.customizations)
  return (basePrice + extras) * bundleItem.quantity
}

/**
 * Calculate savings from a bundle
 */
export function calculateBundleSavings(bundle: Bundle, customizations: BundleItemCustomization[]): number {
  const originalTotal = calculateBundleOriginalTotal(customizations)
  const basePrice = calculateBundleBasePrice(bundle, originalTotal)
  return Math.max(0, originalTotal - basePrice)
}

/**
 * Calculate cart total including both regular items and bundles
 */
export function calculateFullCartTotal(items: CartItem[], bundleItems: CartBundleItem[]): number {
  const itemsTotal = items.reduce((total, item) => total + item.subtotal, 0)
  const bundlesTotal = bundleItems.reduce((total, bi) => total + bi.subtotal, 0)
  return itemsTotal + bundlesTotal
}

/**
 * Get total item count including bundles (each bundle counts as its number of items * quantity)
 */
export function getFullCartItemCount(items: CartItem[], bundleItems: CartBundleItem[]): number {
  const regularCount = items.reduce((count, item) => count + item.quantity, 0)
  const bundleCount = bundleItems.reduce((count, bi) => {
    const itemsInBundle = bi.customizations.reduce((s, c) => s + c.quantity, 0)
    return count + itemsInBundle * bi.quantity
  }, 0)
  return regularCount + bundleCount
}

/**
 * Get total bundle savings across all bundles in cart
 */
export function calculateTotalBundleSavings(bundleItems: CartBundleItem[]): number {
  return bundleItems.reduce((total, bi) => {
    return total + calculateBundleSavings(bi.bundle, bi.customizations) * bi.quantity
  }, 0)
}
```

Note: Update the import at top of file to include the new types.

**Step 2: Commit**

```bash
git add src/lib/cart-utils.ts
git commit -m "feat: add bundle price calculation helpers to cart-utils"
```

---

### Task 4: Cart Context — Add Bundle State and Methods

**Files:**
- Modify: `src/hooks/useCart.tsx`

This is the most complex task. The cart context needs bundle awareness.

**Step 1: Update imports**

At the top of `useCart.tsx` (line 4), add `CartBundleItem`, `BundleItemCustomization`, `Bundle` to the import:

```typescript
import type { CartItem, MenuItem, Variation, Addon, Cart, VariationOption, CartBundleItem, BundleItemCustomization, Bundle } from '@/types/database'
```

Add bundle utils to imports (line 5-10):

```typescript
import {
  calculateCartItemSubtotal,
  calculateFullCartTotal,
  getFullCartItemCount,
  generateCartItemId,
  calculateBundleSubtotal,
} from '@/lib/cart-utils'
```

Remove the old `calculateCartTotal` and `getCartItemCount` imports (they're replaced by the `Full` versions).

**Step 2: Update CartContextType interface**

Add bundle methods to the interface (after `getItem` at line 32):

```typescript
  // Bundle methods
  bundleItems: CartBundleItem[]
  addBundleToCart: (bundle: Bundle, customizations: BundleItemCustomization[], quantity: number) => void
  removeBundleFromCart: (bundleCartId: string) => void
  updateBundleQuantity: (bundleCartId: string, quantity: number) => void
```

**Step 3: Add bundle localStorage functions**

After `saveMessengerPsidToStorage` (around line 150), add:

```typescript
const BUNDLE_STORAGE_KEY = 'restaurant_cart_bundles'

function isValidBundleItems(items: unknown): items is CartBundleItem[] {
  if (!Array.isArray(items)) return false
  return items.every((item) => {
    if (!item || typeof item !== 'object') return false
    const i = item as Record<string, unknown>
    return (
      typeof i.id === 'string' &&
      typeof i.quantity === 'number' &&
      i.quantity > 0 &&
      typeof i.subtotal === 'number' &&
      i.bundle !== null &&
      typeof i.bundle === 'object' &&
      Array.isArray(i.customizations)
    )
  })
}

function loadBundlesFromStorage(): CartBundleItem[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(BUNDLE_STORAGE_KEY)
    if (stored) {
      const parsed: unknown = JSON.parse(stored)
      if (isValidBundleItems(parsed)) return parsed
      console.warn('[useCart] Bundle data in localStorage failed validation, resetting')
      localStorage.removeItem(BUNDLE_STORAGE_KEY)
    }
  } catch (error) {
    console.error('Failed to load bundles from storage:', error)
  }
  return []
}

function saveBundlesToStorage(bundleItems: CartBundleItem[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(BUNDLE_STORAGE_KEY, JSON.stringify(bundleItems))
  } catch (error) {
    console.error('Failed to save bundles to storage:', error)
  }
}
```

**Step 4: Add bundleItems state to CartProvider**

After `const [items, setItems] = useState<CartItem[]>([])` (line 153), add:

```typescript
  const [bundleItems, setBundleItems] = useState<CartBundleItem[]>([])
```

**Step 5: Load bundles from storage on mount**

In the `useEffect` that loads from localStorage (around line 168-207), add after `setItems(storedItems)`:

```typescript
    const storedBundles = loadBundlesFromStorage()
    setBundleItems(storedBundles)
```

**Step 6: Save bundles to storage on change**

After the `useEffect` that saves items (around line 213-217), add:

```typescript
  useEffect(() => {
    if (isInitialized) {
      saveBundlesToStorage(bundleItems)
    }
  }, [bundleItems, isInitialized])
```

**Step 7: Add bundle methods**

After the `getItem` callback (around line 458), add:

```typescript
  const addBundleToCart = useCallback(
    (bundle: Bundle, customizations: BundleItemCustomization[], quantity: number) => {
      const bundleCartId = `bundle_${bundle.id}_${Date.now()}`
      const newBundleItem: CartBundleItem = {
        id: bundleCartId,
        bundle,
        customizations,
        quantity,
        subtotal: 0, // calculated below
      }
      newBundleItem.subtotal = calculateBundleSubtotal(newBundleItem)

      setBundleItems((prev) => [...prev, newBundleItem])
    },
    []
  )

  const removeBundleFromCart = useCallback((bundleCartId: string) => {
    setBundleItems((prev) => prev.filter((bi) => bi.id !== bundleCartId))
  }, [])

  const updateBundleQuantity = useCallback((bundleCartId: string, quantity: number) => {
    if (quantity <= 0) {
      setBundleItems((prev) => prev.filter((bi) => bi.id !== bundleCartId))
      return
    }
    const MAX_QUANTITY = 99
    const clampedQuantity = Math.min(quantity, MAX_QUANTITY)
    setBundleItems((prev) =>
      prev.map((bi) => {
        if (bi.id === bundleCartId) {
          const updated = { ...bi, quantity: clampedQuantity }
          updated.subtotal = calculateBundleSubtotal(updated)
          return updated
        }
        return bi
      })
    )
  }, [])
```

**Step 8: Update total and item_count calculations**

Replace the existing total/item_count (around line 460-461):

```typescript
  const total = useMemo(() => calculateFullCartTotal(items, bundleItems), [items, bundleItems])
  const item_count = useMemo(() => getFullCartItemCount(items, bundleItems), [items, bundleItems])
```

**Step 9: Update clearCart**

Update `clearCart` to also clear bundles:

```typescript
  const clearCart = useCallback(() => {
    setItems([])
    setBundleItems([])
    setOrderTypeState(null)
  }, [])
```

**Step 10: Update context value**

Add bundle methods to the `contextValue` useMemo (around line 465-497):

```typescript
  const contextValue = useMemo<CartContextType>(() => ({
    items,
    bundle_items: bundleItems,
    bundleItems,
    total,
    item_count,
    orderType,
    setOrderType,
    messengerPsid,
    setMessengerPsid,
    tenantId,
    tenantSlug,
    setTenantContext,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    getItem,
    addBundleToCart,
    removeBundleFromCart,
    updateBundleQuantity,
  }), [
    items,
    bundleItems,
    total,
    item_count,
    orderType,
    setOrderType,
    messengerPsid,
    setMessengerPsid,
    tenantId,
    tenantSlug,
    setTenantContext,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    getItem,
    addBundleToCart,
    removeBundleFromCart,
    updateBundleQuantity,
  ])
```

**Step 11: Update Messenger sync to include bundles**

In the `cartItems` mapping inside the Messenger sync useEffect (around line 267-301), add bundle items to the cartHash and cartItems array. After the `const cartItems = currentItems.map(...)` block, add bundle items:

```typescript
      const bundleCartItems = bundleItems.map(bi => ({
        name: `📦 ${bi.bundle.name}`,
        quantity: bi.quantity,
        subtotal: bi.subtotal,
        variation: bi.customizations.map(c => c.menu_item.name).join(', '),
      }))
      const allCartItems = [...cartItems, ...bundleCartItems]
```

Then send `allCartItems` instead of `cartItems`. Also update the `cartHash` to include bundles:

```typescript
    const cartHash = JSON.stringify([
      ...items.map(i => ({ id: i.id, qty: i.quantity })),
      ...bundleItems.map(bi => ({ id: bi.id, qty: bi.quantity })),
    ])
```

And add `bundleItems` to the useEffect dependency array.

**Step 12: Commit**

```bash
git add src/hooks/useCart.tsx
git commit -m "feat: add bundle state and methods to cart context"
```

---

### Task 5: Fix Bundle Customization Modal

**Files:**
- Modify: `src/components/customer/bundle-customization-modal.tsx`

**Step 1: Update to use `addBundleToCart`**

The modal currently adds items individually (line 100-129). Replace the `handleAddToCart` function to use `addBundleToCart` from the cart context.

Key changes:
1. Import `useCart` and destructure `addBundleToCart`
2. Build `BundleItemCustomization[]` from the current selection state
3. Call `addBundleToCart(bundle, customizations, 1)` instead of looping `addItem`
4. Support multi-variation-type selection per item (currently only tracks one)

The customization state should be restructured from:
```typescript
Record<number, { variation?: ..., addons: Addon[] }>
```
To:
```typescript
Record<number, {
  selectedVariations?: { [typeId: string]: VariationOption }
  selectedVariation?: Variation
  selectedAddons: Addon[]
}>
```

This matches the `BundleItemCustomization` type exactly, enabling proper multi-variation support.

The `handleAddToCart` becomes:
```typescript
const handleAddToCart = useCallback(() => {
  const bundleCustomizations: BundleItemCustomization[] = items.map((bi, idx) => {
    const cust = customizations[idx] || {}
    return {
      menu_item: bi.menu_item,
      selected_variations: cust.selectedVariations,
      selected_variation: cust.selectedVariation,
      selected_addons: cust.selectedAddons || [],
      quantity: bi.quantity,
    }
  })

  addBundleToCart(bundle, bundleCustomizations, 1)
  toast.success(`${bundle.name} added to cart!`)
  onClose()
}, [items, customizations, bundle, addBundleToCart, onClose])
```

**Step 2: Add validation for required variation types**

Before calling `addBundleToCart`, validate that all required `variation_types` have selections:

```typescript
// Check required variations
for (let idx = 0; idx < items.length; idx++) {
  const bi = items[idx]
  const cust = customizations[idx]
  if (bi.menu_item.variation_types) {
    for (const vt of bi.menu_item.variation_types) {
      if (vt.is_required && !cust?.selectedVariations?.[vt.id]) {
        toast.error(`Please select ${vt.name} for ${bi.menu_item.name}`)
        setExpandedItemIdx(idx)
        return
      }
    }
  }
}
```

**Step 3: Commit**

```bash
git add src/components/customer/bundle-customization-modal.tsx
git commit -m "feat: fix bundle customization modal to use addBundleToCart with multi-variation support"
```

---

### Task 6: Cart Page — Bundle Display

**Files:**
- Modify: `src/app/[tenant]/cart/page.tsx`

**Step 1: Destructure bundle methods from useCart**

Update the useCart destructuring (line 40):

```typescript
const { items, bundleItems, total, updateQuantity, removeItem, removeBundleFromCart, updateBundleQuantity } = useCart()
```

**Step 2: Add bundle rendering section**

After the regular items map (after line 307 approximately, before the cart total section), add a bundle items section. Each bundle renders as a grouped card:

```tsx
{/* Bundle Items */}
{bundleItems.map((bundleItem) => {
  const savings = calculateBundleSavings(bundleItem.bundle, bundleItem.customizations)
  const originalTotal = calculateBundleOriginalTotal(bundleItem.customizations)

  return (
    <div key={bundleItem.id} className="group rounded-2xl bg-white p-4 md:p-6 shadow-sm border border-orange-100">
      {/* Bundle header */}
      <div className="flex items-center gap-2 mb-3">
        <Package className="h-4 w-4 text-orange-500" />
        <span className="font-bold text-gray-900">{bundleItem.bundle.name}</span>
        {savings > 0 && (
          <Badge className="bg-green-100 text-green-700 text-xs">
            Save {formatPrice(savings)}
          </Badge>
        )}
      </div>

      {/* Bundle items accordion */}
      <div className="space-y-2 mb-3 pl-6 border-l-2 border-orange-100">
        {bundleItem.customizations.map((cust, idx) => (
          <div key={idx} className="text-sm">
            <span className="font-medium text-gray-800">
              {cust.quantity > 1 ? `${cust.quantity}x ` : ''}{cust.menu_item.name}
            </span>
            {/* Show selected variations */}
            {cust.selected_variations && Object.values(cust.selected_variations).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {Object.values(cust.selected_variations).map((opt, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {opt.name}
                  </Badge>
                ))}
              </div>
            )}
            {cust.selected_variation && (
              <Badge variant="secondary" className="text-xs mt-0.5">
                {cust.selected_variation.name}
              </Badge>
            )}
            {/* Show selected addons */}
            {cust.selected_addons.length > 0 && (
              <p className="text-xs text-gray-500 mt-0.5">
                + {cust.selected_addons.map(a => a.name).join(', ')}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Bundle pricing and controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Quantity controls */}
          <div className="flex items-center gap-2 bg-gray-50 rounded-full px-2 py-1">
            <button onClick={() => updateBundleQuantity(bundleItem.id, bundleItem.quantity - 1)}
              className="p-1 rounded-full hover:bg-gray-200 transition-colors">
              <Minus className="h-3 w-3" />
            </button>
            <span className="text-sm font-semibold w-6 text-center">{bundleItem.quantity}</span>
            <button onClick={() => updateBundleQuantity(bundleItem.id, bundleItem.quantity + 1)}
              className="p-1 rounded-full hover:bg-gray-200 transition-colors">
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <button onClick={() => removeBundleFromCart(bundleItem.id)}
            className="p-1.5 rounded-full text-red-400 hover:bg-red-50 transition-colors">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <div className="text-right">
          {savings > 0 && (
            <span className="text-xs text-gray-400 line-through block">
              {formatPrice(originalTotal * bundleItem.quantity)}
            </span>
          )}
          <span className="font-bold text-orange-600">
            {formatPrice(bundleItem.subtotal)}
          </span>
        </div>
      </div>
    </div>
  )
})}
```

**Step 3: Add bundle savings line to cart summary**

Before the total display (around line 314), add a savings line:

```tsx
{calculateTotalBundleSavings(bundleItems) > 0 && (
  <div className="flex justify-between items-center text-green-600 text-sm">
    <span>Bundle savings</span>
    <span>-{formatPrice(calculateTotalBundleSavings(bundleItems))}</span>
  </div>
)}
```

**Step 4: Update empty cart check**

The empty state should check both `items.length === 0 && bundleItems.length === 0`.

**Step 5: Add necessary imports**

Add `Package` to the lucide imports. Add `calculateBundleSavings`, `calculateBundleOriginalTotal`, `calculateTotalBundleSavings` to cart-utils imports. Add `CartBundleItem` to type imports.

**Step 6: Commit**

```bash
git add src/app/[tenant]/cart/page.tsx
git commit -m "feat: display bundles as grouped entries in cart with savings"
```

---

### Task 7: Admin BCG Bundle Suggestions Component

**Files:**
- Create: `src/components/admin/bundle-suggestions.tsx`
- Modify: `src/app/[tenant]/admin/bundles/page.tsx`

**Step 1: Create the BundleSuggestions component**

Create `src/components/admin/bundle-suggestions.tsx`. This component:
1. Receives menu items with BCG classifications
2. Generates suggestion pairs based on strategies (star+plowhorse, star+puzzle, complementary)
3. Renders suggestion cards with "Create Bundle" CTAs that link to `/admin/bundles/new` with query params

```typescript
'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Sparkles, ArrowRight, TrendingUp, Lightbulb, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/cart-utils'
import type { MenuItem } from '@/types/database'

interface BundleSuggestionsProps {
  menuItems: MenuItem[]
  tenantSlug: string
  existingBundleItemIds: string[] // items already in bundles
}

interface BundleSuggestion {
  strategy: 'margin_boost' | 'discovery' | 'complementary'
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  items: MenuItem[]
  suggestedDiscount: number
}

const BCG_BADGE_COLORS: Record<string, string> = {
  star: 'bg-yellow-100 text-yellow-800',
  plowhorse: 'bg-blue-100 text-blue-800',
  puzzle: 'bg-purple-100 text-purple-800',
  dog: 'bg-gray-100 text-gray-600',
}

function generateSuggestions(
  menuItems: MenuItem[],
  existingBundleItemIds: string[]
): BundleSuggestion[] {
  const suggestions: BundleSuggestion[] = []
  const available = menuItems.filter(
    (item) => item.is_available && !existingBundleItemIds.includes(item.id)
  )

  const stars = available.filter((i) => i.bcg_classification === 'star')
  const plowhorses = available.filter((i) => i.bcg_classification === 'plowhorse')
  const puzzles = available.filter((i) => i.bcg_classification === 'puzzle')

  // Strategy 1: Star + Plowhorse (boost margin)
  if (stars.length > 0 && plowhorses.length > 0) {
    suggestions.push({
      strategy: 'margin_boost',
      label: 'Boost margin on your bestseller',
      description: 'Pair a popular high-margin item with a popular low-margin one to lift overall margin.',
      icon: TrendingUp,
      items: [stars[0], plowhorses[0]],
      suggestedDiscount: 10,
    })
  }

  // Strategy 2: Star + Puzzle (drive discovery)
  if (stars.length > 0 && puzzles.length > 0) {
    suggestions.push({
      strategy: 'discovery',
      label: 'Drive discovery for hidden gems',
      description: 'Bundle your bestseller with a high-margin item that needs more exposure.',
      icon: Lightbulb,
      items: [stars[0], puzzles[0]],
      suggestedDiscount: 15,
    })
  }

  // Strategy 3: Multiple stars combo
  if (stars.length >= 2) {
    suggestions.push({
      strategy: 'complementary',
      label: 'Power combo — your top sellers',
      description: 'Bundle your most popular items together for an irresistible deal.',
      icon: Users,
      items: stars.slice(0, Math.min(3, stars.length)),
      suggestedDiscount: 12,
    })
  }

  return suggestions
}

export function BundleSuggestions({ menuItems, tenantSlug, existingBundleItemIds }: BundleSuggestionsProps) {
  const suggestions = useMemo(
    () => generateSuggestions(menuItems, existingBundleItemIds),
    [menuItems, existingBundleItemIds]
  )

  if (suggestions.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-yellow-500" />
          Smart Suggestions
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          AI-powered bundle recommendations based on your menu performance data
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {suggestions.map((suggestion, idx) => {
            const Icon = suggestion.icon
            const itemIds = suggestion.items.map((i) => i.id).join(',')
            const itemNames = suggestion.items.map((i) => i.name).join(',')
            const totalPrice = suggestion.items.reduce((s, i) => s + i.price, 0)

            return (
              <Card key={idx} className="border-dashed">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">{suggestion.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{suggestion.description}</p>

                  {/* Item previews */}
                  <div className="space-y-1.5">
                    {suggestion.items.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 text-sm">
                        {item.image_url ? (
                          <div className="h-8 w-8 rounded overflow-hidden bg-muted flex-shrink-0 relative">
                            <Image src={item.image_url} alt={item.name} fill className="object-cover" sizes="32px" />
                          </div>
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted flex-shrink-0" />
                        )}
                        <span className="truncate flex-1">{item.name}</span>
                        <Badge className={`text-xs ${BCG_BADGE_COLORS[item.bcg_classification || 'unclassified'] || BCG_BADGE_COLORS.dog}`}>
                          {item.bcg_classification || 'N/A'}
                        </Badge>
                        <span className="text-muted-foreground text-xs">{formatPrice(item.price)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Suggested: {suggestion.suggestedDiscount}% discount ({formatPrice(totalPrice * (1 - suggestion.suggestedDiscount / 100))})
                  </div>

                  <Link
                    href={`/${tenantSlug}/admin/bundles/new?suggestItems=${itemIds}&suggestNames=${encodeURIComponent(itemNames)}&suggestDiscount=${suggestion.suggestedDiscount}`}
                  >
                    <Button size="sm" variant="outline" className="w-full">
                      Create Bundle <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
```

**Step 2: Update bundles list page to mount suggestions**

In `src/app/[tenant]/admin/bundles/page.tsx`, fetch menu items with BCG data and render `BundleSuggestions` above the bundles list when `menu_engineering_enabled` is true:

```typescript
import { getMenuItemsByTenant } from '@/lib/admin-service'
import { BundleSuggestions } from '@/components/admin/bundle-suggestions'

// Inside BundlesContent, add menu items fetch:
const menuItems = await getMenuItemsByTenant(tenantId)
const existingBundleItemIds = bundles.flatMap(b => b.items?.map(i => i.menu_item_id) || [])

// In the JSX, before <BundlesList>:
{menuEngineeringEnabled && menuItems.length > 0 && (
  <BundleSuggestions
    menuItems={menuItems}
    tenantSlug={tenantSlug}
    existingBundleItemIds={existingBundleItemIds}
  />
)}
```

Pass `menuEngineeringEnabled` from the page to `BundlesContent`.

**Step 3: Add BCG badges to bundle form item picker**

In `src/components/admin/bundle-form.tsx`, update the search results dropdown to show BCG badges next to each item. In the `filteredMenuItems.slice(0, 8).map(...)` section, add a BCG badge after the price:

```tsx
{menuItem.bcg_classification && menuItem.bcg_classification !== 'unclassified' && (
  <Badge className={`text-xs ${BCG_BADGE_COLORS[menuItem.bcg_classification]}`}>
    {menuItem.bcg_classification}
  </Badge>
)}
```

**Step 4: Support pre-fill from query params in bundle form**

In `src/app/[tenant]/admin/bundles/new/page.tsx`, read `searchParams` and pass suggestion data to `BundleForm`:

```typescript
export default async function NewBundlePage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>
  searchParams: Promise<{ suggestItems?: string; suggestNames?: string; suggestDiscount?: string }>
}) {
  const { suggestItems, suggestDiscount } = await searchParams
  // ... pass to BundleForm as suggestedItemIds and suggestedDiscount props
}
```

In `BundleForm`, if `suggestedItemIds` are provided, auto-populate `items` state from the menuItems prop on mount.

**Step 5: Commit**

```bash
git add src/components/admin/bundle-suggestions.tsx src/app/[tenant]/admin/bundles/page.tsx src/components/admin/bundle-form.tsx src/app/[tenant]/admin/bundles/new/page.tsx
git commit -m "feat: add BCG-powered smart bundle suggestions for admin"
```

---

### Task 8: Wire Bundle Upsell Modal into Product Detail

**Files:**
- Modify: `src/components/customer/product-detail-content.tsx`
- Modify: `src/app/[tenant]/menu/menu-client.tsx`

**Step 1: Add bundle upsell check to product detail**

In `product-detail-content.tsx`, after the existing complementary upsell check (around line 583-588), add a bundle upsell check:

1. Accept a new prop: `upsellBundles?: BundleWithItems[]`
2. Add state: `const [bundleUpsell, setBundleUpsell] = useState<BundleWithItems | null>(null)`
3. After adding item to cart, check if the item exists in any upsell bundle:

```typescript
// After complementary upsell check
if (bundlesEnabled && upsellBundles && upsellBundles.length > 0) {
  const matchingBundle = upsellBundles.find(b =>
    b.items?.some(bi => bi.menu_item_id === item.id)
  )
  if (matchingBundle) {
    addCurrentItemToCart()
    setBundleUpsell(matchingBundle)
    return
  }
}
```

4. Render `BundleUpsellModal` at the bottom of the component when `bundleUpsell` is set
5. On "Upgrade to Bundle", open `BundleCustomizationModal`

**Step 2: Fetch upsell bundles in menu-client**

In `menu-client.tsx`, the `bundles` prop already contains all active menu bundles. Filter for upsell bundles and pass to product detail:

```typescript
const upsellBundles = useMemo(
  () => bundles.filter(b => b.show_as_upsell),
  [bundles]
)
```

Pass `upsellBundles` through to the product detail page (via router state or context, since product detail is a separate route). The simplest approach: fetch upsell bundles on the product detail page server-side using `getUpsellBundles(tenantId)`.

**Step 3: Commit**

```bash
git add src/components/customer/product-detail-content.tsx src/app/[tenant]/menu/item/[itemId]/page.tsx
git commit -m "feat: wire bundle upsell modal into product detail flow"
```

---

### Task 9: Enhance Checkout Upsell Waterfall

**Files:**
- Modify: `src/app/actions/menu-engineering.ts:177-190`

**Step 1: Implement the 4-tier waterfall**

Replace the current `getCheckoutUpsellsAction` with the full waterfall:

```typescript
export async function getCheckoutUpsellsAction(
  cartItemIds: string[],
  tenantId: string,
  maxItems: number = 4
) {
  try {
    const collectedItems: MenuItem[] = []
    const seenIds = new Set(cartItemIds)

    const addUnique = (items: MenuItem[]) => {
      for (const item of items) {
        if (!seenIds.has(item.id) && collectedItems.length < maxItems) {
          seenIds.add(item.id)
          collectedItems.push(item)
        }
      }
    }

    // Tier 1: Manually-flagged items
    const manualItems = await getManualUpsellItems(tenantId, maxItems)
    addUnique(manualItems)

    // Tier 2: Complementary pairs for items in cart
    if (collectedItems.length < maxItems && cartItemIds.length > 0) {
      const complementary = await getUpsellsForCart(cartItemIds, tenantId)
      addUnique(complementary)
    }

    // Tier 3: BCG star items
    if (collectedItems.length < maxItems) {
      const stars = await getStarItems(tenantId, maxItems)
      addUnique(stars)
    }

    return { success: true, data: collectedItems.slice(0, maxItems) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch checkout upsells' }
  }
}
```

Import `getUpsellsForCart` and `getStarItems` from `menu-engineering-service.ts`.

**Step 2: Commit**

```bash
git add src/app/actions/menu-engineering.ts
git commit -m "feat: implement full 4-tier checkout upsell waterfall"
```

---

### Task 10: Final Integration Testing and Lint

**Step 1: Run linter on all modified files**

```bash
npm run lint
```

Fix any lint errors.

**Step 2: Run existing tests**

```bash
npm run test
```

Ensure no regressions.

**Step 3: Manual smoke test checklist**

- [ ] Superadmin can toggle `bundles_enabled` on a tenant and it persists
- [ ] Admin sees Bundles in sidebar when enabled
- [ ] Admin can create a bundle with items, pricing, and image
- [ ] BCG suggestions appear when menu_engineering_enabled is also on
- [ ] Customer sees bundles on menu page
- [ ] Customer can customize items within a bundle (variations + addons)
- [ ] Bundle appears as grouped entry in cart with savings
- [ ] Cart total correctly includes bundle pricing
- [ ] Removing a bundle removes all its items
- [ ] Bundle upsell modal appears after adding an item that belongs to an upsell bundle

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete smart bundles system - cart integration, BCG suggestions, upsells"
```
