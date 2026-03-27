# Bundles as Regular Cards — Design Spec

**Date:** 2026-03-27
**Status:** Approved

## Problem

1. **Cart drawer** does not display bundle items — only the full cart page does
2. **Menu display** uses a separate `BundlesSection` with custom `BundleCard` (2x2 thumbnail grid) that looks different from regular menu item cards
3. **Layout variants** (sidebar, magazine, list, mosaic) don't show bundles at all — only the default layout does

## Goal

- Bundles appear as a **"Bundles" category pinned first** on the menu
- Bundles rendered using the **same card template** as regular menu items (classic, bold, zen, etc.)
- Bundles work in **all layout variants** automatically
- Bundles shown in the **cart drawer** as single-line items with item count badge

## Approach: Adapter Pattern

Transform bundle data into MenuItem-compatible shape at the display layer only. No changes to data storage, cart hooks, analytics, or other systems.

## Design

### 1. Bundle → MenuItem Adapter

**Location:** New utility, e.g. `src/lib/bundle-adapter.ts`

Function: `bundleToMenuItem(bundle: BundleWithItems): MenuItem & { _isBundle: true; _bundleData: BundleWithItems }`

Field mapping:

| Bundle field | MenuItem field | Notes |
|---|---|---|
| `bundle.id` | `"bundle_" + id` | Prefixed to distinguish from real items |
| `bundle.name` | `name` | Direct map |
| `bundle.description` | `description` | Falls back to auto-generated item list (e.g. "Burger + Fries + Drink") |
| `bundle.image_url` | `image_url` | Falls back to first item's image_url |
| Calculated bundle price | `price` | Fixed price or discounted total |
| Original item total | `discounted_price` | Enables strikethrough savings display on card |
| `bundle.is_active` | `is_available` | Direct map |
| `'bundles'` | `category_id` | Virtual category ID |
| `0` | `order` | Uses `bundle.display_order` for ordering within category |

Extra fields attached:
- `_isBundle: true` — type discriminator for click handling
- `_bundleData: BundleWithItems` — original bundle data for customization modal

Price calculation logic (reuses existing `cart-utils.ts`):
- **Fixed pricing:** `bundle.fixed_price`
- **Discount pricing:** Sum of item prices × (1 - discount_percent / 100)

### 2. Virtual "Bundles" Category

Created in `menu-client.tsx` when bundles exist:

```typescript
{
  id: 'bundles',
  name: 'Bundles',
  order: -1,        // Always first
  tenant_id: tenant.id
}
```

- Pinned first regardless of other category ordering
- Shows in category nav/tabs like real categories
- Only created when `bundles.length > 0`

### 3. Menu Layout Integration

In `menu-client.tsx`:

1. **Remove** the separate `BundlesSection` rendering block (lines ~573-583)
2. **Remove** the `BundleCustomizationModal` trigger from the old bundles section
3. Convert bundles to MenuItems via `bundleToMenuItem()`
4. Prepend virtual "Bundles" category to `categories` array
5. Prepend adapted bundle items to `menuItems` array
6. Pass combined data to existing layout components

Result: Bundles automatically render in all layout variants (default, sidebar, magazine, list, mosaic) using the tenant's selected card template.

### 4. Click Handler Override

In the card click path (`MenuItemCard` or `PrefetchingCard`):

- Check `item._isBundle === true`
- If **bundle**: call `onBundleSelect(item._bundleData)` → opens `BundleCustomizationModal`
- If **regular item**: navigate to `/menu/item/[itemId]` as usual

The `onBundleSelect` callback needs to be threaded through to the card component. This follows the same pattern as `menuEngineeringEnabled` — passed via `MenuClient` → layout → grid → card.

### 5. Cart Drawer — Bundle Line Items

In `cart-drawer.tsx`, after the existing regular items loop, render `bundleItems`:

- Same row layout/styling as regular cart items
- **Image:** Bundle image or first item's image
- **Name:** Bundle name
- **Badge:** Subtle "(X items)" indicator
- **Price:** Bundle subtotal
- **Controls:** Quantity +/- buttons using `updateBundleQuantity()`, remove button using `removeBundleFromCart()`
- **Item count:** Cart item count badge updated to use `getFullCartItemCount(items, bundleItems)` instead of just `items.length`

### 6. Unchanged Systems

These systems remain untouched:
- `BundleCustomizationModal` — still handles per-item variation/addon selection
- Cart page bundle section — already renders bundles correctly
- Cart hook (`useCart.tsx`) — `addBundleToCart`, `removeBundleFromCart`, `updateBundleQuantity` unchanged
- Bundle upsell modal — still triggers independently on add-to-cart
- Analytics tracking — unchanged
- Messenger sync — already includes bundles
- `bundles-service.ts` — data fetching unchanged
- Checkout flow — already uses `calculateFullCartTotal(items, bundleItems)`

## Files to Modify

1. **New:** `src/lib/bundle-adapter.ts` — adapter function
2. **Edit:** `src/app/[tenant]/menu/menu-client.tsx` — remove BundlesSection, inject virtual category + adapted items
3. **Edit:** Card click handler (in `MenuItemCard` or `PrefetchingCard`) — bundle click detection
4. **Edit:** `src/components/customer/cart-drawer.tsx` — add bundle line items
5. **Edit:** Props threading for `onBundleSelect` callback through layout → grid → card chain

## Edge Cases

- **No bundles:** Virtual category not created, menu renders as before
- **Bundle with no image:** Falls back to first item's image; if that's also missing, card shows placeholder (existing behavior)
- **Category filter active:** "Bundles" category selectable like any other; selecting it shows only bundles
- **All bundle items unavailable:** Bundle still shows (controlled by `is_active` + `show_on_menu` flags, not item availability)
- **Cart drawer empty state:** Already handled — shows empty state when both `items` and `bundleItems` are empty
