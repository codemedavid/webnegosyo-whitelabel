# TDD evidence — add-on price dropped from order total

**Source plan:** none. Journeys derived during this TDD run from a merchant bug report
(Tagalog): *"May concern po ako sa coffee pag nag add ons po sila ng oat na may dagdag po
na 15, pero sa app po nawawala po yung add na 15 sa total price po."*
Screenshot: Cappuccino (16oz, Mild, Normal) + Add-ons: Oat Milk → line ₱110.00, Total ₱110.00
(should be ₱125.00).

## User journeys

1. As a customer, I want the add-on I selected (e.g. ₱15 Oat Milk) to be charged, so the
   price I saw at checkout is the price on my order.
2. As a merchant, I want the order in my admin app to show the full amount including
   add-ons, so I collect the right cash and my sales figures are correct.

## Root cause

Checkout built the per-unit order item `price` as **base price + variation modifiers only**,
while the cart's `subtotal` correctly included add-ons. The server then enforces its
anti-tampering invariant:

- `src/lib/orders-service.ts:436-447` — "Enforce that subtotal matches price × quantity";
  on mismatch it **overwrites** `item.subtotal = price × quantity`.
- `src/app/actions/orders.ts:301-305` — same clamp on the Convex path.
- The order total is then recomputed from those clamped subtotals
  (`orders-service.ts:449` `verifiedTotal`, and `createOrderConvex` `total: items.reduce(...)`).

So the add-on money was legitimately-looking "corrected" away. ₱110 + ₱15 = ₱125 submitted,
₱110 stored. Same defect existed in three more places:

| Site | Defect |
|---|---|
| `src/hooks/useCheckout.ts` (QR-handoff items) | price excluded add-ons |
| `src/hooks/useCheckout.ts` (DB order items) | price excluded add-ons |
| `mobile/app/(main)/checkout.tsx` (Convex + Supabase paths) | price excluded **both** variations and add-ons; add-on prices hard-coded to `0` in the Convex payload |
| `webnegosyo-desktop/.../pos/CheckoutDialog.tsx` | sent the bare menu price as the unit price (POS writes straight to Convex, so no money was lost, but the receipt/order-detail unit price was wrong) |

## Task report

| Task | Summary | Validation command | Result |
|---|---|---|---|
| RED reproducer | Added `tests/unit/order-item-unit-price.test.ts` asserting the unit price includes add-ons and that `subtotal === unitPrice × qty` (the exact invariant the server enforces) | `npx jest tests/unit/order-item-unit-price.test.ts` | **RED** — `TypeError: calculateCartItemUnitPrice is not a function`, 8/8 failed |
| GREEN fix | Added `calculateCartItemUnitPrice` to `src/lib/cart-utils.ts` (+ mobile port) and used it at every order-item construction site | `npx jest tests/unit/order-item-unit-price.test.ts` | **GREEN** — 8/8 passed |
| No regressions | Full unit suite | `npx jest` | 2071 passed, 3 failed — the 3 failures are pre-existing `webnegosyo-app` suite-load errors, confirmed identical on stashed working tree |
| Static checks | `npx tsc --noEmit` (no new errors under `src/` or `mobile/`), `npm run lint` (no new errors on touched files) | see commands | PASS |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A ₱110 item + ₱15 add-on has a per-unit price of ₱125 (the reported case) | `order-item-unit-price.test.ts:includes add-on prices in the per-unit price` | unit | PASS |
| 2 | Grouped variation modifiers and add-ons are summed together | `…:sums grouped variation modifiers and add-ons together` | unit | PASS |
| 3 | The legacy single-variation format is supported | `…:supports the legacy single-variation format` | unit | PASS |
| 4 | Base price is returned when nothing is selected | `…:returns the base price when there are no variations or add-ons` | unit | PASS |
| 5 | Free add-ons do not change the price | `…:ignores free add-ons in the price while keeping the base intact` | unit | PASS |
| 6 | Prices round to cents | `…:rounds to cents` | unit | PASS |
| 7 | The server clamp `subtotal = price × qty` preserves add-on money at qty 1 | `…:preserves add-on money when the server recomputes the subtotal (qty 1)` | unit | PASS |
| 8 | Same invariant holds for multi-quantity lines with variations + multiple add-ons | `…:preserves add-on money for multi-quantity lines with variations` | unit | PASS |

## Coverage

```
npx jest tests/unit/order-item-unit-price.test.ts tests/unit/cart-item-edit.test.ts \
  tests/unit/lib/cart-utils.test.ts --coverage --collectCoverageFrom='src/lib/cart-utils.ts'

 cart-utils.ts | 94.95 % stmts | 83 % branch | 87.5 % funcs | 94.95 % lines
```

Above the 80% threshold for the changed module.

## Known gaps / follow-ups

- **Existing orders are not repaired.** Orders already written with the clamped subtotal keep
  the wrong total; correcting historical rows would need a separate backfill and merchant sign-off.
- **Server-side hardening (deferred).** The clamp is still purely client-trusting for modifier
  money: it only checks `price >= DB base price`. A stronger check would re-derive the allowed
  maximum from the item's `modifier_groups` / `variation_types` / `addons` in the DB. Not done
  here to keep the money-loss fix small and reviewable.
- **Add-on prices in the web → Convex payload.** The web path sends `addons: string[]` (names
  only), so Convex stores each add-on with `price: 0` for display purposes. The line total is
  now correct; only the per-add-on breakdown in the merchant app is missing. Changing this means
  changing the shape written to the Supabase `order_items.addons` (`string[]`) column too.
- No E2E test was added; the failure is deterministic and fully covered at the unit level.

## Merge evidence (for squash)

- RED: `f272970 test: add reproducer for add-on price dropped from order total` — 8/8 failing.
- GREEN: `778efd2 fix: include add-on prices in the per-unit order item price` — 8/8 passing,
  full suite green apart from 3 pre-existing unrelated failures.
- No refactor commit needed; the fix replaced duplicated inline arithmetic with one shared helper.
