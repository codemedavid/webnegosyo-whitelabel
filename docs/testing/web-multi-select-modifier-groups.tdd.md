# TDD evidence — multi-select modifier groups on the web (min/max picks)

**Date:** 2026-07-27
**Branch:** `feat/platform-supabase-order-parity`
**Source plan:** none. Journeys were derived during this TDD run from the request
"the multiple option variation is not on the web — we want customers to choose
multiple options at once with maximum and min pick."

## Starting state

The unified modifier-groups model was **already fully implemented** — DB columns,
normalizer, selection adapter, React hook, storefront selector, admin editor,
library, and 35+ unit tests — and both migrations were applied. It was
nevertheless invisible to every customer on the web. Four independent gaps:

1. **Read path (item):** neither storefront menu-item query selected
   `modifier_groups`, so `useModifierGroups().active` was permanently `false`.
2. **Read path (flag):** neither tenant projection selected
   `modifier_groups_enabled`, so the gate resolved to `undefined` → `false`.
3. **Enable path:** no superadmin control existed to turn the flag on at all.
4. **Authoring:** the editor only offered a Required checkbox, which pins
   `min_select` to 0 or 1 — "choose at least 2" was unauthorable on web.
5. **Presentation:** the selector rendered single- and multi-select identically
   and showed no count rule, so min/max surfaced only as an add-to-cart toast.

Gaps 1 and 2 are the same silent-fallback class as the hero-color drift already
pinned by `tests/unit/tenant-storefront-select.test.ts`.

## User journeys

1. As a customer, I want to pick several options from one group at once, so I can
   build e.g. a 3-topping pizza in a single step.
2. As a customer, I want to see how many I must and may pick *before* I submit,
   so I am not corrected by an error after pressing Add to Cart.
3. As a customer, I want the options I cannot pick to be visibly unavailable once
   I hit the cap, while still being able to swap one out.
4. As a merchant, I want to author "choose at least 2, up to 3" for a group.
5. As a platform operator, I want to enable this per tenant, with existing
   legacy items unaffected while it is off.

## Task report

| Plan task | Execution | Validation command | Result |
|---|---|---|---|
| Pin the two dropped projections | Extracted `MENU_ITEM_DETAIL_SELECT` / `MENU_ITEM_LIST_SELECT`; added `modifier_groups` to both and `modifier_groups_enabled` to both tenant projections | `npx jest tests/unit/modifier-groups-storefront-projection.test.ts` | RED → GREEN |
| Customer-visible rule wording | Added `describeSelectionRule` / `isSelectionAtMax` to `modifier-groups.ts` | `npx jest tests/unit/modifier-selection-rule.test.ts` | RED → GREEN |
| Authorable minimum | Added `setGroupMinSelect` / `setGroupMaxSelect`, each keeping `min <= max` | `npx jest tests/unit/modifier-groups-min-select.test.ts` | RED → GREEN |
| Selector affordances | Rule text, live progress, `data-select-mode`, cap-disabling | `npx jest tests/unit/modifier-groups-selector.test.tsx` | RED → GREEN |
| Bounded multi-select journey | Characterization tests through the React seam | `npx jest tests/unit/hooks/useModifierGroups.test.ts` | GREEN on first run (see caveat) |
| Superadmin enable path | New Modifier Groups toggle wired through `tenants-service` schema + both save paths | `npx tsc --noEmit` (src/ clean) | GREEN |

### RED evidence

```
Test Suites: 4 failed, 4 total
Tests:       26 failed, 11 passed, 37 total

● Cannot find module '../../src/lib/queries/menu-item-select'
● describeSelectionRule is not a function
● setGroupMinSelect is not a function
● expect(element).toBeDisabled() — Received element is not disabled: <button aria-pressed="false" ...>
```

Committed as `59b5a80 test: add reproducer for web multi-select modifier groups with min/max picks`.

### GREEN evidence

```
Test Suites: 228 passed, 228 total
Tests:       2630 passed, 2630 total
```

Committed as `0639813 feat: multi-select modifier groups with min/max picks on the web storefront`.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Both tenant projections select `modifier_groups_enabled`, so the gate can open | `modifier-groups-storefront-projection.test.ts` | unit | PASS |
| 2 | Both menu-item projections select `modifier_groups`, so the hook can activate | `modifier-groups-storefront-projection.test.ts` | unit | PASS |
| 3 | Both projections still select the legacy variation columns the fallback path reads | `modifier-groups-storefront-projection.test.ts` | unit | PASS |
| 4 | Rule wording is exact for all six min/max shapes (any, up to N, 1, exactly N, N to M, at least N) | `modifier-selection-rule.test.ts` | unit | PASS |
| 5 | A single-select group is never reported "at max", so the first pick is not a trap | `modifier-selection-rule.test.ts` | unit | PASS |
| 6 | Raising the minimum past the cap raises the cap, never producing an unsatisfiable group | `modifier-groups-min-select.test.ts` | unit | PASS |
| 7 | Lowering the cap below the minimum lowers the minimum, same invariant from the other side | `modifier-groups-min-select.test.ts` | unit | PASS |
| 8 | Both setters return new objects and never mutate the input group | `modifier-groups-min-select.test.ts` | unit | PASS |
| 9 | The storefront shows the count rule before submission | `modifier-groups-selector.test.tsx` | unit | PASS |
| 10 | The storefront shows remaining-to-minimum and selected-of-cap progress | `modifier-groups-selector.test.tsx` | unit | PASS |
| 11 | Unselected options are disabled at the cap; selected ones stay clickable to swap | `modifier-groups-selector.test.tsx` | unit | PASS |
| 12 | Single-select chips keep exclusive-choice semantics and stay swappable | `modifier-groups-selector.test.tsx` | unit | PASS |
| 13 | Add-to-cart is blocked until the minimum is met, naming the group | `hooks/useModifierGroups.test.ts` | unit | PASS |
| 14 | Picks accumulate (not replace) and price together | `hooks/useModifierGroups.test.ts` | unit | PASS |
| 15 | A pick past the cap is refused; removing one frees a slot | `hooks/useModifierGroups.test.ts` | unit | PASS |
| 16 | Every multi-select pick reaches the cart as a priced add-on, never collapsing into the single-variation slot | `hooks/useModifierGroups.test.ts` | unit | PASS |

## Coverage

```
File                           | % Stmts | % Branch | % Funcs | % Lines
modifier-groups-selector.tsx   |     100 |    97.05 |     100 |     100
useModifierGroups.ts           |     100 |      100 |     100 |     100
modifier-groups-cart.ts        |     100 |    97.91 |     100 |     100
modifier-groups-form.ts        |     100 |     90.9 |     100 |     100
modifier-groups.ts             |     100 |    98.33 |     100 |     100
menu-item-select.ts            |     100 |      100 |     100 |     100
All files                      |     100 |     96.90 |     100 |     100
```

Above the 80% threshold on every metric.

## Deviations and honest caveats

- **One test expectation was rewritten after RED.** The first draft asserted
  multi-select chips expose `role="checkbox"` / `aria-checked`. That is invalid
  ARIA (`aria-checked` is not supported on `role="button"`), and switching the
  role would have broken every existing chip query. The contract was corrected to
  `data-select-mode` + the already-valid `aria-pressed`, plus a visible checkbox
  glyph. The test was changed to match the corrected contract, not to dodge a
  failure.
- **The 7 bounded-multi-select hook tests passed on first run.** They are
  characterization tests, not RED-first: they cover adapter behavior that already
  existed and was merely unreachable. They are reported as PASS, not as RED→GREEN.
- **Live-database verification, not just migrations.** Adding a column to a
  storefront projection 404s every storefront if the column is absent (see the
  prior `storefront-select-migration-drift` incident). Both `tenants.modifier_groups_enabled`
  and `menu_items.modifier_groups` were confirmed present in the live database via
  `information_schema.columns` before the projection change was committed.

## Known gaps (not addressed — out of scope of this change)

1. **Cart/checkout/messenger flatten group names.** `mapSelectionToCartFormat`
   projects multi-select picks into `selected_addons`, so downstream surfaces
   render one unlabeled "Add-ons:" list. Prices and totals are correct; only the
   group heading is lost.
2. **The cart-line editor is not modifier-groups aware.** `item-detail-modal.tsx`
   re-seeds from `selected_addons`; there is no reverse `cartFormat → ModifierSelection`
   adapter, so editing a line falls back to the legacy add-on list.
3. **No render-level test of `product-detail-content` in the `useGroups` branch.**
   The branch is covered at the hook and selector layers, and the wiring is
   typechecked, but the composed page is not asserted end to end.
4. **Mobile apps have no modifier-group support.** `mobile/` is entirely legacy
   variations/add-ons; this change is web-only, as requested.
5. **No E2E test.** No Playwright journey exercises a live storefront pick.
