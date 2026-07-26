# TDD Evidence — App Add-on Authoring + Legacy Column Mirroring

**Date:** 2026-07-26
**Branch:** `feat/unified-modifier-groups`
**Scope:** `webnegosyo-app` (merchant admin mobile app)

## Source

Journeys derived during this TDD run from the user request:

> Hey the webnegosyo app doesn't have an option to add an add-ons it only has
> the variations. Can we please fix it?

Investigation found two distinct defects behind that single report:

1. **Discoverability.** The unified editor (`components/ModifierGroupsEditor.tsx`,
   shipped by [app-product-options.tdd.md](./app-product-options.tdd.md)) sat
   under a card titled "Variations & Options". Creating an add-on required
   adding a group and then flipping an "Allow multiple" switch. No control was
   labelled "add-on".
2. **Persistence.** `lib/products.ts` wrote only `modifier_groups`. The web
   admin (`src/components/admin/menu-item-form.tsx:158`) also mirrors the
   unified groups into the legacy `variation_types` / `addons` columns via
   `splitGroupsToLegacyColumns`, because the customer storefront, white-labeled
   customer app and desktop POS still read those columns. An add-on authored in
   the merchant app was therefore saved, redisplayed correctly in the app, and
   invisible to every customer-facing surface.

Product decisions (confirmed with the user):

- **Scope:** fix both the UI affordance and the save path.
- **Mirroring:** always write the derived legacy columns, unconditionally. The
  web admin gates mirroring on the tenant's `modifier_groups_enabled` flag; the
  app does not fetch that flag, and always-mirror is the safe superset — the
  legacy columns stay correct whether or not a reader has adopted
  `modifier_groups`.

## User Journeys

1. As a merchant, I can see a clearly labelled way to add an add-on to a
   product, without knowing that an add-on is "a multi-select option group".
2. As a merchant, I can tell at a glance whether an existing group is a
   variation (pick one) or an add-on (pick any).
3. As a merchant, an add-on I save in the app appears on my customer-facing
   menu, not just back inside the app.
4. As a merchant, removing every option group from a product clears its options
   everywhere, instead of leaving stale add-ons on the storefront.
5. As a merchant, toggling a product's availability never disturbs its saved
   variations or add-ons.

## Task Report

### Task 1 — `splitGroupsToLegacyColumns` (mobile port)

Ported the web admin's backward-compatibility mirror into
`lib/modifier-groups.ts`: single-select groups (`max_select === 1`) become
`variation_types`; every multi-select group's options flatten into the shared
`addons` list; `variations` (the oldest flat format) is always emitted empty.

- **Validation:** `npx jest lib/modifier-groups.test.ts`
- **RED:** compile-time — `TS2305: Module './modifier-groups' has no exported
  member 'splitGroupsToLegacyColumns'`. The new test newly references the
  missing implementation, so the compile failure is the intended RED signal.
- **GREEN:** suite passes.
- **Guaranteed:** the mobile app and the web admin produce byte-identical legacy
  rows for the same unified groups.

### Task 2 — Mirror on every write

Added `toMenuItemRow` in `lib/products.ts`; `createProduct` and `updateProduct`
now expand `modifier_groups` into `modifier_groups + variation_types +
variations + addons`. A payload that omits `modifier_groups` (the availability
toggle) passes through untouched.

- **Validation:** `npx jest lib/products.test.ts`
- **RED:** runtime — 3 failures. Received insert/update payloads contained
  `modifier_groups` only, with no `addons` or `variation_types` key.
- **GREEN:** suite passes.
- **Guaranteed:** add-ons authored in the app reach the storefront; clearing all
  groups clears the legacy columns; a partial update cannot wipe options.

### Task 3 — Explicit add-on affordance

Added `createAddonGroup` / `addAddonGroup` / `DEFAULT_ADDON_GROUP_NAME` to
`lib/modifier-editor.ts` (optional, unlimited multi-select, pre-named
"Add-ons", one blank option). Wired into `ModifierGroupsEditor` as a second
`+ Add add-on` button beside `+ Add variation`, plus a per-group
"Variation · pick one" / "Add-on · pick any" badge. Card retitled
"Variations & Add-ons".

- **Validation:** `npx jest lib/modifier-editor.test.ts`
- **RED:** compile-time — `TS2305` for all three missing exports.
- **GREEN:** suite passes.
- **Guaranteed:** the one-tap add-on factory applies the correct selection
  rules; the plain group factory still yields a single-select variation.

## Test Specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | A single-select group mirrors into `variation_types` with its required flag and option order intact | `lib/modifier-groups.test.ts:mirrors a single-select group into variation_types` | unit | PASS | `npx jest lib/modifier-groups.test.ts` |
| 2 | A multi-select group's options flatten into `addons` with `price_modifier` mapped to `price` | `lib/modifier-groups.test.ts:flattens a multi-select group's options into addons` | unit | PASS | same |
| 3 | A finite cap above 1 counts as multi-select, not a variation | `lib/modifier-groups.test.ts:treats a finite cap above one as multi-select` | unit | PASS | same |
| 4 | An optional single-select group is mirrored as not required | `lib/modifier-groups.test.ts:marks an optional single-select group as not required` | unit | PASS | same |
| 5 | A mixed list splits across both legacy columns | `lib/modifier-groups.test.ts:splits a mixed list into both legacy columns` | unit | PASS | same |
| 6 | The oldest flat `variations` column is always emitted empty | `lib/modifier-groups.test.ts:always clears the oldest flat variations column` | unit | PASS | same |
| 7 | No groups yields empty columns, so removals clear legacy data | `lib/modifier-groups.test.ts:returns empty columns for no groups...` | unit | PASS | same |
| 8 | Mirroring never mutates the input groups | `lib/modifier-groups.test.ts:does not mutate the input groups` | unit | PASS | same |
| 9 | Insert writes the derived `addons` / `variation_types` / `variations` alongside `modifier_groups` | `lib/products.test.ts:writes multi-select options to the addons column on insert` | integration (mocked Supabase) | PASS | `npx jest lib/products.test.ts` |
| 10 | Update writes the derived legacy columns | `lib/products.test.ts:writes multi-select options to the addons column on update` | integration | PASS | same |
| 11 | Removing every group clears the legacy columns rather than leaving them stale | `lib/products.test.ts:clears the legacy columns when every group is removed` | integration | PASS | same |
| 12 | A payload without `modifier_groups` writes no option columns at all | `lib/products.test.ts:leaves the legacy columns untouched when the caller omits modifier_groups` | integration | PASS | same |
| 13 | `createAddonGroup` produces an optional, unlimited multi-select group | `lib/modifier-editor.test.ts:creates an optional, unlimited multi-select group` | unit | PASS | `npx jest lib/modifier-editor.test.ts` |
| 14 | A new add-on group is pre-named and seeded with one blank option | `lib/modifier-editor.test.ts:pre-fills a recognisable group name and one blank option` | unit | PASS | same |
| 15 | Each add-on group gets a unique id | `lib/modifier-editor.test.ts:gives each add-on group a unique id` | unit | PASS | same |
| 16 | `addAddonGroup` appends immutably | `lib/modifier-editor.test.ts:appends the add-on group without mutating the input` | unit | PASS | same |
| 17 | The plain group factory still yields a single-select variation | `lib/modifier-editor.test.ts:still yields a single-select group from the plain group factory` | unit | PASS | same |

## Coverage

```
npx jest --coverage --collectCoverageFrom='lib/modifier-groups.ts' \
  --collectCoverageFrom='lib/modifier-editor.ts' \
  --collectCoverageFrom='lib/products.ts' \
  lib/modifier-groups.test.ts lib/modifier-editor.test.ts lib/products.test.ts

File                | % Stmts | % Branch | % Funcs | % Lines
All files           |   96.64 |    81.37 |    98.3 |   99.38
 modifier-editor.ts |     100 |    88.88 |     100 |     100
 modifier-groups.ts |   98.38 |    91.66 |   95.45 |    98.3
 products.ts        |   92.75 |    70.83 |     100 |     100
```

Above the 80% threshold on every metric. Full suite: `npx jest` → **30 suites,
464 tests passed**. `npx tsc --noEmit` → clean.

### Known gaps

- **No component test for `ModifierGroupsEditor`.** `jest.config.js` scopes
  `roots` to `lib/` and `theme/`; screens are exercised manually via Expo. The
  add-on affordance is therefore verified at the logic layer
  (`createAddonGroup` / `addAddonGroup`) and the JSX wiring is untested. This
  matches the existing repo convention rather than introducing a second test
  environment.
- **Not verified end-to-end against a live tenant.** The Supabase writes are
  asserted against a mocked client. Confirming an app-authored add-on renders
  on a real storefront is a manual check.
- **Pre-existing rows are unaffected.** Products whose add-ons were previously
  saved from the app carry an empty `addons` column until they are re-saved.
  Opening and saving each affected product repairs it; no backfill migration
  was written.

## Merge Evidence

If these checkpoint commits are squashed, preserve:

| Stage | Commit | Evidence |
|-------|--------|----------|
| RED | `2d28661` test: add reproducers for mobile add-on authoring and legacy mirroring | 3 runtime failures in `products.test.ts` (payload had `modifier_groups` only); 2 compile-time `TS2305` failures for the missing exports |
| GREEN | `08e843e` feat: let merchants add add-ons in the app and mirror them to legacy columns | `npx jest` → 30 suites / 464 tests passed; `npx tsc --noEmit` clean |

No separate refactor commit: the implementation landed in its final shape
(`toMenuItemRow` extracted up front, `createAddonGroup` composed from
`createEmptyGroup`).
