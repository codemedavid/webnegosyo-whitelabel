# TDD evidence — modifier-groups rollout and legacy round-trip safety

**Date:** 2026-07-27
**Source plan:** none. Derived from "on the variation or grouped variation we
still don't have an option to add a multiple choices."

## Diagnosis

The multi-select feature shipped earlier that day was correct but unreachable:
**0 of 166 tenants had `modifier_groups_enabled = true`**, so every merchant
still landed on the legacy *Variation Types* editor, which has no multi-select.
Verified by query against the live database.

The user chose to enable the unified editor for all 166 tenants rather than
duplicate multi-select into the legacy editor.

## User journeys

1. As a merchant, I want an "Allow multiple / Min / Max" control when authoring
   options, so I can offer "pick any 2 of 4 toppings".
2. As a merchant with existing items, I want enabling the new editor to preserve
   everything I already configured.

## The defect the rollout would have caused

Turning the flag on makes the derive → split round-trip a **data migration**, not
a display concern: the admin editor seeds itself from
`normalizeModifierGroups(item)` (derived from the legacy columns) and on save
writes both `modifier_groups` and the `splitGroupsToLegacyColumns` mirror back to
the legacy columns.

`is_upgrade_target` — which drives the storefront "Upgrade for +X" nudge —
survived **neither** hop. The first time any merchant opened and saved an item,
that flag would have been silently destroyed, across all 166 tenants.

### RED

```
✕ preserves the upgrade-target flag that drives the upgrade nudge
✓ keeps a non-upgrade option free of the flag rather than defaulting it on
✓ preserves variation type identity, name and required flag
✓ preserves every option field the storefront renders
✓ preserves add-ons with their prices and defaults
✓ is stable across a second round-trip (idempotent migration)

Tests: 1 failed, 5 passed, 6 total
```

Commit `483e22c` (local) / `813d058` (main).

### GREEN

Added `is_upgrade_target` to `ModifierOption` and threaded it through
`groupFromVariationType` and `splitGroupsToLegacyColumns`.

```
Test Suites: 229 passed, 229 total
Tests:       2643 passed, 2643 total
```

Commit `cbb6cd6` (local) / `14e96e8` (main).

## Incident: main was broken by the previous push, and repaired

While verifying this change against `origin/main` I found `main` had **6 TS1005 /
TS1136 syntax errors** in `src/components/superadmin/tenant-form-wrapper.tsx`.

Cause: the earlier cherry-pick of the multi-select work onto `main` hit a
conflict in that file, and I resolved it with a script that kept only lines
mentioning `modifier_groups_enabled`. That shredded `ModifierGroupsFeatureSection`
into five orphaned JSX fragments. The component's type, state init, save payload
and call site all survived — only the definition was destroyed.

Verification of the regression window:

| Commit | `tsc --noEmit` errors under `src/` |
|---|---|
| `624e169` (before my push) | 0 |
| `f05e447` (my push) | 6 |
| `4b332ad` (repair) | 0 |

The build would have failed on Vercel. Repaired in `4b332ad`, confirmed by
re-running `tsc` against the fetched `origin/main`. ESLint clean on the file.

**Lesson:** never resolve a conflict with a token filter. The filter had no model
of JSX structure, and no test covered that component, so nothing caught it —
`tsc` did, but only because I re-verified against `origin/main` rather than
trusting my local tree.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | `is_upgrade_target` survives the legacy → groups → legacy round-trip | `modifier-groups-legacy-roundtrip.test.ts` | unit | PASS |
| 2 | A non-upgrade option is not given the flag by default | same | unit | PASS |
| 3 | Variation type id, name and required flag survive | same | unit | PASS |
| 4 | Every option field the storefront renders survives | same | unit | PASS |
| 5 | Add-ons keep prices and defaults | same | unit | PASS |
| 6 | The migration is idempotent across repeated saves | same | unit | PASS |

## Rollout

```sql
UPDATE tenants SET modifier_groups_enabled = true
WHERE modifier_groups_enabled IS DISTINCT FROM true;
-- total 166, enabled 166
```

Applied **after** the round-trip fix reached `main`, so no tenant could hit the
data loss.

Existing items are unaffected on the storefront until re-saved: the customer path
requires `item.modifier_groups` to be non-empty, and existing rows have `[]`. The
admin editor derives groups from the legacy columns on open, and saving writes
both representations.

## Known gaps

1. **The admin UI changes shape for every merchant at once.** The Variations +
   Add-ons sections are replaced by the unified Modifier Groups editor. This was
   the user's explicit choice over a staged rollout.
2. **No test covers `ModifierGroupsFeatureSection` rendering** — which is why the
   shredded component was caught by `tsc` rather than by the suite.
3. Cart/checkout/messenger still flatten multi-select group names; the cart-line
   editor has no reverse adapter; mobile has no modifier-group support. Carried
   over from `web-multi-select-modifier-groups.tdd.md`.
