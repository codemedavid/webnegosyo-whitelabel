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
