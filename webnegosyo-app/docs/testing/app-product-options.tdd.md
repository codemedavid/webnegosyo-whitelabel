# TDD Evidence — App Product Options Management + Add-after-Edit Fix

**Date:** 2026-07-24
**Branch:** `feat/unified-modifier-groups`
**Scope:** `webnegosyo-app` (merchant admin mobile app)

## Source

Journeys derived during this TDD run from the user request:

> Fix the bug where you can't add a product after having clicked into an edit
> product, and let merchants manage a product's variations and options
> (add-ons) from the app's products management.

Product decisions (confirmed with the user):

- **Data model:** unified `modifier_groups` (the model the web app already reads
  first via `normalizeModifierGroups`).
- **Editing scope:** full group CRUD — name, required toggle, single-vs-multi
  select, min/max, per-option name/price/default/reorder/remove.

## User Journeys

1. As a merchant, after editing an existing product I can open "Add Product"
   and see a blank form (never the previously edited product's data).
2. As a merchant, I can add/rename/remove option groups on a product.
3. As a merchant, I can mark a group required, switch it between single-select
   (variation) and multi-select (add-ons), and set min/max choices.
4. As a merchant, I can add/edit/remove/reorder options with a name and a
   price modifier, and the item saves with a `modifier_groups` payload the
   customer web/menu already understands.
5. As a merchant, products that only carry legacy `variations`/`addons` open in
   the editor as editable groups (backward compatible).

## Root cause of the add-after-edit bug

`app/(main)/product/[productId].tsx` is registered as a **persistent
`Tabs.Screen`** (`app/(main)/_layout.tsx:137`), not a stack screen. Tab screens
do not unmount, so navigating Edit(A) → back → Add reuses the same mounted
component with `productId="new"`. The old load effect only populated the form in
the *edit* branch and never reset it on the *create* branch, so the "New
Product" form showed product A's data. Fixed by deriving all editor state from a
single pure `buildEditorFormState(loaded | null)` and always applying it (the
add path passes `null` → a fresh `EMPTY_PRODUCT_INPUT` copy + cleared errors).

## Task report

| Behavior | Validation command | RED → GREEN |
|---|---|---|
| `buildEditorFormState` returns a clean slate on the add path and maps a loaded product on edit | `npx jest lib/products.test.ts` | RED: `TS2305 has no exported member 'buildEditorFormState'` → GREEN: 5 new tests pass |
| `normalizeModifierGroups`/`validateModifierGroups`/`serializeModifierGroups` | `npx jest lib/modifier-groups.test.ts` | RED: `TS2307 Cannot find module './modifier-groups'` → GREEN: 16 tests pass |
| Immutable group/option CRUD + selection-rule helpers | `npx jest lib/modifier-editor.test.ts` | RED: `TS2307 Cannot find module './modifier-editor'` → GREEN: 20 tests pass |
| `createProduct` persists `modifier_groups` | `npx jest lib/products.test.ts` | RED: `TS2353 'modifier_groups' does not exist in type 'ProductInput'` → GREEN passes |

RED evidence excerpt (pre-implementation run):

```
FAIL lib/modifier-groups.test.ts — Cannot find module './modifier-groups'
FAIL lib/products.test.ts — Module '"./products"' has no exported member 'buildEditorFormState'
Test Suites: 3 failed, 3 total
```

GREEN evidence excerpt (post-implementation, full suite):

```
Test Suites: 17 passed, 17 total
Tests:       235 passed, 235 total
```

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|--------------------|-----------|------|--------|
| 1 | Add path returns a blank form + empty text fields + no leaked singleton | `lib/products.test.ts:buildEditorFormState` | unit | PASS |
| 2 | Edit path maps loaded product into form/price/discount text | `lib/products.test.ts:buildEditorFormState` | unit | PASS |
| 3 | Legacy variations/addons normalize into editable groups | `lib/products.test.ts` + `lib/modifier-groups.test.ts` | unit | PASS |
| 4 | Explicit `modifier_groups` win; grouped/flat/addon fallbacks; empty when none | `lib/modifier-groups.test.ts:normalizeModifierGroups` | unit | PASS |
| 5 | Group validation: name, ≥1 named option, coherent min/max | `lib/modifier-groups.test.ts:validateModifierGroups` | unit | PASS |
| 6 | Serialize reassigns sequential display_order without mutating input | `lib/modifier-groups.test.ts:serializeModifierGroups` | unit | PASS |
| 7 | All editor CRUD ops are immutable and target the right group/option | `lib/modifier-editor.test.ts` | unit | PASS |
| 8 | Required/multiple/min/max helpers set the right selection rules | `lib/modifier-editor.test.ts:selection-rule helpers` | unit | PASS |
| 9 | `createProduct` writes `modifier_groups` to Supabase insert | `lib/products.test.ts:createProduct with modifier groups` | integration (mocked supabase) | PASS |

## Coverage (changed lib modules)

```
File                | % Stmts | % Branch | % Funcs | % Lines
modifier-editor.ts  |     100 |   88.88  |    100  |   100
modifier-groups.ts  |   97.95 |   96.77  |  94.11  |  97.82
products.ts         |   92.42 |   70.21  |    100  |   100
```

New logic is at/above the 80% target. `products.ts` branch % is dragged down by
the pre-existing Supabase CRUD helpers (network paths), not the new code.

## Known gaps

- The `ModifierGroupsEditor` component and the `[productId]` screen are React
  Native UI; the app's Jest config is `testEnvironment: node`, roots `lib/`+
  `theme/`, and explicitly scopes component/UI tests out (verified manually via
  Expo). All decision logic those screens use is extracted into the tested pure
  `lib/` modules above.
- Pre-existing `jsx-a11y/alt-text` warning on the product photo `<Image>` (the
  rule treats RN `<Image>` as HTML `<img>`); an `accessibilityLabel` was added
  for screen-reader users. 0 lint errors.
- Requires DB column `menu_items.modifier_groups` (migration
  `20260724120000_modifier_groups.sql`) to be applied.
