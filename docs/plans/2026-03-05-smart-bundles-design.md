# Smart Bundles System Design

**Date:** 2026-03-05
**Status:** Approved

## Overview

Transform the existing bundles feature from a partially-wired skeleton into a fully functional smart bundling system with BCG-powered suggestions, proper cart integration with grouped display, customer-facing upsells, and savings visibility throughout.

## Problems to Solve

1. **Superadmin toggle broken** — `bundles_enabled` and `checkout_upsell_enabled` missing from Zod schema, server action payloads, and service layer
2. **Cart has zero bundle awareness** — `CartBundleItem` types exist but cart context never uses them; bundle items added at full individual prices
3. **Bundle upsell modal is dead code** — built but imported/used nowhere
4. **Checkout upsell waterfall incomplete** — only tier 1 (manual items) implemented
5. **No smart bundle suggestions** — BCG data exists but doesn't feed into bundle creation

## Design

### Section 1: Fix Superadmin Toggle

Add `bundles_enabled` and `checkout_upsell_enabled` to:
- `tenantSchema` Zod validation in `src/lib/tenants-service.ts`
- `createTenantAction` insert payload in `src/actions/tenants.ts`
- `updateTenantAction` update payload in `src/actions/tenants.ts`
- `createTenantSupabase` insert payload in `src/lib/tenants-service.ts`
- `updateTenantSupabase` update payload in `src/lib/tenants-service.ts`

### Section 2: Smart Cart — Bundle as Grouped Entity

**Cart context changes (`src/hooks/useCart.tsx`):**
- Add `bundleItems: CartBundleItem[]` state alongside `items: CartItem[]`
- Add `addBundleToCart(bundle, customizations, quantity)` method
- Add `removeBundleFromCart(bundleCartId)` method
- Add `updateBundleQuantity(bundleCartId, quantity)` method
- Update `cartTotal` to include both items and bundles
- Update localStorage persistence to save/restore bundles
- Update Messenger sync to include bundle data

**CartBundleItem structure:**
```ts
{
  id: string              // generated cart ID
  bundle: Bundle          // bundle metadata
  customizations: BundleItemCustomization[]  // per-item variation/addon choices
  quantity: number
}
```

**Bundle price calculation:**
- Base: `bundle.fixed_price` or `originalTotal * (1 - discount_percent/100)`
- Extras: sum of all variation price modifiers + addon prices across all items
- Total: `(base + extras) * quantity`

**Cart page bundle display:**
- Single grouped card with bundle name as header
- Savings badge: "Save P{savings}"
- Strikethrough original price + actual bundle price
- Expandable accordion showing each item with its selected variation/addons
- Quantity stepper and remove button operate on the whole bundle

**Cart summary:**
- "Bundle savings: -P{totalSavings}" line before grand total

### Section 3: Bundle Customization Modal Fix

**Fix `src/components/customer/bundle-customization-modal.tsx`:**
- Call `addBundleToCart()` instead of adding individual items
- Support full multi-variation-type selection per item (not just single)
- Track `selectedVariations: Record<string, Record<string, VariationOption>>` (itemIndex -> typeId -> option)
- Validate required variation types before allowing add-to-cart
- Pass `upsellSource: 'bundle'` for analytics

### Section 4: Smart BCG Bundle Suggestions (Admin)

**New component: `BundleSuggestions`** rendered on admin bundles list page when `menu_engineering_enabled` is also true.

**Suggestion strategies:**
| Strategy | Pairing | Admin label |
|----------|---------|-------------|
| Margin boost | Star + Plowhorse | "Boost margin on your bestseller" |
| Discovery | Star + Puzzle | "Drive discovery for hidden gems" |
| Complementary | Items from `upsell_pairs` table | "Customers buy these together" |

**Each suggestion card shows:**
- Item thumbnails + names with BCG badges
- Recommended pricing (15% discount suggested)
- "Create Bundle" button → navigates to `/admin/bundles/new` with pre-filled query params

**BCG badges in bundle item picker:**
- In `BundleForm`, search results show BCG classification badge next to each item name
- Color-coded: Star (gold), Plowhorse (blue), Puzzle (purple), Dog (gray)

### Section 5: Bundle Upsell System (Customer-Facing)

**Wire `BundleUpsellModal` into product detail flow:**
- After `addItem` in `product-detail-content.tsx`, check `getUpsellBundles(tenantId)` for bundles containing the added item
- If match found, show `BundleUpsellModal` with savings
- "Upgrade to Bundle" opens `BundleCustomizationModal`

**Enhance checkout upsell waterfall** (`src/app/actions/menu-engineering.ts`):
- Tier 1: Manually-flagged items (`show_in_checkout_upsell = true`) — existing
- Tier 2: Complementary pairs from `upsell_pairs` for items in cart
- Tier 3: BCG star items not already in cart
- Tier 4: Upsell bundles containing cart items (new)

### Section 6: Savings Display

| Location | Display |
|----------|---------|
| Bundle card (menu) | Green "Save P50" badge (already exists) |
| Bundle customization modal | "Original: P350" strikethrough + "Bundle: P299" + "You save P51" |
| Cart bundle entry | Strikethrough original + bundle price + savings badge |
| Cart summary | "Bundle savings: -P50" line item |

## Files Affected

**Bug fixes:**
- `src/lib/tenants-service.ts` — add to schema + both payloads
- `src/actions/tenants.ts` — add to both payloads

**Cart system:**
- `src/hooks/useCart.tsx` — bundle state, methods, persistence, totals
- `src/app/[tenant]/cart/page.tsx` — bundle grouped display, savings summary
- `src/lib/cart-utils.ts` — bundle price calculation helpers

**Admin:**
- `src/app/[tenant]/admin/bundles/page.tsx` — mount suggestions component
- `src/components/admin/bundle-suggestions.tsx` — new BCG suggestion cards
- `src/components/admin/bundle-form.tsx` — BCG badges in picker, pre-fill support

**Customer components:**
- `src/components/customer/bundle-customization-modal.tsx` — fix to use addBundleToCart, multi-variation
- `src/components/customer/bundle-upsell-modal.tsx` — already built, just wire it
- `src/components/customer/product-detail-content.tsx` — trigger bundle upsell after add
- `src/components/customer/checkout-upsell-modal.tsx` — accept bundles in waterfall

**Actions:**
- `src/app/actions/menu-engineering.ts` — enhance checkout upsell waterfall
