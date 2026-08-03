# TDD evidence — Vouchers Phase 7: discounts on the order surfaces

**Source plan**: inline plan from `/ecc:plan`, Phase 7.
**Depends on**: [Phase 6d](./vouchers-phase-6d-register-ui.tdd.md).

Before this phase, `readOrderDiscount` had exactly one caller in the entire
product: the printed receipt. Every screen a merchant uses to look at an order
ignored the discount.

## User journeys

1. As a merchant, I want an order's items to add up to what the customer was
   charged, or to see a row explaining why they do not.
2. As a merchant, I want to know which voucher was used on a sale.
3. As an owner, I want the admin dashboard and the merchant app to agree about
   the same order.

## The bug this found

`order-detail-dialog.tsx` did not merely omit the discount. It computed:

```tsx
Subtotal ({itemsCount} items) = Number(order.total) - Number(order.delivery_fee)
```

`order.total` is stored **net of the discount**. So on a discounted order the
row labelled "Subtotal" showed the *discounted* subtotal, sitting directly
beneath a list of items that summed to something larger, with nothing
accounting for the difference. The derivation was defensible before vouchers
existed and became wrong the moment they shipped.

The merchant app's order screen had the milder version of the same problem: it
listed items and jumped straight to `Total`.

## Task report

| Task | RED | GREEN |
|---|---|---|
| Order money rows as data (app) | compile-time: `Cannot find module './order-summary-rows'` | 11 passed |
| Order money rows as data (web) | `Cannot find module '@/lib/order-summary-rows'` | 11 passed |
| Receipt refactored onto the shared rules | `pos-money-wiring` failed | 1819 passed |

Merchant app: **1819 passed, 107 suites**, `tsc --noEmit` clean.
Web voucher + totals + parity suites: **268 passed, 23 suites**; `src/`
typechecks clean; ESLint clean on touched files.

## Where the rules now live

`orderSummaryRows` decides *which* rows appear; each renderer decides how they
look. The rules were not invented here — they were lifted out of
`receipt-formatter.ts`, where they already existed as string building, and the
receipt was refactored onto them so there is one copy rather than three.

| Surface | Renderer | Uses shared rules |
|---|---|---|
| Thermal receipt | `receipt-formatter.ts` | ✅ (refactored) |
| App order detail | `app/(main)/order/[orderId].tsx` | ✅ |
| Web admin dialog | `components/admin/order-detail-dialog.tsx` | ✅ |
| Web admin card | `components/admin/order-card.tsx` | ✅ |
| Web Convex sheet | `components/admin/convex-order-sheet.tsx` | ✅ |

The three web surfaces are pinned by
`tests/unit/order-surface-discount-wiring.test.ts`, the order-management twin of
the checkout guardrail. It also asserts that none of them derives a subtotal by
subtracting delivery from the total, which is the specific bug found above.

Web and app copies are locked **byte-identical** by
`tests/unit/vouchers/engine-parity.test.ts`, the same discipline the voucher
engine uses, and for the same reason: both surfaces describe one sale.

## Decisions the tests encode

- **A subtotal row appears only when something sits between the items and the
  total.** Otherwise it repeats a sum already on screen, and a discount would
  be read with no stated starting point.
- **Each discount gets its own row.** A merged "Discount: ₱50" cannot tell a
  customer which code did what.
- **A discount total the lines do not account for is still shown.** A
  free-delivery voucher has no line of its own; dropping it would leave rows
  that cannot be reconciled.
- **Amounts are magnitudes; the renderer owns the minus sign.** A screen and a
  thermal printer show a deduction differently.
- **The stored total is authoritative and always last** — it is what the
  customer actually paid, even if the parts no longer reconstruct it.
- **A corrupt line (NaN, negative) is dropped**, never rendered as a deduction
  that would read as the shop charging extra.
- **The receipt still prints `order.total` literally.** Routing it through the
  shared rows added indirection and hid the guarantee the money guardrail
  checks by name; the guardrail caught this and it was reverted rather than the
  guardrail relaxed.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A plain sale shows only a total | `order-summary-rows.test.ts:shows only a total` | unit | PASS ×2 |
| 2 | A subtotal appears once delivery or a discount sits between | `…:shows a subtotal once…` | unit | PASS ×4 |
| 3 | Every discount is named on its own row | `…:gives every discount its own row` | unit | PASS ×2 |
| 4 | An unaccounted discount is still reported | `…:reports a discount amount that no line accounts for` | unit | PASS ×2 |
| 5 | No phantom remainder row when lines already add up | `…:does not invent a remainder row` | unit | PASS ×2 |
| 6 | Corrupt lines never render as deductions | `…:ignores a corrupt discount line` | unit | PASS ×2 |
| 7 | The charged total is always last and authoritative | `…:always ends with the total that was actually charged` | unit | PASS ×2 |
| 8 | Both codebases' copies are byte-identical | `engine-parity.test.ts:keeps the order summary rows identical` | unit | PASS |
| 9 | The receipt still prints the backend total, not a computed one | `pos-money-wiring.test.ts` | unit | PASS |
| 10 | An undiscounted receipt is byte-for-byte unchanged | `receipt-formatter.test.ts` | unit | PASS ×18 |

## Known gaps

Phase 7 is **partially delivered**. What is done is the read path on the two
detail surfaces; what remains is listed honestly rather than implied complete:

- ~~**`order-card.tsx` and `convex-order-sheet.tsx` are not wired.**~~ **Done
  in a follow-up pass.** Both are now on the shared rules, and
  `tests/unit/order-surface-discount-wiring.test.ts` pins all three surfaces —
  a fourth added later has to make the same decision deliberately. On the
  Convex sheet the item lines above the total visibly failed to add up; on the
  card a voucher was simply invisible, leaving a merchant unable to tell a
  discount from a shortfall.
- ~~**Refund and void still work from the gross.**~~ **This claim was wrong and
  is retracted.** It came from the plan's assumptions, not from the code. The
  refund path routes through `computeBalance(newTotal, payments)` where
  `newTotal = revisedOrderTotal(items, deliveryFee, carriedCharges)` and
  `carriedCharges` is derived from `order.total` — which is stored **net of the
  discount**. Both sides of the balance are therefore discounted figures and
  the refund is already correct. There is also no separate void-refund path,
  and the web app has no refund logic at all (only refund *policy* text). No
  fix was needed and none was made.
- **The edit path is untouched.** `carriedCharges` still preserves a discount
  blindly through an edit. The open business question — what should happen to a
  voucher when an edit removes the item that qualified for it — remains
  unanswered and is a decision for the product owner, not a defect to fix
  silently.
- **No component test for either wired surface.** The app's jest roots exclude
  screens; the web dialog is testable in principle but was verified only by
  typecheck and lint here.

## Checkpoint commits

| Stage | Commit |
|---|---|
| RED — app order screens show no discount rows | `032818b` |
| GREEN — money rows as shared data | `9f9b9b0` |
| GREEN — app screen wired, receipt refactored | `749631b` |
| RED — web surfaces show no discount rows | `20fe3df` |
| GREEN — admin subtotal fixed, parity locked | `7b7c5e5` |
| RED — remaining two surfaces omit the discount | `17f377b` |
| GREEN — all three surfaces wired and pinned | `a753aeb` |
