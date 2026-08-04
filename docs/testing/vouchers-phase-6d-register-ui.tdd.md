# TDD evidence — Vouchers Phase 6d: discounting at the register, end to end

**Source plan**: inline plan from `/ecc:plan`, Phase 6d.
**Depends on**: [Phase 6c](./vouchers-phase-6c-redemption-burn.tdd.md).

6c built the burn but left it unreachable, and said so:

> **The burn is not yet reachable from the register.** `pos-tender.tsx` has no
> discount plumbing at all…

This phase connects it. A cashier can now take a code or give an open discount,
and the redemption is burned when the sale is tendered.

## User journeys

1. As a cashier, I want to type a customer's code and see the total drop.
2. As a cashier, I want to take money off for a damaged item, with a reason.
3. As an owner, I want a voucher's usage limit to hold at the counter.
4. As a cashier, I want a discount to disappear if I void the line that
   qualified for it, rather than charging a discount that no longer applies.
5. As an owner, I never want one customer's voucher to come off the next
   customer's sale.

## The testability constraint, stated plainly

The merchant app's jest `roots` are `lib/` and `theme/` **only**. No screen,
component or store is reachable by any test in either codebase. That is not a
choice made here; it is the existing configuration, and `pos-tender.tsx`'s stock
call has the same exposure.

The response was to put everything correctness-bearing in `lib/`, where TDD
applies, and leave the screens as thin consumers:

| Concern | Where it lives | Tested |
|---|---|---|
| Which vouchers are held, entry order, dedupe | `lib/pos-discount-session.ts` | 19 tests |
| Pricing vouchers + manual against the live cart | `lib/pos-discount-session.ts` | ✅ |
| Reaching the server | `lib/voucher-service.ts` | 10 tests (6c) |
| Holding session state, clearing with the cart | `stores/pos-cart-store.ts` | ❌ not reachable |
| Entry fields, buttons | `components/pos/DiscountSheet.tsx` | ❌ not reachable |
| Calling the burn after tender | `app/(main)/pos-tender.tsx` | ❌ not reachable |

## Task report

| Task | RED | GREEN |
|---|---|---|
| Register holds no discount state | compile-time: `Cannot find module './pos-discount-session'` | 19 passed |
| Guardrail caught duplicated money arithmetic | 1 failed (`pos-money-wiring`) | 1808 passed |

Merchant app: **1808 passed, 106 suites**, `tsc --noEmit` clean.
Web voucher + totals suites: **254 passed, 21 suites**.

## Decisions the tests encode

- **The session holds INPUTS, never a computed total.** Online, a cart change
  invalidates the preview and the browser re-asks the server. At the counter
  the engine is local, so a cart change simply RE-PRICES — there is no stale
  window and no "checking…" state in front of a queue. A voucher that stops
  qualifying when a line is voided stops applying immediately.
- **A percent voucher comes off the food, not the service charge.** The engine
  never reads `serviceCharge` when computing a percentage. This corrected an
  assumption made while writing the test, not the engine: it is byte-identical
  to web and covered by 254 web tests, so the register agreeing with it is the
  requirement.
- **A manual discount applies to what the vouchers left**, sequentially, the
  same way vouchers stack among themselves. Computed against the gross it would
  combine with a voucher to exceed what either rule allows.
- **The discount clears with the cart.** `reset` and `endEdit` both drop it. A
  voucher left held would come off the NEXT customer's sale — money given to
  someone who never presented a code.
- **The branch is read from the session, not passed by callers.** `totals()` is
  called from places with no reason to know about outlets, and a dropped branch
  would silently honour a voucher locked to another shop.
- **Adding the same code twice is a no-op**, so a cashier tapping Apply twice
  does not double the discount.
- **Discount lines render individually and removably**, not as one merged
  figure, so a cashier can say which code did what and undo the right one.
- **Discounting is offered on new sales only.** An edit carries the original
  discount forward as an opaque `carriedCharges` figure nobody can recompute.

## What the money guardrail caught

`lib/pos-money-wiring.test.ts` failed on the first GREEN attempt:

```
lib/pos-discount-session.ts:128
const chargeable = round2(subtotal + serviceCharge);
```

A second implementation of arithmetic `cartTotals` owns. It was a real defect —
two copies of the same sum drift — and it was fixed rather than exempted:
`chargeable` now comes from `cartTotals`. The guardrail did precisely the job it
was added for in 6a.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A held voucher is priced by the shared engine | `pos-discount-session.test.ts:prices a held voucher` | unit | PASS |
| 2 | The sale re-prices instead of using a remembered total | `…:re-prices against the current cart` | unit | PASS |
| 3 | A voucher that stops qualifying stops applying | `…:drops a voucher that stops qualifying` | unit | PASS |
| 4 | A refusal reason is available to tell the customer | `…:reports why a voucher was refused` | unit | PASS |
| 5 | A percentage comes off the food, not the service fee | `…:takes a percentage off the food` | unit | PASS |
| 6 | A manual discount applies to what vouchers left | `…:applies a manual discount to what the vouchers left` | unit | PASS |
| 7 | A discount never exceeds the sale | `…:never discounts more than the sale is worth` | unit | PASS |
| 8 | A branch-locked voucher is refused elsewhere | `…:carries the branch` | unit | PASS |
| 9 | The same code cannot be applied twice | `…:does not add the same code twice` | unit | PASS |
| 10 | Entry order survives, deciding solo-only conflicts | `…:keeps entry order` | unit | PASS |
| 11 | State is never mutated in place | `…:does not mutate the session it was given` | unit | PASS |
| 12 | Only permitted staff may discount manually | `…:refuses a discount the staff member may not give` | unit | PASS |
| 13 | No duplicated totals arithmetic anywhere in the app | `pos-money-wiring.test.ts` | unit | PASS |

## Known gaps

- **The wired path is not covered by any test.** The store, the sheet and the
  tender call are outside jest's roots. What is proven is that the logic they
  call is correct, and that the app typechecks — not that the buttons are
  connected. This needs a manual pass on a register before it is trusted.
- **No end-to-end test** of enter-code → tender → redemption burned. The pieces
  are proven individually and at their seams, never as a chain against a live
  database. This remains the most valuable missing test in the feature.
- **Offline sales still cannot burn**, unchanged from 6c and deliberate.
- **No product/category picker** for scoped vouchers — still SQL only.
- ~~**A voucher's usage limit is not checked at entry.**~~ **Overstated;
  corrected in Phase 7.** `eligibility.ts:93` does reject
  `usage_limit_reached`, so an exhausted code was never priced as a discount.
  The real defect was narrower and is now fixed: the register accepted any code
  that *existed*, and a code the engine then refused simply rendered no row —
  the engine's explanation was computed and discarded. See
  `pos-voucher-entry.ts`. What genuinely remains is a race: `usedCount` is a
  snapshot, so another till can exhaust a code between lookup and burn.

## Checkpoint commits

| Stage | Commit |
|---|---|
| RED — register holds no discount state | `203ce3c` |
| GREEN — discount session module | `cef15c0` |
| GREEN — store, UI and tender wiring (guardrail fix included) | `a4ca81e` |
