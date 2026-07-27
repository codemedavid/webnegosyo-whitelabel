# TDD Evidence — Sale price ignored at checkout

**Source plan:** none. Journeys were derived during this TDD run from the bug report:
"When we have an item that is on sale, and we checked that out it doesn't show us
the sale price — we still checkout the original price."

## User journeys

1. As a customer, when I add an item that is on sale to my cart, I want the cart
   line to be priced at the sale price, so that I pay what the menu advertised.
2. As a customer, when my sale item has a size/flavor variation or add-ons, I want
   those modifiers added on top of the *sale* price, not the list price.
3. As a customer, when I edit a cart line so it merges with another line of the
   same sale item, I want the merged line still priced at the sale price.
4. As a merchant, when the order is written, I want the per-unit `price` on each
   order item to equal the sale-aware unit price, so `subtotal = price × quantity`
   holds and the order total matches what the customer saw.

## Root cause

`discounted_price` was honored by every *display* surface (all 13 card templates,
product detail, upsell cards, checkout-upsell running total) but by no *money*
path. `makeCartItem`, `replaceCartItem`'s merge, three subtotal recomputations in
`useCart`, and both order-item constructions in `useCheckout` all read
`menu_item.price`. The customer saw ₱150 and was charged ₱200.

## Task report

| Task | Summary | Validation command | Result |
|---|---|---|---|
| Reproduce | Added a unit reproducer covering effective-price resolution, cart line pricing, merge repricing, and order unit price | `npx jest tests/unit/discounted-price-checkout.test.ts` | **RED** — 8 failed, 1 passed (`getEffectiveItemPrice is not a function`; subtotal `400` vs expected `300`; merged subtotal `440` vs expected `340`) |
| Fix | Added `getEffectiveItemPrice()` to `src/lib/cart-utils.ts` and routed every money path through it | `npx jest tests/unit/discounted-price-checkout.test.ts` | **GREEN** — 9 passed |
| Regression | Ran the whole suite | `npx jest` | **PASS** — 216 suites, 2504 tests |

RED excerpt:

```
● per-unit order price for a discounted item › matches the cart subtotal divided by quantity
  TypeError: (0 , _cartutils.getEffectiveItemPrice) is not a function
● replaceCartItem with a discounted menu item › reprices a merged line at the sale price
  Expected: 340
  Received: 440
Tests: 8 failed, 1 passed, 9 total
```

GREEN excerpt:

```
Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total
```

Full-suite excerpt:

```
Test Suites: 216 passed, 216 total
Tests:       2504 passed, 2504 total
```

## Changes

- `src/lib/cart-utils.ts` — new `getEffectiveItemPrice(menuItem)`: returns
  `discounted_price` only when it is a positive number strictly below `price`
  (same rule the card templates use to decide whether to strike out a price),
  otherwise `price`. Used by `makeCartItem` and `replaceCartItem`'s merge branch.
- `src/hooks/useCart.tsx` — add-existing-line quantity bump, `updateQuantity`,
  and the background `refreshCartItems` reconciliation now reprice through it.
- `src/hooks/useCheckout.ts` — both order-item paths (QR `QrOrderItemV1` and the
  Messenger / `createOrderAction` snapshot) compute the per-unit price from it.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A sale price below list price is the effective price | `discounted-price-checkout.test.ts:returns the sale price when the item is on sale` | unit | PASS |
| 2 | No discount → list price | `…:returns the list price when no discount is set` | unit | PASS |
| 3 | A discount ≥ list price is ignored (no accidental price hike) | `…:ignores a discount that is not lower than the list price` | unit | PASS |
| 4 | Zero/negative discounts are ignored (no free items) | `…:ignores a zero or negative discount` | unit | PASS |
| 5 | Cart line subtotal uses the sale price × quantity | `…:prices the line at the sale price` | unit | PASS |
| 6 | Variation modifiers and add-ons stack on the sale price | `…:adds variation modifiers and add-ons on top of the sale price` | unit | PASS |
| 7 | Non-sale items are unaffected (zero regression) | `…:still uses the list price when the item is not on sale` | unit | PASS |
| 8 | Merged cart lines reprice at the sale price | `…:reprices a merged line at the sale price` | unit | PASS |
| 9 | Order per-unit price × quantity equals the cart subtotal | `…:matches the cart subtotal divided by quantity` | unit | PASS |

Evidence command for all nine: `npx jest tests/unit/discounted-price-checkout.test.ts`

## Coverage

`npx jest tests/unit/discounted-price-checkout.test.ts tests/unit/cart-item-edit.test.ts tests/unit/order-item-unit-price.test.ts tests/unit/lib/cart-utils.test.ts --coverage --collectCoverageFrom='src/lib/cart-utils.ts'`

```
File           | % Stmts | % Branch | % Funcs | % Lines
cart-utils.ts  |   94.89 |    83.65 |   83.33 |   94.89
```

Above the 80% threshold. Uncovered lines are Messenger URL builders unrelated to pricing.

## Known gaps

- `useCart` and `useCheckout` are covered indirectly (the shared pricing helper is
  unit-tested); no new hook-level test was added.
- Bundle pricing (`src/lib/bundle-pricing.ts`) uses its own per-slot prices and was
  not in scope for this bug.
- The mobile app (`mobile/stores/cart-store.ts`, `mobile/app/(main)/checkout.tsx`)
  and the desktop POS (`webnegosyo-desktop/.../cart-store.ts`) already priced on
  `discounted_price ?? price` and were left unchanged. Note their rule is looser
  than the web's — they honor a `discounted_price` even when it is *higher* than
  the list price. Not fixed here; flagged as follow-up.

## Merge evidence

Checkpoint commits on `feat/unified-modifier-groups` (other sessions interleaved
commits between them; both are reachable from HEAD):

- `9c901e1` — `test: add reproducer for sale price ignored at checkout` (RED validated)
- `bc8e36f` — `fix: charge the sale price for discounted items at checkout` (GREEN validated)

No refactor commit was needed — the fix introduced one helper and replaced six call sites.
