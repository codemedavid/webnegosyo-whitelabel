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

## Phase 1a UI — inventory admin (DONE this session)

Delivered the inventory admin surface on top of the tested backend:

- **`src/lib/inventory/inventory-form.ts`** (TDD, 11/11) — pure draft↔input
  coercion for the manager. `buildIngredientInput` / `buildUnitInput` trim text,
  map blank sku/category → null, blank cost/reorder → 0, and reuse the service
  zod schemas so client and server raise identical messages;
  `ingredientToDraft` / `unitToDraft` round-trip a row into the edit dialog.
- **`src/app/[tenant]/admin/inventory/page.tsx`** — server page, `notFound()`
  when `inventory_enabled` is false, seeds default units on first visit
  (idempotent) and loads ingredients.
- **`src/components/admin/inventory-manager.tsx`** — client, Ingredients + Units
  tabs with create/edit/delete dialogs over the `inventory.ts` actions.
- **Sidebar** — "Inventory" link under Menu, hidden unless `inventory_enabled`;
  `permissionForAdminPath` maps `inventory` → `menu` so restricted staff without
  the menu permission don't see it. `Tenant.inventory_enabled` added to the
  hand-written type (column already existed in DB / `supabase.ts`).

### Test specification (Phase 1a UI)
| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 8 | Ingredient draft trims name and coerces numeric strings | `buildIngredientInput › trims the name…` | unit | PASS |
| 9 | Blank sku/category → null (not "") | `… maps blank sku and category to null` | unit | PASS |
| 10 | Blank cost/reorder → 0 | `… treats blank cost and reorder level as zero` | unit | PASS |
| 11 | is_prep / is_active flags pass through | `… passes through the is_prep and is_active flags` | unit | PASS |
| 12 | Empty name → "Name is required" | `… throws a friendly error when the name is empty` | unit | PASS |
| 13 | Missing stock unit → "A stock unit is required" | `… throws a friendly error when no stock unit is chosen` | unit | PASS |
| 14 | Negative unit cost rejected | `… rejects a negative unit cost` | unit | PASS |
| 15 | Ingredient row round-trips to an editable draft | `ingredientToDraft › round-trips…` | unit | PASS |
| 16 | Unit draft trims text, coerces factor | `buildUnitInput › trims text and coerces…` | unit | PASS |
| 17 | Conversion factor ≤ 0 rejected | `… throws when the conversion factor is zero or negative` | unit | PASS |
| 18 | Unit row round-trips to an editable draft | `unitToDraft › round-trips…` | unit | PASS |

RED: 4 fixture-uuid failures on first run (invalid RFC variant), then module-missing compile RED confirmed before impl.
GREEN commit: `feat: inventory form-mapping helpers + inventory_enabled flag (GREEN)`.
UI commit: `feat: inventory admin page + manager (units/ingredients CRUD)`.

## Phase 1a recipe-attach control (DONE this session)

Wired the recipe-attach control onto recipe-stock modifier options, closing
Phase 1a.

- **`src/lib/inventory/recipe-form.ts`** (TDD, 9/9) — pure form logic:
  `buildRecipeInput` drops fully-blank lines, coerces quantities, maps blank
  notes→null and validates via `recipeInputSchema`; `recipeFormFromData`
  round-trips an existing recipe (null → one blank line); `estimateRecipeCost`
  converts each line to the ingredient's stock unit × unit cost, skipping
  unknown/cross-dimension lines rather than throwing.
- **`src/components/admin/modifier-option-recipe-editor.tsx`** — loads
  ingredients/units + existing recipe via the `inventory.ts` actions on mount,
  edits component lines with a live cost estimate, saves via
  `saveRecipeForTargetAction` (empty → `deleteRecipeForTargetAction`). Its own
  server round-trip, independent of the product form's Save.
- **`modifier-groups-editor.tsx`** — `ModifierRecipeContext` threaded
  `ModifierGroupsEditor → ModifierGroupCard → ModifierOptionRow`. The control
  renders when `stock_mode==='recipe'` + `inventoryEnabled` + `menuItemId`; falls
  back to "enable Inventory" / "save the item first" hints otherwise.
- **`menu-item-form.tsx`** + both menu pages (`menu/new`, `menu/[id]`) pass
  `inventoryEnabled` / `recipeContext` (`menuItemId = item?.id`, undefined for
  new items).

### Test specification (Phase 1a recipe-attach)
| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 19 | Blank trailing lines dropped, quantity coerced, notes trimmed | `buildRecipeInput › drops fully-blank trailing lines…` | unit | PASS |
| 20 | Blank notes → null | `… maps blank notes to null` | unit | PASS |
| 21 | Ingredient chosen but no unit → "A unit is required" | `… rejects a line with a chosen ingredient but no unit` | unit | PASS |
| 22 | Blank quantity on a filled line → 0 | `… treats blank quantity on a filled line as zero` | unit | PASS |
| 23 | No recipe yet → one blank line | `recipeFormFromData › returns a single blank line…` | unit | PASS |
| 24 | Existing recipe round-trips to string lines | `… round-trips an existing recipe…` | unit | PASS |
| 25 | Cost = qty→stock-unit × unit cost | `estimateRecipeCost › sums quantity converted…` | unit | PASS |
| 26 | Unknown ingredient/unit lines ignored | `… ignores lines whose ingredient or unit is unknown` | unit | PASS |
| 27 | All-blank form → 0, no throw | `… returns 0 for an all-blank form…` | unit | PASS |

RED: module-missing compile RED, then 2 fixture-uuid failures fixed (impl correct).
GREEN commit: `feat: recipe-form helpers for modifier-option recipe editor (GREEN)`.
UI commit: `feat: recipe-attach control on recipe-stock modifier options`.

## Migration status — APPLIED
`20260724120000_modifier_groups.sql` **applied to the live DB via Supabase MCP**
this session (idempotent, additive). Verified: `menu_items.modifier_groups`,
`recipes.modifier_option_id`, `tenants.modifier_groups_enabled`, the
`idx_recipes_modifier_option_uq` partial unique index, and the extended
`recipes_target_type_ck` check (now includes `modifier_option`) all present.
`inventory_core` + `staff_management` were already applied. Production is now
ready for modifier-option recipes; no tenant has `inventory_enabled` /
`modifier_groups_enabled` on yet.

## Known gaps / follow-ups (post Phase 1a)
- Component-level React tests for the two new client editors are not included
  (jsdom + server-action mocking); the pure logic they delegate to is fully
  TDD-covered (inventory-form 11/11, recipe-form 9/9).
- Pre-existing unrelated failures in `webnegosyo-app/lib/printer-native-load` and
  `order-item-images` (mobile native-module mocking) — untouched by this work.
- Later phases still pending: storefront rendering (2), stock ledger (3),
  desktop POS (4), mobile (5); plus Phase 1c Modifier Library.

---

# Phase 2 (Storefront) — modifier-groups rendering on the product page

**Scope this session (user-chosen "bounded slice"):** pure selection adapter +
`useModifierGroups` hook + `ModifierGroupsSelector` presentational component,
wired into the **main product detail page** (`product-detail-content.tsx`) with a
storefront read of `modifier_groups_enabled`. Secondary surfaces
(`item-detail-modal.tsx`, `product-detail-sheet.tsx`) explicitly deferred.

## Design — adapter over the existing cart pipeline
Rather than extend `CartItem` / `calculateCartItemSubtotal`, the selection is
projected back into the legacy `selected_variations` / `selected_addons` shapes
at the boundary (`mapSelectionToCartFormat`). Single-select groups
(`max_select === 1`) → a variation entry; multi-select groups → add-ons whose
`price` is the option `price_modifier`. Result: pricing, cart-id generation,
order-item unit price, and the messenger message all work unchanged, and the
cart subtotal equals `computeModifierSubtotal` exactly (asserted in a parity
test).

## Zero-regression gating
The new path activates only when `modifier_groups_enabled` **and** the item
carries an explicit `modifier_groups` payload (`useModifierGroups().active`).
Legacy items (`variation_types` / `variations` / `addons`) take the untouched
existing path — the three legacy sections are gated behind `!useGroups`.

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|--------------------|-----------|------|--------|
| 28 | Single-select default = is_default (else first available when required); optional single-select empty | `tests/unit/modifier-groups-cart.test.ts` | unit | PASS |
| 29 | Multi-select default = only is_default options | same | unit | PASS |
| 30 | Default skips an unavailable option for a required single-select | same | unit | PASS |
| 31 | Single-select toggle replaces; multi toggles; capped multi ignores over-cap add; removal always allowed | same | unit | PASS |
| 32 | `toggleOption` never mutates its input | same | unit | PASS |
| 33 | Single-select → `selected_variations`; multi → `selected_addons` (price = price_modifier) | same | unit | PASS |
| 34 | Cart subtotal via `calculateCartItemSubtotal` == `computeModifierSubtotal` (pricing parity) | same | unit | PASS |
| 35 | `validateAllGroups` reports the first unmet required group | same | unit | PASS |
| 36 | Hook inactive when no modifier_groups; active + seeds defaults otherwise | `tests/unit/hooks/useModifierGroups.test.ts` | unit | PASS |
| 37 | Hook total price = (base + defaults) × qty; discounted price used as base | same | unit | PASS |
| 38 | Hook toggle (single replace / multi add) reflects in price + cartFormat | same | unit | PASS |
| 39 | Hook validate: valid by default, invalid once a required group is cleared | same | unit | PASS |
| 40 | Hook quantity clamps to [1, 99] | same | unit | PASS |
| 41 | Selector renders group names + option labels; forwards `onToggle(group, id)` | `tests/unit/modifier-groups-selector.test.tsx` | unit | PASS |
| 42 | Selector marks selected option `aria-pressed`; required/optional indicator shown | same | unit | PASS |
| 43 | Selector disables unavailable (sold-out) option and suppresses its toggle | same | unit | PASS |
| 44 | Selector renders nothing for empty groups | same | unit | PASS |

RED→GREEN checkpoints (this branch):
- `test: RED spec for storefront modifier-groups selection adapter`
- `feat: storefront modifier-groups selection adapter (GREEN)`
- `feat: useModifierGroups storefront hook (GREEN)`
- `feat: ModifierGroupsSelector presentational storefront component (GREEN)`
- `feat: render unified modifier groups on the product detail page`

Suite result: adapter 19/19, hook 9/9, selector 7/7; `product-detail-content`
render suite 9/9 still green (no regression). Changed files typecheck + lint
clean.

## Known gaps / follow-ups (Phase 2)
- **`product-detail-sheet.tsx`** (menu-grid quick-view) — DONE. It wraps
  `ProductDetailContent` and now forwards `modifier_groups_enabled` from the
  tenant, so groups render in the primary quick-view path too. Commit:
  `feat: forward modifier_groups_enabled to the menu quick-view sheet`.
- **`item-detail-modal.tsx`** — STILL DEFERRED. It has its own ~500-line
  selection UI (calls `calculateCartItemSubtotal` directly) and doubles as the
  **cart-line editor** (seeds from `selected_variations`/`selected_addons`).
  Making it modifier-groups aware needs a NEW reverse adapter
  (`cartFormat → ModifierSelection`, the inverse of `mapSelectionToCartFormat`)
  for edit-mode round-trip, plus selector integration. Genuine additional
  surface, not a one-liner.
- Component-level render test of `product-detail-content` in the `useGroups`
  branch is not added; the branch delegates entirely to the hook + selector,
  which are unit-covered (tests 36–44).

---

## Phase 1c — Modifier Library (reusable groups)

**Intent:** let a tenant define a whole modifier group once (name + min/max
selection rules + option list) and attach fresh-id snapshots of it to many menu
items, mirroring the existing `addon_library` snapshot-on-attach model.

### User journeys
- As an admin, I define a reusable group (e.g. "Size") in a library so I don't
  rebuild it per item.
- As an admin, I attach a library group to an item; it lands as an independent
  snapshot so later library edits never retroactively mutate that item.
- As an admin, attaching a group whose name already exists on the item is a
  no-op (no duplicate groups).

### RED → GREEN
- RED: `test: add reproducer for modifier library snapshot/attach helpers` —
  `tests/unit/modifier-library-utils.test.ts` failed to compile (module +
  `ModifierGroupLibraryEntry` type absent).
- GREEN: `feat: modifier library snapshot/attach pure helpers (GREEN)` — added
  `src/lib/modifier-library-utils.ts` + the type. 12/12 pass.
- Wiring: `feat: modifier_group_library table + server service` — additive
  migration `20260725120000_modifier_group_library.sql` (CREATE TABLE + RLS
  mirroring addon_library) and `src/lib/modifier-library-service.ts` (tenant CRUD).

### Test specification
| # | What is guaranteed | Test | Result |
|---|--------------------|------|--------|
| 1 | Minimal group parses; min_select→0, max_select→null, is_active→true defaults | `modifierGroupLibraryEntrySchema accepts a minimal single-select group` | PASS |
| 2 | Empty group name rejected | `rejects an empty group name` | PASS |
| 3 | Group with zero options rejected | `rejects a group with no options` | PASS |
| 4 | `max_select < min_select` rejected | `rejects max_select smaller than min_select` | PASS |
| 5 | Unlimited multi-select (max null) with a min allowed | `allows unlimited multi-select` | PASS |
| 6 | Attach produces fresh group id + fresh option ids (no library ids leak) | `produces a group with a fresh id and fresh option ids` | PASS |
| 7 | Name + rules + option definitions preserved on attach | `preserves the group name, selection rules, and option definitions` | PASS |
| 8 | Per-item stock (`stock_mode`/`stock_qty`) never copied into snapshot | `does not carry per-item stock state into the snapshot` | PASS |
| 9 | Draft prefilled from an item group strips runtime ids | `prefills a draft from an existing item group, stripping ids` | PASS |
| 10 | Attach appends immutably (original array untouched) | `appends snapshots of entries to the existing groups (immutable)` | PASS |
| 11 | Duplicate group name (case-insensitive) skipped | `skips an entry whose group name already exists` | PASS |
| 12 | New groups ordered after current max display_order | `assigns display_order after the current maximum` | PASS |

Suite result: `modifier-library-utils` 12/12; full `modifier*` group 125/125.
New files typecheck + lint clean.

### Known gaps / follow-ups (Phase 1c)
- **Migration not yet applied to the DB.** `20260725120000_modifier_group_library.sql`
  is additive-only (CREATE TABLE IF NOT EXISTS + RLS DO-blocks, zero destructive
  statements). Generated `src/types/supabase.ts` was updated by hand to match;
  run the normal apply + `generate_typescript_types` to reconcile.
- **Admin UI picker deferred.** No editor surface yet lets an admin manage the
  library or click-attach a group. Pure helpers + service are ready to wire; the
  UI (library manager tab + per-item "Add from library" picker) is a separate
  slice.
