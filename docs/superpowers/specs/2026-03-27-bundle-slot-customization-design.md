# Bundle Slot-Based Customization System

**Date:** 2026-03-27
**Status:** Approved
**Replaces:** Current flat `bundle_items` model (clean break — no backward compatibility)

## Summary

Transform the bundle system from fixed-item bundles into a step-by-step customization journey. Admins define **slots** (e.g., "Choose your Drink", "Pick your Sides") linked to menu categories. Customers walk through a full-screen wizard — one slot per screen — picking items, customizing variations/addons, then reviewing before adding to cart.

## Goals

- Customers experience bundle ordering as a guided journey, not a static form
- Admins configure flexible bundles by linking slots to existing menu categories
- Items automatically sync when categories are updated (no manual item management per bundle)
- Premium items within slots can have price overrides

## Non-Goals

- Min/max range per slot (out of scope — admin sets a fixed pick count per slot)
- Hand-picking individual items per slot (slots link to categories, not individual items)
- Backward compatibility with existing bundles (clean break — admins reconfigure)

---

## Database Schema

### New Tables

#### `bundle_slots`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | |
| `bundle_id` | uuid (FK → bundles) | Parent bundle |
| `name` | text, NOT NULL | Display name, e.g., "Choose your Drink" |
| `category_id` | uuid (FK → menu_categories) | Source category for items |
| `pick_count` | integer, NOT NULL, default 1 | How many items customer must pick |
| `sort_order` | integer, NOT NULL | Wizard step order |
| `created_at` | timestamptz | |

RLS: tenant-scoped via `bundle_id → bundles.tenant_id`.

#### `bundle_slot_price_overrides`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | |
| `slot_id` | uuid (FK → bundle_slots) | Parent slot |
| `menu_item_id` | uuid (FK → menu_items) | Item with custom pricing |
| `price_override` | numeric, NOT NULL | Extra cost on top of bundle price (e.g., 20 = +₱20) |
| `created_at` | timestamptz | |

Unique constraint: `(slot_id, menu_item_id)`.
RLS: tenant-scoped via `slot_id → bundle_slots.bundle_id → bundles.tenant_id`.

### Removed Tables

- `bundle_items` — dropped entirely. Replaced by `bundle_slots` + category linkage.

### Unchanged Tables

- `bundles` — all existing columns remain (`id`, `tenant_id`, `name`, `description`, `image_url`, `pricing_type`, `fixed_price`, `discount_percent`, `is_active`, `show_on_menu`, `show_as_upsell`, `display_order`, `created_at`, `updated_at`)

---

## Customer Experience

### Wizard Flow

Full-screen wizard triggered when customer taps a bundle card on the menu.

**For each slot (in sort_order):**

1. **Item Selection Screen**
   - Header: slot name (e.g., "Choose your Drink"), "Step X of Y"
   - Segmented progress bar — one segment per slot, fills green on completion
   - 2-column grid of items from the slot's linked category (`menu_items WHERE category_id = slot.category_id AND is_available = true`)
   - Items with no price override show "Included" (green). Items with price override show "+₱XX" (amber).
   - Selected items get green border + checkmark. For pick_count > 1, items get numbered badges.
   - "Next" button disabled until pick_count is satisfied
   - Persistent bottom bar with running total
   - "← Back" returns to previous slot with selections preserved

2. **Customize Screen** (per selected item)
   - Shows item thumbnail, name, price override badge
   - Variation selection (supports both legacy flat and new grouped formats)
   - Add-on selection with prices
   - "← Change [slot name item]" goes back to item grid
   - **Auto-skipped** if item has no variations and no addons
   - Running total updates live as customizations change

**After all slots:**

3. **Review Screen**
   - Summary card per slot: item thumbnail, name, customizations, price
   - "Edit" link on each slot jumps back to that slot's selection step
   - Pricing breakdown: base price + premium selections + add-ons & extras
   - Savings display (compared to ordering items individually)
   - "Add Bundle to Cart — ₱XXX" CTA button

### Bundle Card on Menu

- Shows slot icons with labels (e.g., 🍔 Main + 🥤 Drink + 🍟 Snack) when no hero image is set
- Admin-uploaded hero image replaces slot icons if provided
- Slot pills: "1 Main", "1 Drink", "2 Sides"
- Price shows "From ₱XXX" (since premium picks add cost)
- Savings badge shows "Save up to ₱XX"
- Tapping card opens the wizard

### Bundle Upsell

Trigger changes from item-in-bundle lookup to category-based: when a customer adds an item, check if that item's category is used by any active upsell bundle's slots. If yes, show upsell modal.

---

## Admin Experience

### Bundle Form (5-Step Wizard)

**Step 1 — Basic Info** (same as current)
- Name, description, image (Cloudinary upload), active toggle

**Step 2 — Slots** (new)
- Add/remove slots with drag-to-reorder
- Per slot: name (text input), category (dropdown of tenant's menu categories with item count), pick count (number input)
- Minimum 1 slot per bundle

**Step 3 — Price Overrides** (new)
- Lists all items from each slot's category
- Items default to "Included" (no extra charge)
- Admin can set "+₱" amount for premium items
- Shows item's regular menu price for reference

**Step 4 — Pricing** (same as current)
- Radio toggle: fixed price or discount percentage
- Input field for price amount / discount percent

**Step 5 — Visibility & Review** (same as current)
- `show_on_menu` and `show_as_upsell` toggles
- Live preview card

### Bundles List

Same as current with one addition: bundles without valid slots (post-migration) show a "Needs reconfiguration" warning badge.

---

## Cart Integration

### Types

```typescript
interface CartBundleSlotSelection {
  slotId: string
  slotName: string
  menuItemId: string
  menuItemName: string
  menuItemImage: string | null
  quantity: number                    // from slot's pick_count (1 per selected item)
  selectedVariations: SelectedVariation[]
  selectedAddons: SelectedAddon[]
  priceOverride: number              // 0 if included, >0 if premium
}
// Note: For pick_count > 1 slots, each pick is a separate entry in `slots[]`,
// even if the same item is picked twice (allowing different customizations per pick).

interface CartBundleItem {
  id: string                          // cart-generated UUID
  bundleId: string
  bundleName: string
  slots: CartBundleSlotSelection[]
  quantity: number                    // how many of this entire bundle
  pricingType: 'fixed' | 'discount'
  basePrice: number                   // fixed_price or calculated discount price
}
```

### Pricing Calculation

**Fixed price bundle:**
```
total = basePrice
      + sum(slot.priceOverride for each selected item)
      + sum(variation price modifiers)
      + sum(addon prices)
```

**Discount bundle:**
```
originalTotal = sum(selected items' regular menu prices × quantity)
discountedTotal = originalTotal × (1 - discount_percent / 100)
total = discountedTotal
      + sum(slot.priceOverride for each selected item)
      + sum(variation price modifiers)
      + sum(addon prices)
```

**Savings:** `sum(regular prices of all selected items) - total`

### localStorage Key

Same pattern: `restaurant_cart_bundles_[tenantSlug]`

### Messenger Sync

Bundle formatted as: `"Bundle: [name]"` with slot selections as items list:
```
Bundle: Classic Meal Bundle
- Drink: Mango Shake (Large, Extra Mango) +₱20
- Snack: Fries (Regular)
```

---

## Analytics Events

| Event | Trigger | Metadata |
|-------|---------|----------|
| `bundle_wizard_started` | Customer opens bundle wizard | `bundleId`, `bundleName`, `slotCount` |
| `bundle_slot_selected` | Item picked within a slot | `bundleId`, `slotId`, `slotName`, `menuItemId`, `menuItemName`, `stepNumber` |
| `bundle_customized` | Variations/addons added | `bundleId`, `slotId`, `menuItemId`, `variationCount`, `addonCount` |
| `bundle_added_to_cart` | Completed wizard, added to cart | `bundleId`, `bundleName`, `totalPrice`, `savingsAmount`, `slotSelections` |
| `bundle_wizard_abandoned` | Closed wizard before completing | `bundleId`, `lastCompletedStep`, `totalSteps` |
| `upsell_shown` | Bundle upsell modal shown | `source: 'bundle'`, `bundleId`, `sourceItemId` |
| `upsell_clicked` | Accepted bundle upsell | `source: 'bundle'`, `bundleId` |
| `upsell_dismissed` | Dismissed bundle upsell | `source: 'bundle'`, `bundleId` |

---

## Migration Strategy

1. New SQL migration creates `bundle_slots` and `bundle_slot_price_overrides` with RLS policies
2. Drop `bundle_items` table
3. Existing bundles remain in `bundles` table but have no slots — they won't appear on customer menu (query requires at least 1 valid slot)
4. Admin bundles list shows banner: "Bundles have been upgraded! Reconfigure your bundles with the new customization slots."
5. Bundles without slots show "Needs reconfiguration" badge

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Empty category (no active items) | Slot skipped in wizard. Admin sees warning in bundles list. |
| Category deleted | Slot becomes invalid (FK cascade or nullify). Admin notified to fix. Bundle hidden from menu. |
| Single item in category | Slot auto-selects the only option. Customer goes straight to customize step. |
| Pick count > available items | Admin form validates and prevents this. Customer-side caps at available count. |
| Item removed from category | Disappears from slot automatically (query-time resolution). No stale references. |
| All slots valid but bundle inactive | Normal — admin toggled `is_active` off. Not shown on menu. |

---

## Files Affected

### New Files
- `supabase/migrations/XXXX_bundle_slots.sql` — schema migration
- `src/components/customer/bundle-wizard.tsx` — full-screen wizard component
- `src/components/customer/bundle-wizard-slot-screen.tsx` — item selection per slot
- `src/components/customer/bundle-wizard-customize-screen.tsx` — variation/addon selection
- `src/components/customer/bundle-wizard-review-screen.tsx` — review and add to cart

### Modified Files
- `src/types/database.ts` — add `BundleSlot`, `BundleSlotPriceOverride` types, update `CartBundleItem`
- `src/lib/bundles-service.ts` — rewrite queries for slot-based model
- `src/lib/cart-utils.ts` — update bundle pricing calculations
- `src/hooks/useCart.tsx` — update `addBundleToCart` for slot selections
- `src/components/admin/bundle-form.tsx` — rewrite for 5-step slot-based wizard
- `src/components/customer/bundle-card.tsx` — show slots instead of fixed items
- `src/components/customer/bundle-upsell-modal.tsx` — category-based trigger lookup
- `src/app/actions/bundles.ts` — update server actions for slots
- `src/app/[tenant]/menu/menu-server.tsx` — update bundle query to join slots
- `src/app/[tenant]/menu/menu-client.tsx` — wire up new wizard component

### Removed Files
- `src/components/customer/bundle-customization-modal.tsx` — replaced by wizard
- `src/components/customer/bundles-section.tsx` — likely merged into updated bundle card rendering
