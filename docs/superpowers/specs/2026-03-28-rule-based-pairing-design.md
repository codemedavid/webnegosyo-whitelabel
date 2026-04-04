# Rule-Based Pairing System — Design Spec

**Date:** 2026-03-28
**Status:** Draft
**Feature flag:** `pairing_rules_enabled` (per-tenant, independent of `menu_engineering_enabled`)

## Overview

Configurable pairing rules that let superadmins set platform defaults and merchants create custom rules for upsell suggestions. Replaces the current "one-size-fits-all" BCG auto-generation with a priority cascade: manual pairs > category rules > tag rules > BCG auto-generated.

Two subsystems:
1. **Tagging system** — predefined + custom tags on menu items (prerequisite for tag-based rules)
2. **Pairing rules engine** — category and tag-based rules with handpicked or random item selection

## 1. Tagging System

### Data Model

**`tag_definitions`** — taxonomy of tags (platform presets + merchant custom):

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default `gen_random_uuid()` |
| tenant_id | uuid | nullable — NULL = platform preset visible to all |
| group_name | text | e.g. "Flavor Profile", "Temperature", "Diet" |
| tag_value | text | e.g. "spicy", "cold", "vegan" |
| is_preset | boolean | true = superadmin-created, merchants can't delete |
| created_at | timestamptz | default `now()` |

**Unique constraint:** `(COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), group_name, tag_value)` — prevents duplicate values within a group per tenant. Platform presets use the zero UUID sentinel for uniqueness.

**RLS:** Merchants see rows where `tenant_id = auth.uid()` OR `tenant_id IS NULL` (platform presets).

**`menu_item_tags`** — junction table:

| Column | Type | Notes |
|--------|------|-------|
| menu_item_id | uuid | FK → menu items, ON DELETE CASCADE |
| tag_definition_id | uuid | FK → tag_definitions, ON DELETE CASCADE |
| tenant_id | uuid | NOT NULL, for RLS |

**Primary key:** `(menu_item_id, tag_definition_id)`

### Platform Preset Tags (seeded by migration)

| Group | Values |
|-------|--------|
| Flavor Profile | spicy, mild, sweet, savory, sour, umami |
| Temperature | hot, cold, frozen, room-temp |
| Diet | vegan, vegetarian, halal, keto, gluten-free |

### UI

**Menu item edit form** — new "Tags" section below existing fields:
- Grouped multi-select organized by `group_name`
- Shows platform presets + merchant's custom tags
- "+ Add custom tag" inline action to create new tag_definitions

**Superadmin** — new "Tags" section in platform settings:
- CRUD for platform-level tag_definitions
- Grouped by group_name with inline add/edit/delete

## 2. Pairing Rules Engine

### Data Model

**`pairing_rules`** — one row per rule:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default `gen_random_uuid()` |
| tenant_id | uuid | nullable — NULL = platform default |
| name | text | NOT NULL, merchant-friendly label |
| source_type | text | `'category'` or `'tag'` |
| source_category_id | uuid | FK → categories (when source_type = 'category') |
| source_tag_id | uuid | FK → tag_definitions (when source_type = 'tag') |
| max_suggestions | int | default 4, total shown across all targets |
| is_active | boolean | default true |
| created_at | timestamptz | default `now()` |
| updated_at | timestamptz | default `now()` |

**Check constraint:** exactly one of `source_category_id` / `source_tag_id` is NOT NULL, matching `source_type`.

**RLS:** Same pattern as tag_definitions — merchants see their own + platform defaults.

**`pairing_rule_targets`** — 1-3 target categories/tags per rule:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default `gen_random_uuid()` |
| rule_id | uuid | FK → pairing_rules, ON DELETE CASCADE |
| target_type | text | `'category'` or `'tag'` |
| target_category_id | uuid | FK → categories (when target_type = 'category') |
| target_tag_id | uuid | FK → tag_definitions (when target_type = 'tag') |
| selection_mode | text | `'handpick'` or `'any'` |
| display_order | int | ordering of targets within the rule |

**Check constraint:** exactly one of `target_category_id` / `target_tag_id` is NOT NULL, matching `target_type`. Max 3 targets per rule (enforced application-side).

**`pairing_rule_target_items`** — handpicked items (only when selection_mode = 'handpick'):

| Column | Type | Notes |
|--------|------|-------|
| target_id | uuid | FK → pairing_rule_targets, ON DELETE CASCADE |
| menu_item_id | uuid | FK → menu items, ON DELETE CASCADE |
| display_order | int | ordering within this target |

**Primary key:** `(target_id, menu_item_id)`

### Resolution Algorithm

When a customer adds an item to cart, `getUpsellsForItem()` runs this cascade:

```
1. Collect item context:
   - category_id from the item
   - tag_ids from menu_item_tags

2. Priority cascade (first tier with results wins, short-circuit):

   Tier 1: Manual pairs
   → Query existing upsell_pairs table (pair_type = 'complementary', is_active = true)
   → Unchanged from current behavior

   Tier 2: Category pairing rules
   → Query pairing_rules WHERE source_type = 'category'
     AND source_category_id = item.category_id AND is_active = true
   → Tenant-scoped rules first, then platform defaults
     (skip platform rules where merchant has a rule with same source_category_id)
   → For each matching rule's targets:
     - If selection_mode = 'handpick': fetch from pairing_rule_target_items
     - If selection_mode = 'any': fetch available items from target category/tag
   → Merge across targets, limit to rule.max_suggestions
   → Exclude items already in cart

   Tier 3: Tag pairing rules
   → Query pairing_rules WHERE source_type = 'tag'
     AND source_tag_id IN (item's tag_ids) AND is_active = true
   → Same tenant-first, platform-fallback logic
   → Same target resolution as tier 2

   Tier 4: BCG auto-generated
   → Query existing upsell_pairs WHERE is_auto_generated = true
   → Unchanged from current behavior

3. Return array of MenuItem objects (same shape as current)
```

### Platform Default Override Behavior

- Platform rules (tenant_id IS NULL) apply to all tenants by default
- Merchant creates a tenant-scoped copy with `is_active = false` to disable a platform rule
- Merchant rules with the same source take precedence (queried first)
- Platform defaults still visible in merchant's rules list with "PLATFORM" badge and toggle

## 3. Admin UI

### Pairing Rules Tab

New tab "Pairing Rules" in the Boost Sales / Menu Engineering dashboard, alongside existing tabs (Upsell Pairs, Smart Suggestions, Checkout Upsell).

**Rules list view:**
- Two sections: "Platform Defaults" and "Your Rules"
- Each rule row shows:
  - Active indicator (green/amber dot)
  - Rule name
  - Source pill (blue for category, red for tag)
  - Arrow → target pills with handpick count or "any" indicator
  - Max suggestions count
  - Platform rules: PLATFORM badge + enable/disable toggle
  - Custom rules: overflow menu (edit, delete)
- Footer note: "Rules are checked in order: Manual Pairs > Category Rules > Tag Rules > Smart BCG"
- "+ Add Rule" button top-right

### Add/Edit Rule Dialog

Form fields:
1. **Rule Name** — text input
2. **Source** — toggle between Category / Tag, then select value from dropdown
3. **Target Categories** (1-3) — each target is a card showing:
   - Category/tag selector
   - Selection mode toggle: "Handpick Items" (default) vs "Any from Category"
   - If handpick: list of selected items as green pills, click to open item picker
   - "+ Add Category" for additional targets (max 3)
4. **Max suggestions** — number input (1-8)
5. Save / Cancel buttons

### Item Picker

Opens when clicking a handpick target category. Shows:
- Search bar
- Scrollable list of all items in that category
- Each item: checkbox, thumbnail, name, price, BCG badge
- Unavailable items shown dimmed at bottom
- "Done (N selected)" button
- Selection count in header

### Superadmin Pairing Rules

Same UI as merchant but:
- Creates rules with tenant_id = NULL (platform defaults)
- PLATFORM badge auto-applied
- Targets can only use "Any from Category" mode (can't handpick merchant-specific items)
- Accessible from superadmin dashboard

## 4. Integration with Existing Components

### What Changes

- `complementary-pairs-service.ts` → `getUpsellsForItem()` extended with the 4-tier cascade
- New service file: `src/lib/pairing-rules-service.ts` for rule CRUD and resolution logic
- New server actions in `src/app/actions/pairing-rules.ts`
- Analytics events gain new `source` values: `'category_rule'`, `'tag_rule'`

### What Stays the Same

- `UpsellSuggestionModal` — receives items array, no changes
- `CheckoutUpsellModal` — tier 2 ("complementary pairs for cart items") now uses enriched resolution, no component changes
- `PairSuggestionSheet` — no changes
- `useUpsellOrchestrator` — no changes (frequency capping is source-agnostic)
- Feature flag gating pattern — `menu_engineering_enabled` unchanged
- All existing manual pairs and BCG pairs — data untouched, just lower in cascade

### New Feature Flag

`pairing_rules_enabled` — boolean column on tenants table:
- Independent of `menu_engineering_enabled` (rules work without BCG)
- Default: false
- Superadmin toggles per tenant
- When false: resolution skips tiers 2 and 3 (category/tag rules), falls through to existing behavior

## 5. New Database Tables Summary

| Table | Purpose | RLS |
|-------|---------|-----|
| `tag_definitions` | Tag taxonomy (presets + custom) | tenant_id match OR NULL |
| `menu_item_tags` | Item ↔ tag junction | tenant_id match |
| `pairing_rules` | Rule definitions | tenant_id match OR NULL |
| `pairing_rule_targets` | 1-3 targets per rule | via rule_id JOIN |
| `pairing_rule_target_items` | Handpicked items per target | via target_id JOIN |

All tables get standard RLS policies. Tenant-scoped rows use `tenant_id = auth.uid()` pattern. Platform defaults (tenant_id IS NULL) are readable by all authenticated users.

## 6. Migration Plan

Single migration file: `supabase/migrations/YYYYMMDD_pairing_rules.sql`

1. Create `tag_definitions` table + RLS
2. Create `menu_item_tags` table + RLS
3. Seed platform preset tags (Flavor Profile, Temperature, Diet)
4. Create `pairing_rules` table + RLS
5. Create `pairing_rule_targets` table + RLS
6. Create `pairing_rule_target_items` table + RLS
7. Add `pairing_rules_enabled` boolean to tenants (default false)

No data migration needed — existing upsell_pairs and complementary pairs tables are untouched.

## 7. File Structure

```
src/lib/pairing-rules-service.ts          — Rule CRUD + resolution logic
src/lib/tags-service.ts                    — Tag definitions + menu item tagging
src/app/actions/pairing-rules.ts           — Server actions for rules
src/app/actions/tags.ts                    — Server actions for tags
src/components/admin/pairing-rules-tab.tsx — Rules list + add/edit dialog
src/components/admin/rule-item-picker.tsx  — Handpick items modal
src/components/admin/tag-manager.tsx       — Tag multi-select for menu item form
src/components/superadmin/tag-presets.tsx   — Platform tag management
supabase/migrations/YYYYMMDD_pairing_rules.sql — Schema + seed data
```

## Out of Scope (Future)

- **Time-based rules** — "During lunch, prioritize quick items" (add time columns to pairing_rules later)
- **Compound conditions** — "Category = Mains AND Tag = spicy" (add conditions JSONB column later)
- **Rule analytics** — which rules drive the most conversions (extend existing analytics events)
- **A/B testing rules** — compare rule effectiveness
