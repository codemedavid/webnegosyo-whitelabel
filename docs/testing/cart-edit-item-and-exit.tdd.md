# TDD Evidence — Cart line-item editing + reliable exit

**Date:** 2026-07-22
**Source plan:** No `*.plan.md`; journeys derived from two customer feedback reports (Messenger).

## Customer feedback (root cause)

1. **"Pag bibili sila ng 2 items na magkaiba na flavor, di nila mapalitan yung isang flavor."**
   When two lines of the same product with different flavors are in the cart, there was
   **no way to change the flavor/variation of one line** — the cart only supported quantity
   change and remove. To fix a wrong flavor the customer had to delete and re-add.
2. **"Add some edit order sa cart... and exit button pag nasa cart kasi pag nag back, nababack the whole browser."**
   - (a) Same missing edit-in-cart capability.
   - (b) The cart header used `router.back()`, which exits the whole browser when the cart is
     the entry point (e.g. opened directly from a Messenger link with no in-app history).

Both flavor/edit complaints share one root cause: the cart had no edit-item affordance.

## User journeys

- As a customer with two same-product lines of different flavors, I want to change the flavor of
  just one line, so I don't have to delete and re-add it.
- As a customer, I want to edit an item's variation/add-ons/quantity/note directly from the cart.
- As a customer, I want a reliable "back" from the cart that returns me to the menu instead of
  closing the browser.

## Task report

### Pure cart logic (TDD — RED→GREEN)
- **Summary:** Added `makeCartItem` (shared cart-item builder) and `replaceCartItem` (immutable
  line replacement with sibling-safe edit + collision merge + max-qty clamp) in
  `src/lib/cart-utils.ts`. Refactored `useCart.addItem` to reuse `makeCartItem` (DRY) and added
  `useCart.updateItemConfiguration`.
- **RED:** `npx jest --config jest.config.cjs tests/unit/cart-item-edit.test.ts`
  → `TypeError: makeCartItem is not a function` (8 failed / 8) — failure caused by the missing
  implementation, test compiled and executed.
- **GREEN:** same command → **8 passed / 8**.
- **Guarantee:** Editing one line's flavor leaves sibling lines untouched (exact same reference);
  colliding edits merge quantities clamped to 99; unknown id is a no-op; order preserved; inputs
  never mutated.

### UI wiring (presentational)
- `ItemDetailModal` gained an `editItem` prop → seeds current selections, CTA reads "Update Cart".
  (Component was previously unused, so no add-flow risk.)
- `CartEditDialog` (shared, lazy-loaded) rendered in the cart page shell for **all** cart designs.
- `useCartView` exposes `itemToEdit`/`setItemToEdit`/`handleUpdateItem` and `exitToMenu`.
- Edit (pencil) button added to `CartItemRow` (modern/minimal/express/wizard) and `classic-cart`,
  shown only when the item has variations/variation types/add-ons.
- Back button in all 5 cart templates now calls `exitToMenu` (→ `/{tenant}/menu`) instead of
  `router.back()`.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | `makeCartItem` builds grouped-variation id + correct subtotal | `cart-item-edit.test.ts` | unit | PASS |
| 2 | `makeCartItem` builds legacy-variation id shape | `cart-item-edit.test.ts` | unit | PASS |
| 3 | Editing one line's flavor leaves the sibling line untouched | `cart-item-edit.test.ts` | unit | PASS |
| 4 | `replaceCartItem` does not mutate the input array | `cart-item-edit.test.ts` | unit | PASS |
| 5 | Colliding edit merges quantities | `cart-item-edit.test.ts` | unit | PASS |
| 6 | Merged quantity clamped to `MAX_CART_ITEM_QUANTITY` | `cart-item-edit.test.ts` | unit | PASS |
| 7 | Unknown id returns the array unchanged (same ref) | `cart-item-edit.test.ts` | unit | PASS |
| 8 | Replace preserves order in a multi-line cart | `cart-item-edit.test.ts` | unit | PASS |

## Verification

- `npx jest --config jest.config.cjs cart` → **98 passed / 98** (new + existing cart-utils suites;
  confirms the `addItem` refactor preserved behavior).
- `npx eslint` on all changed files → clean.
- `npx tsc --noEmit` → no errors in any changed source file (pre-existing unrelated test-file
  errors untouched).

## Known gaps / follow-ups

- The mini **cart drawer** (`cart-drawer.tsx`) was not given an edit button — the full cart page
  covers the reported flow; drawer editing is a possible follow-up.
- No component/E2E test for the modal wiring (presentational); the behavioral core is unit-tested.
