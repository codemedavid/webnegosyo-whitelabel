# TDD evidence — Vouchers Phase 7c: re-pricing a discount on edit

**Source plan**: inline plan from `/ecc:plan`, Phase 7, final item.
**Depends on**: [Phase 7b](./vouchers-phase-7b-voucher-entry-feedback.tdd.md).

The last open item was a business decision, not a defect. It has been made.

> **Owner's decision: the discount is RE-PRICED.** Remove the item a voucher
> qualified for and the discount goes with it.

## User journeys

1. As an owner, I do not want to keep giving a voucher discount after the item
   that earned it has been taken off the order.
2. As a customer, I do not want a discount I was legitimately given taken back
   because of an unrelated edit.
3. As a cashier, I want the register to keep working when the shop's connection
   does not.

## What is re-checked, and what is not

This is the distinction the decision turns on, and it is the reason "re-price"
is safe rather than punitive.

| Rule | Re-checked? | Why |
|---|---|---|
| Scope / matching items | **Yes** | Describes the order, and the order changed |
| Minimum spend | **Yes** | Same |
| Percentage basis | **Yes** | 10% of a smaller order is a smaller number |
| Expired | No | Validly used at the time of sale |
| Retired by the merchant | No | Same |
| Usage limit reached | No | Same |
| Voucher deleted entirely | No | Nothing to price it with; keep what was given |
| Manual discount | No | A person decided that amount; there is no rule |

Stripping a discount during an unrelated edit because the voucher expired last
week would re-bill a customer for money they were legitimately given, for a
reason nobody at the counter could explain.

## The double-count this had to avoid

`carriedCharges` is the residue of a placed bill — total minus items minus
delivery. Before this phase that residue **absorbed the discount**, which is
precisely why a discount used to survive an edit: it was baked into a number
nobody could decompose.

Re-pricing the discount separately means it has to come **out** of the residue,
or an edited order deducts it twice — once inside `carriedCharges`, once as a
line. `deriveCarriedCharges` now adds the recorded discount back.

An order with **no** recorded breakdown is deliberately unchanged: there the
negative residue is the only evidence a discount happened at all, so it stays
inside `carriedCharges` exactly as before. The existing test asserting `-20` for
such an order still passes untouched.

## Task report

| Task | RED | GREEN |
|---|---|---|
| Re-price against the edited cart | compile-time: `Cannot find module './pos-edit-discount'` | 12 passed |
| Stop double-counting in the residue | compile-time: `discountVouchers` not on `OrderEditContext` | 8 passed |

Merchant app: **1847 passed, 110 suites**, `tsc --noEmit` clean.
Web voucher + totals + parity suites: **257 passed, 21 suites**.

The money-wiring guardrail passes: `repriceEditDiscount` takes its chargeable
figure from `cartTotals` rather than re-adding subtotal and charge.

## A bug found while wiring

The `enterEditMode` call site built an order literal from named fields and
**omitted `customerData`** — where the discount breakdown rides on Convex. Every
edit would therefore have read "no discount" and charged the customer full
price, no matter how correct the re-pricing logic was. `EditableOrderLike` now
names the three fields that can carry a breakdown, so the omission is visible
at the type level rather than silent.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A voucher that still qualifies keeps its discount | `pos-edit-discount.test.ts:keeps a voucher that still qualifies` | unit | PASS |
| 2 | Removing the qualifying item removes the discount | `…:drops a voucher once the item it qualified for is removed` | unit | PASS |
| 3 | Falling below the minimum removes the discount | `…:drops a voucher once the edit falls below its minimum spend` | unit | PASS |
| 4 | A percentage re-prices against the smaller order | `…:re-prices a percentage against the smaller order` | unit | PASS |
| 5 | An expired or retired voucher keeps its discount | `…:keeps a voucher that has since expired` / `…retired` | unit | PASS ×2 |
| 6 | A voucher that no longer exists keeps its discount | `…:keeps a voucher that can no longer be found at all` | unit | PASS |
| 7 | An unreachable lookup carries the placed bill | `…:carries the whole discount forward when the vouchers could not be fetched` | unit | PASS |
| 8 | A manual discount always carries forward | `…:always carries a manual discount forward` | unit | PASS |
| 9 | A discount never exceeds the edited order | `…:never discounts more than the edited order is worth` | unit | PASS |
| 10 | The discount leaves the carried residue | `pos-edit-mode-discount.test.ts:takes the discount out of the carried residue` | unit | PASS |
| 11 | An order with no breakdown keeps its negative residue | `…:still preserves a negative residue when nothing was recorded` | unit | PASS |
| 12 | An edited order deducts its discount exactly once | `…:bills the discount once when the voucher still qualifies` | unit | PASS |
| 13 | Losing the discount produces a collectable balance | `…:asks the customer for the difference once the discount is lost` | unit | PASS |
| 14 | The bill as placed shows until the lookup returns | `…:keeps the discount while the vouchers are still unfetched` | unit | PASS |

## Known gaps

- **The wiring is untested**, as with all register screens: the store, the edit
  screen and the fetch are outside jest's roots. The re-pricing itself is
  proven; that the screen calls it is only typechecked. **This needs a manual
  pass on a real register**, specifically: edit a discounted order, remove the
  qualifying item, and confirm the total rises and the balance asks for the
  difference.
- **The re-priced discount is not re-persisted on save.** The revise mutation
  receives the new total via `serviceChargeAmount`, so the customer is charged
  correctly, but the stored `discount` blob still describes the ORIGINAL
  breakdown. A receipt reprinted after such an edit would show the old discount
  lines against the new total. This is the most significant remaining gap in
  the feature.
- **A redemption is not returned when a voucher is dropped by an edit.** The
  usage count stays spent even though the discount no longer applies. Arguably
  correct — the customer did use it — but it is a decision nobody has made
  explicitly.
- **No end-to-end test** of the full chain against a live database.

## Checkpoint commits

| Stage | Commit |
|---|---|
| RED — an edit carries a discount whose rule no longer holds | `0037e2c` |
| GREEN — re-price against the edited cart | `a8f0146` |
| RED — an edited order double-counts its discount | `c72771c` |
| GREEN — discount leaves the carried residue | `d48db93` |
| GREEN — vouchers fetched so the edit can re-price | `b7dd890` |
