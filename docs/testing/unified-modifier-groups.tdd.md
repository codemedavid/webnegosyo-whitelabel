# TDD Evidence — Unified Modifier Groups (Phase 0: foundation)

**Source plan**: `.claude/plans/unified-modifier-groups.plan.md`
**Branch**: `feat/unified-modifier-groups` (merges the inventory-costing engine into the staff-management base)
**Scope of this report**: Phase 0 only — data model + pure normalizer. Phases 1–5 (admin editor, storefront, stock backend, POS, mobile) are not yet implemented.

## User journeys covered (Phase 0)
- As a developer, I want one `ModifierGroup[]` model regardless of whether an item uses the new `modifier_groups` payload or only legacy `variation_types` / `variations` / `addons`, so every surface reads modifiers the same way (backward compatibility).
- As the storefront/POS, I want to validate a customer's selection against a group's min/max rules.
- As the storefront/POS, I want to know if an option is out of stock (simple per-option count) so I can hide/disable it.
- As the costing layer, I want a per-option cost where an attached recipe overrides a manual cost, else manual, else 0.

## Task report
| Plan task | Summary | Validation command | Result |
|---|---|---|---|
| Types + migration | Added `ModifierGroup`/`ModifierOption`/`ModifierStockMode` to `database.ts`; `menu_items.modifier_groups` jsonb, `recipes.modifier_option_id` + `modifier_option` target, `tenants.modifier_groups_enabled` in migration `20260724120000`; hand-synced `supabase.ts`. Additive — legacy columns untouched. | `npx jest` (compiles; no type breakage) | PASS |
| Pure normalizer | `src/lib/modifier-groups.ts` — `normalizeModifierGroups`, `validateGroupSelection`, `computeModifierSubtotal`, `isOptionAvailable`, `resolveOptionCost`. | `npx jest tests/unit/modifier-groups.test.ts` | RED 26/26 → GREEN 26/26 |

RED evidence: `Tests: 26 failed, 26 total` (all threw `not implemented` — compiled & executed for the intended reason).
GREEN evidence: `Tests: 26 passed, 26 total`.

## Test specification
| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Explicit `modifier_groups` returned, sorted by display_order | `normalizeModifierGroups › returns explicit…` | unit | PASS |
| 2 | Options within a group sorted by display_order | `normalizeModifierGroups › sorts options…` | unit | PASS |
| 3 | Required variation_type → single-select group (min 1, max 1) | `… required single-select…` | unit | PASS |
| 4 | Non-required variation_type → optional single-select (min 0, max 1) | `… optional single-select…` | unit | PASS |
| 5 | Legacy addons → optional multi-select group (min 0, max null); price→price_modifier | `… optional multi-select from legacy addons` | unit | PASS |
| 6 | Legacy flat variations → single-select group | `… single-select from legacy flat variations` | unit | PASS |
| 7 | variation_types AND addons → two separate groups | `… combines grouped… AND addons` | unit | PASS |
| 8 | No modifiers → empty array | `… empty array when… no modifiers` | unit | PASS |
| 9 | grouped variation_types preferred over legacy flat variations | `… prefers grouped… over legacy flat` | unit | PASS |
| 10 | Selection min/max enforced (required, optional, single, multi, finite max) | `validateGroupSelection › *` (6) | unit | PASS |
| 11 | Subtotal = (base + Σ modifiers) × qty, rounded to cents | `computeModifierSubtotal › *` (3) | unit | PASS |
| 12 | Availability: explicit disable, simple stock 0/undefined, recipe best-effort | `isOptionAvailable › *` (4) | unit | PASS |
| 13 | Cost: recipe overrides manual (incl. recipe cost 0); manual fallback; 0 default | `resolveOptionCost › *` (4) | unit | PASS |

## Coverage & known gaps
- Full unit suite after change: `Tests: 3 failed, 1950 passed`. The 3 failures are in `webnegosyo-app/lib/{printer-native-load,order-item-images}.test.ts` and **pre-exist** on the base commit (verified by checkout of `HEAD~2`); unrelated to this feature.
- Not yet built (later phases): recipe↔modifier_option graph resolver wiring, admin editor, storefront/POS rendering, `inventory_movements` stock ledger + order deduction, mobile.
- Migration `20260724120000_modifier_groups.sql` is written but **not yet applied** to the live DB (deferred until Phase 1 needs it).

## Merge evidence (RED/GREEN)
- RED: `test: RED reproducer for unified modifier-groups normalizer` (a7f4cec) — 26 failing.
- GREEN: `feat: implement unified modifier-groups normalizer (GREEN)` (715b1dc) — 26 passing.

---

# Phase 1 — Web admin (unified editor + legacy sync)

**Scope of this section**: the unified Modifier Groups editor and the
serialization contract that keeps legacy columns synced on save. Recipe-attach
inventory CRUD, Modifier Library evolution, and margin display remain pending
(see gaps below).

## User journeys covered (Phase 1)
- As a merchant, I want one editor to build both single-select groups (e.g. Size)
  and multi-select groups (e.g. Extras) with per-group rules (required, allow
  multiple, max) and per-option price / manual cost / stock mode / image.
- As the platform, when a merchant saves the unified model, I want the legacy
  `variation_types` / `addons` columns kept in sync so storefront, POS, and
  mobile (not yet reading `modifier_groups`) keep rendering unchanged.
- As a merchant enabling the flag on a legacy item, I want the editor seeded
  from that item's existing variations/add-ons (via the Phase 0 normalizer).

## Task report
| Plan task | Summary | Validation command | Result |
|---|---|---|---|
| Form serialization + legacy sync | `src/lib/modifier-groups-form.ts` — factories, immutable rule toggles (`setGroupRequired`/`setGroupMultiple`), `serializeGroups` cleanup, `splitGroupsToLegacyColumns` backward-compat mirror. | `npx jest tests/unit/modifier-groups-form.test.ts` | RED 14 (module missing) → GREEN 14/14 |
| Persistence | `admin-service.ts`: `modifierGroupSchema`/`modifierOptionSchema`; `menuItemSchema.modifier_groups`; write `modifier_groups` on create + update. | `npx tsc --noEmit` (clean) | PASS |
| Editor UI + wiring | `modifier-groups-editor.tsx` (new); `menu-item-form.tsx` seeds via normalizer, saves `modifier_groups` + derived legacy columns, gated by `modifier_groups_enabled`; flag threaded from both admin pages. | `npx next lint` (touched files) | PASS (no warnings/errors) |

RED evidence: `Cannot find module '@/lib/modifier-groups-form'` — compile-time RED for the intended reason.
GREEN evidence: `Tests: 14 passed, 14 total`. Full suite: `3 failed, 2030 passed` (the 3 are the pre-existing `webnegosyo-app` printer/image failures).

## Test specification (Phase 1)
| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | `createModifierGroup` → optional single-select, no options | `createModifierGroup › …` | unit | PASS |
| 2 | `createModifierOption` → zero-price, stock_mode 'none' | `createModifierOption › …` | unit | PASS |
| 3 | `setGroupMultiple(true)` clears max cap; original untouched (immutable) | `setGroupMultiple › …` (3) | unit | PASS |
| 4 | `setGroupMultiple(false)` caps max at 1 and clamps min ≤ 1 | `setGroupMultiple › switching to single-select…` | unit | PASS |
| 5 | `setGroupRequired` raises/drops min_select, preserving max | `setGroupRequired › …` (2) | unit | PASS |
| 6 | `serializeGroups` drops blank options, drops empty groups, trims, reindexes | `serializeGroups › …` (3) | unit | PASS |
| 7 | single-select group → variation_type (is_required from min_select) | `splitGroupsToLegacyColumns › maps a single-select…` | unit | PASS |
| 8 | multi-select group → addons (price from price_modifier) | `splitGroupsToLegacyColumns › flattens…` | unit | PASS |
| 9 | mixed groups split correctly; legacy flat `variations` never emitted | `splitGroupsToLegacyColumns › handles mixed…` | unit | PASS |
| 10 | finite max > 1 treated as multi-select | `splitGroupsToLegacyColumns › treats a finite max…` | unit | PASS |

## Coverage & known gaps (Phase 1)
- **Pending in Phase 1**: minimal inventory admin CRUD (units/ingredients/recipes) so an option's `stock_mode='recipe'` can attach a real recipe; Modifier Library (evolve Add-on Library into reusable groups); per-option/per-item margin display in the editor. The editor already captures `manual_cost` and `stock_mode`; recipe attach + margin surface are the next slice.
- Migration `20260724120000_modifier_groups.sql` still **not applied** to live DB — must be applied before the flag is turned on for any tenant (otherwise `modifier_groups` write fails). No tenant has `modifier_groups_enabled=true` yet, so production is unaffected.
- Editor component is presentational; covered by the pure serialization tests it delegates to, not by a separate render test.

## Merge evidence (Phase 1 RED/GREEN)
- RED: `test: RED reproducer for modifier-groups form serialization` — 14 failing (module missing).
- GREEN: `feat: modifier-groups form serialization + legacy-column sync (GREEN)` — 14 passing.
- Editor + wiring: `feat: unified Modifier Groups editor wired into menu-item form (Phase 1)`.

---

# Phase 1a — Inventory recipe-attach backend (recipe-target + services + actions)

**Scope of this section**: the data path that lets a modifier option with
`stock_mode='recipe'` carry a real inventory recipe — the pure target→column
mapping, the ingredients/recipes service layer, and server actions. The admin
UI (`/admin/inventory` page + in-editor recipe-attach control) is deferred to a
following session (see gaps).

## User journeys covered (Phase 1a)
- As the platform, I want a recipe addressed by any of the five costable targets
  (menu item, variation option, addon, **modifier option**, prep item) to map to
  exactly the right `recipes` columns, so the partial unique indexes hold and no
  target's id leaks into another's column.
- As a merchant, I want ingredients (raw + prep) I can create/edit/delete, and a
  recipe I can save against a target that replaces its component lines wholesale.

## Task report
| Plan task | Summary | Validation command | Result |
|---|---|---|---|
| Recipe target mapping | `src/lib/inventory/recipe-target.ts` — `buildRecipeTargetColumns(target)` for all 5 target types; trims + requires the target's id; nulls every other column. | `npx jest tests/unit/recipe-target.test.ts` | RED 0/7 (module missing) → GREEN 7/7 |
| Ingredients service | `src/lib/inventory/ingredients-service.ts` — `ingredientInputSchema` + tenant-scoped CRUD over `inventory_items`, mirrors `units-service.ts`. | `npx tsc --noEmit` (no errors in file) | PASS |
| Recipes service | `src/lib/inventory/recipes-service.ts` — `getRecipeForTarget`, `saveRecipeForTarget` (upsert + wholesale component replace), `deleteRecipeForTarget`, `getRecipesForMenuItem`; keyed via `buildRecipeTargetColumns`. | `npx tsc --noEmit` (no errors in file) | PASS |
| Server actions | `src/app/actions/inventory.ts` — units/ingredients/recipes-by-target actions, `{success,data|error}` envelope, `revalidatePath`. | `npx tsc --noEmit` (no errors in file) | PASS |

RED evidence: `Cannot find module '@/lib/inventory/recipe-target'` — compile-time RED for the intended reason.
GREEN evidence: `Tests: 7 passed, 7 total`.

## Test specification (Phase 1a)
| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | menu_item → menu_item_id only, all other target cols null | `buildRecipeTargetColumns › keys a menu_item…` | unit | PASS |
| 2 | variation_option → menu_item_id + variation_option_id | `… keys a variation_option…` | unit | PASS |
| 3 | addon → menu_item_id + addon_id | `… keys an addon…` | unit | PASS |
| 4 | modifier_option → menu_item_id + modifier_option_id (unified path) | `… keys a modifier_option…` | unit | PASS |
| 5 | prep_item → prep_item_id only, no menu_item_id | `… keys a prep_item…` | unit | PASS |
| 6 | Blank required id throws a labelled error | `… rejects a target whose required id is blank` | unit | PASS |
| 7 | Id fields are trimmed | `… trims surrounding whitespace…` | unit | PASS |

## Coverage & known gaps (Phase 1a)
- **Deferred to next session** (pure UI, no new testable logic): `/admin/inventory`
  page + `InventoryManager` (units/ingredients tables), and the recipe-attach
  control inside the modifier option row wired to `saveRecipeForTargetAction`.
- Service DB wrappers are thin Supabase calls (like `units-service.ts`) — the
  tested part is the pure `buildRecipeTargetColumns` they delegate keying to.
- Migration `20260724120000_modifier_groups.sql` (adds `recipes.modifier_option_id`
  + `modifier_option` target) still **not applied** to live DB — required before
  `saveRecipeForTarget` with a modifier_option target will succeed in production.

## Merge evidence (Phase 1a RED/GREEN)
- RED: `test: RED reproducer for recipe-target column mapping` (e2f88cc) — 7 failing (module missing).
- GREEN: `feat: recipe-target mapping + inventory ingredients/recipes services (GREEN)` (2a9652c) — 7 passing.
- Actions: `feat: inventory server actions (units/ingredients/recipes-by-target)` (e52875c).

## Handoff — resume Phase 1a UI next session
1. `src/app/[tenant]/admin/inventory/page.tsx` — mirror `admin/addons/page.tsx`
   (resolve tenant via `getCachedTenantBySlug`, seed units via
   `seedInventoryUnitsAction` on first load, render manager).
2. `src/components/admin/inventory-manager.tsx` — units + ingredients tables
   (client), calling the `inventory.ts` actions.
3. Recipe-attach control in `modifier-groups-editor.tsx`'s `ModifierOptionRow`
   (shown when `stock_mode==='recipe'`): ingredient picker + quantity/unit lines,
   target `{ type: 'modifier_option', menuItemId, modifierOptionId: option.id }`,
   persisted via `saveRecipeForTargetAction`. Needs `menuItemId` threaded into the
   editor (new items have no id yet — attach recipe only after first save, or
   disable with a hint).
4. Add an Inventory nav link (gate behind `inventory_enabled`).
