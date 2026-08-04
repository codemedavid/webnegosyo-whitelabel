# TDD evidence — voucher product & category pickers

## Source plan

No `*.plan.md`. Journeys were derived during this TDD run from a screenshot of
the voucher form showing an unclearable error: selecting **Chosen products**
raised _"Choose at least one product, or this code will never apply."_ while the
form itself said the pickers were not built.

## User journeys

1. As a merchant, I want to pick which products a discount code applies to, so
   that a scoped voucher is actually saveable.
2. As a merchant, I want to pick which categories a code applies to, for the
   same reason.
3. As a merchant with a long menu, I want to search the list, so that I do not
   scroll past a hundred items to find one.
4. As a merchant editing an old voucher, I want to be told when a saved target
   no longer exists, so that I am not left with a code that quietly discounts
   nothing.

## Task report

### 1. Selection logic (`src/lib/vouchers/target-picker.ts`)

Pure module converting menu items and categories into pickable options, plus
search, immutable toggling, and a selection summary that flags target ids with
no matching option.

- Command: `npx jest tests/unit/voucher-target-picker.test.ts`
- RED: `Cannot find module '@/lib/vouchers/target-picker'` — suite failed to
  load, 2 suites / 7 tests failing across both new files.
- GREEN: `Tests: 16 passed, 16 total`
- Guarantees: ids reach the engine unchanged; a product whose category was
  deleted still appears (ungrouped) rather than vanishing; search matches item
  name and category name case-insensitively; toggling never mutates the caller's
  array and never stores a duplicate; a saved-but-missing target is reported,
  not silently dropped.

### 2. Form wiring (`voucher-target-picker.tsx` + `voucher-form.tsx`)

Replaced the "pickers are not built yet" note with a searchable checkbox list
fed by `getMenuItemsAction` / `getCategoriesAction`.

- Command: `npx jest tests/unit/voucher-target-picker-wiring.test.tsx`
- RED (before implementation): 7 failed, including
  `expected document not to contain element, found <p …>Product and category
  pickers are not built yet …</p>`
- GREEN: `Tests: 9 passed, 9 total`
- Guarantees: the right action is called for the right scope; picked ids land in
  the saved draft's `targetIds`; the blocking error clears as soon as something
  is picked; changing scope discards the previous scope's ids (a category id in
  a product-scoped voucher matches nothing); search narrows the list; load
  failure and an empty menu each produce a plain-language message instead of a
  blank box.

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Products carry the id the engine matches on | `tests/unit/voucher-target-picker.test.ts:carries the id the engine matches on` | unit | PASS | `npx jest tests/unit/voucher-target-picker.test.ts` |
| 2 | A product whose category was deleted is still offered, ungrouped | `…:still offers a product whose category was deleted…` | unit | PASS | same |
| 3 | Search matches item name and category name, case-insensitively | `…:matches on the category name…` | unit | PASS | same |
| 4 | Toggling a target never mutates the caller's list and never duplicates | `…:leaves the original list untouched`, `…:never stores the same id twice` | unit | PASS | same |
| 5 | A saved target with no matching option is reported as missing | `…:flags a saved target that no longer exists on the menu` | unit | PASS | same |
| 6 | Choosing a product scope loads and lists the tenant's products | `tests/unit/voucher-target-picker-wiring.test.tsx:offers the tenant products…` | integration (RTL) | PASS | `npx jest tests/unit/voucher-target-picker-wiring.test.tsx` |
| 7 | Picked product ids are saved as `targetIds` | `…:saves the picked product ids as the voucher targets` | integration | PASS | same |
| 8 | The "never apply" error clears once a product is picked | `…:clears the error once a product is picked` | integration | PASS | same |
| 9 | Switching scope discards the previous scope's ids | `…:drops the previous scope ids when the scope changes` | integration | PASS | same |
| 10 | A failed load says so rather than showing an empty picker | `…:says so plainly when the products cannot be loaded` | integration | PASS | same |
| 11 | An empty menu points at the real problem | `…:points a merchant with an empty menu at the real problem` | integration | PASS | same |

## Coverage

```
npx jest tests/unit/voucher-target-picker.test.ts tests/unit/voucher-target-picker-wiring.test.tsx \
  --coverage --collectCoverageFrom="src/lib/vouchers/target-picker.ts" \
  --collectCoverageFrom="src/app/[tenant]/admin/vouchers/voucher-target-picker.tsx"

All files                    |   98.03 |    85.71 |     100 |   98.03 |
  voucher-target-picker.tsx  |   96.89 |    82.35 |     100 |   96.89 | 56,118-121
  target-picker.ts           |     100 |     90.9 |     100 |     100 | 47,61
```

Regression check: `npx jest tests/unit/vouchers tests/unit/voucher` → 22 suites,
267 tests, all passing. `npx tsc --noEmit` reports nothing for the touched
files; the pre-existing `tests/unit/api/vouchers-*.test.ts` type errors are
untouched by this change.

## Known gaps

- The picker has no E2E coverage — no Playwright suite exists for the admin
  voucher screen.
- A target id kept from a deleted item is preserved on save rather than pruned.
  That is deliberate: the item may be restored, and a voucher silently losing a
  target on an unrelated edit is worse than one that visibly discounts nothing.
  The picker warns about it.
- Branch (outlet) scoping already exists on the voucher model (`outletIds`) but
  still has no picker in this form. Out of scope for this fix.

## Merge evidence

RED checkpoint: `2cff8b9 test: add reproducer for the missing voucher product/category pickers`
GREEN checkpoint: `5442f24 feat: pick products and categories for a scoped voucher`
