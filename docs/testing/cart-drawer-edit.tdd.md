# TDD Evidence — Edit cart line items from the cart drawer

**Date:** 2026-07-25
**Branch:** `feat/unified-modifier-groups`
**Commits:** `5ce70ff` (RED) → `1c8826e` (GREEN)

## Source plan

No `*.plan.md`. Journeys derived during this TDD run from the request:
"allow editing the items on the cart … click on the items and manage/edit it for the customer side."

## Scoping (what was already done)

Investigation first, because most of this request was already shipped:

| Surface | Edit support before this change |
|---|---|
| Web cart page `/[tenant]/cart` (classic, modern, minimal, express, wizard) | ✅ shipped in `ab46c5b` |
| Web **cart drawer** (slide-out on the menu page) | ❌ none — only +/− and delete |
| Mobile customer app cart | ❌ none |

User selected **cart drawer only**. Mobile app and bundle-slot editing were
explicitly deferred and are NOT covered here.

## User journeys

1. As a customer, I want to fix a wrong flavor on a line already in my cart
   drawer, so that I don't have to delete the line and rebuild it from the menu.
2. As a customer with two lines of the same product in different flavors, I want
   editing one to leave the other untouched.
3. As a customer, I want to back out of an edit without changing my cart.

## Task report

**Execution summary:** Added a per-line pencil affordance to `cart-drawer.tsx`
that opens `ItemDetailModal` in edit mode seeded from that line, committing
through the existing `updateItemConfiguration` cart path (the same path the cart
page uses, so `makeCartItem`/`replaceCartItem` semantics are shared, not
duplicated).

**RED** — `npx jest tests/unit/cart-drawer-edit.test.tsx`

```
Tests:       5 failed, 5 total
● renders an edit affordance for every cart line
  TestingLibraryElementError: Unable to find an accessible element with the
  role "button" and name `/edit item/i`
```

Failure is for the intended reason: the drawer renders its line items ("Latte")
correctly but exposes no edit control. Not a setup/compile artifact.

**GREEN** — same command after implementation

```
✓ renders an edit affordance for every cart line (175 ms)
✓ opens the edit modal seeded from the line that was clicked (99 ms)
✓ commits the edit against the clicked line id, leaving the sibling line alone (107 ms)
✓ closes the edit modal after a successful commit (108 ms)
✓ closes the edit modal on cancel without changing the cart (81 ms)
Tests:       5 passed, 5 total
```

**Guaranteed by these tests:** the drawer routes edits through
`updateItemConfiguration` with the *clicked* line's cart-item id, never through
the blunt `updateQuantity`/`removeItem` paths, and the modal closes on both
commit and cancel.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Every cart line in the drawer exposes an edit control | `cart-drawer-edit.test.tsx:renders an edit affordance for every cart line` | component | PASS |
| 2 | The edit modal is seeded from the line that was clicked, not the first line | `…:opens the edit modal seeded from the line that was clicked` | component | PASS |
| 3 | The commit targets the clicked line's id; a same-product sibling line is untouched | `…:commits the edit against the clicked line id, leaving the sibling line alone` | component | PASS |
| 4 | The modal closes after a successful commit | `…:closes the edit modal after a successful commit` | component | PASS |
| 5 | Cancelling closes the modal and changes nothing | `…:closes the edit modal on cancel without changing the cart` | component | PASS |

## Incidental fix

`jest.setup.js` now polyfills `ResizeObserver`. jsdom ships none, but Radix
primitives (ScrollArea, Select, Popover) construct one on mount — previously any
test rendering them threw `ReferenceError: ResizeObserver is not defined`. This
unblocks Radix component tests repo-wide, not just this suite.

## Full-suite result

```
Test Suites: 2 failed, 171 passed, 173 total
Tests:       3 failed, 2099 passed, 2102 total
```

The 2 failing suites (`webnegosyo-app/lib/printer-native-load.test.ts`,
`webnegosyo-app/lib/order-item-images.test.ts`) are **pre-existing** — verified
by stashing all changes and re-running against a clean tree, which produced an
identical `2 failed, 3 tests failed` baseline. Neither is touched by this change.

`npx tsc --noEmit` → no type errors in changed files.
`next lint` on `cart-drawer.tsx` → no warnings or errors.

## Known gaps / deferred

- **Mobile customer app** (`mobile/`) still has no cart editing: `cart-store.ts`
  lacks `updateItemConfiguration`, `mobile/lib/cart-utils.ts` lacks
  `makeCartItem`/`replaceCartItem`, and `cart-item.tsx` has no edit affordance.
  Deferred by user choice; requires an EAS rebuild to reach customers.
- **Bundle line items** (`CartBundleItem` with slots) remain quantity/remove-only
  on every surface. Editing bundle slot selections is a separate feature.
- Coverage was verified by targeted suite + full-suite regression rather than a
  `--coverage` threshold run, since this change is UI wiring over already-tested
  cart primitives (`cart-item-edit.test.ts` covers `makeCartItem`/`replaceCartItem`).

## Note on concurrent activity

Another process was committing to this branch during the run (commits `9c403d9`,
`2da76f1`, plus working-tree changes to `cart-drawer.tsx`, `sheet.tsx`,
`menu-client.tsx` for a separate drawer back-control feature). Both of my
checkpoint commits are intact and my suite passes against both my exact commit
`1c8826e` and the current working tree. An unrelated pre-existing test,
`cart-drawer-close-affordance.test.tsx`, fails identically with and without my
change — it is that other feature's RED spec, not a regression from this work.
