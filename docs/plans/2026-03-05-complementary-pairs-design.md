# "Perfect With" Complementary Pairs System — Design

**Date:** 2026-03-05
**Status:** Approved
**Phase:** Phase 2 of upselling system

## Overview

Separate complementary upselling from upgrade upselling with a dedicated system. Admins configure "Perfect with" item suggestions at both the **item level** and **category level**. When a customer adds an item to cart, they see a full-screen "Perfect with [Item]" interstitial showing 2-4 complementary items. Item-level pairs override category-level pairs.

## Requirements

- Admin can set complementary items per-item (max 4 targets)
- Admin can set complementary items per-category (max 4 targets, applies to all items in that category)
- Item-level pairs take priority over category-level pairs
- Customer sees a full-screen interstitial after add-to-cart (matches checkout interstitial design)
- New dedicated "Complementary Pairs" tab in Menu Engineering dashboard
- Gated by `menu_engineering_enabled` feature flag
- Migrate existing complementary pairs from `upsell_pairs` to new table

## Data Model

### New table: `complementary_pairs`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK, default gen_random_uuid() | |
| `tenant_id` | uuid FK → tenants, NOT NULL | |
| `source_type` | text NOT NULL | 'item' or 'category' |
| `source_item_id` | uuid FK → menu_items, nullable | Set when source_type = 'item' |
| `source_category_id` | uuid FK → categories, nullable | Set when source_type = 'category' |
| `target_item_id` | uuid FK → menu_items, NOT NULL | The item to suggest |
| `display_order` | int, default 0 | Sort order within a source |
| `is_active` | bool, default true | |
| `created_at` | timestamptz, default now() | |
| `updated_at` | timestamptz, default now() | |

**Constraints:**
- CHECK: `(source_type = 'item' AND source_item_id IS NOT NULL AND source_category_id IS NULL) OR (source_type = 'category' AND source_category_id IS NOT NULL AND source_item_id IS NULL)`
- UNIQUE: `(tenant_id, source_type, COALESCE(source_item_id, '00000000-0000-0000-0000-000000000000'), COALESCE(source_category_id, '00000000-0000-0000-0000-000000000000'), target_item_id)`
- RLS: `tenant_id = auth.jwt() ->> 'tenant_id'` or service role bypass

### Resolution Logic

```
getComplementaryItems(itemId, categoryId, tenantId):
  1. Query complementary_pairs WHERE source_type='item' AND source_item_id=itemId AND is_active=true
  2. If results found → return target items (ordered by display_order, max 4)
  3. Else query WHERE source_type='category' AND source_category_id=categoryId AND is_active=true
  4. Return target items (ordered by display_order, max 4)
```

## Customer-Facing UI

Redesign `PairSuggestionSheet` to match `CheckoutUpsellModal` exactly:

- **Full-screen white takeover** (fixed inset-0, z-50)
- **Title:** "Perfect with [Item Name]" (bold, centered, large)
- **Subtitle:** "Complete your meal" (muted text, centered)
- **Responsive grid:** 2 cols mobile, 3 cols tablet, 4 cols desktop
- **Cards:** 4:3 aspect ratio images, item name, price, "Add" button
- **Added state:** Green checkmark overlay, "Added!" text, 1.2s before reverting
- **Bottom action:** "Continue" button → navigates back to menu (or cart if buyNow)
- **Analytics:** `upsell_shown`, `upsell_clicked`, `upsell_dismissed` with `source: 'pair_suggestion'`

### Trigger

Same as current: opens immediately after customer taps "Add to Cart" on product detail page, if complementary items exist for that item (or its category).

## Admin UI — "Complementary Pairs" Tab

New tab in Menu Engineering dashboard (`/[tenant]/admin/menu-engineering`):

### Create Pair Form

Two modes toggled by radio/segment control:

**Per-Item mode:**
- Source: dropdown of all menu items (with search)
- Targets: multi-select picker for target items (max 4, min 1)
- Shows thumbnails and prices for selected targets

**Per-Category mode:**
- Source: dropdown of all categories
- Targets: multi-select picker for target items (max 4, min 1)
- Helper text: "These items will show for all items in [Category] unless overridden at item level"

### Existing Pairs List

- Filter tabs: "All" / "Item pairs" / "Category pairs"
- Each row: source name (item or category) → target item thumbnails (up to 4)
- Edit button → opens form pre-filled
- Delete button → confirms and removes
- Green badges on categories that have pairs configured

## Service Layer

New file: `src/lib/complementary-pairs-service.ts`

Functions:
- `getComplementaryItems(itemId, categoryId, tenantId)` — resolution logic
- `getComplementaryPairsByTenant(tenantId)` — admin list (all pairs)
- `getComplementaryPairsForSource(sourceType, sourceId, tenantId)` — edit form
- `createComplementaryPair(pair)` — insert
- `updateComplementaryPair(id, updates)` — update
- `deleteComplementaryPair(id, tenantId)` — delete
- `bulkCreateComplementaryPairs(sourceType, sourceId, targetItemIds, tenantId)` — create multiple at once

## Server Actions

New file: `src/app/actions/complementary-pairs.ts`

- `getComplementaryItemsAction(itemId, categoryId, tenantId)`
- `getComplementaryPairsAction(tenantId)`
- `createComplementaryPairsAction(sourceType, sourceId, targetItemIds, tenantId)`
- `deleteComplementaryPairAction(id, tenantId)`

## Integration Points

### product-detail-data.ts
- Replace complementary query from `upsell_pairs` with call to `getComplementaryItems(itemId, item.category_id, tenantId)`
- Pass results as `complementaryUpsells` prop (same interface)

### product-detail-content.tsx
- No changes needed — already receives `complementaryUpsells: MenuItem[]` and shows `PairSuggestionSheet`

### upsell_pairs cleanup
- Existing `upsell_pairs` tab becomes upgrade-only
- Migration: move existing `pair_type='complementary'` rows to new `complementary_pairs` table
- Remove complementary pair creation from upsell-pairs-tab admin UI

### Menu Engineering Dashboard
- Add new "Complementary Pairs" tab alongside existing tabs (BCG Matrix, Upsell Pairs, Smart Suggestions, Checkout Upsell)

## Migration Plan

1. Create `complementary_pairs` table with RLS
2. Migrate existing complementary pairs: `INSERT INTO complementary_pairs SELECT ... FROM upsell_pairs WHERE pair_type = 'complementary'`
3. Remove migrated rows from `upsell_pairs`
4. Update `upsell-pairs-tab` to filter out complementary type
