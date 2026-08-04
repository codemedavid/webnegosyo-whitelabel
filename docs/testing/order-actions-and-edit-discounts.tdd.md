# TDD evidence — order-screen actions and discounts on placed orders

## Source plan

No `*.plan.md`. Journeys were derived during this TDD run from a screenshot of
the merchant app's order detail screen, plus three claims from the user: no
voucher attachment on the POS or in orders management, no "edit order" showing,
and no way to confirm payment.

### What the investigation actually found

Two of the three claims were about features that existed but were unreachable:

| Claim | Finding |
|---|---|
| No voucher attachment on the POS | `DiscountSheet` existed and worked, but `pos.tsx` passed `onAddDiscount={edit ? undefined : …}` — off in edit mode by design. |
| No "confirm payment" | `orders:recordPayment` existed on both backends but was called only from `pos-tender.tsx`. The order screen's `SettlementCard` was read-only. |
| No "edit order" showing | Working as designed. `canEnterEditMode` refuses while the register cart is non-empty, and that refusal was the grey text in the screenshot. The cart is not persisted, so it was a live sale. |

So claims 2 and 3 were one dead end: every action on a placed order routed
through the register, and when the register was busy the screen said so with no
way to act. Claim 1 was a separate, deliberate absence. The user chose to have
all three built.

## User journeys

1. As a cashier, when the register is busy and I cannot edit an order, I want to
   clear the register from the order screen, so that I am not sent hunting for a
   sale and back again.
2. As a cashier looking at "STILL OWING ₱149.00", I want to take ₱149.00, so
   that I do not have to rewrite an undisputed bill to record a payment.
3. As a cashier, I want to apply a voucher to an order that is already placed,
   so that a customer who produces a code after ordering does not need the order
   cancelled and re-rung.

## Task report

### 1. Escape hatch from the register-busy gate

`canEnterEditMode` now returns a `remedy` on refusals the reader can act on; the
order screen renders it as a confirmed "Clear the register and edit" button.

- Command: `npx jest lib/pos-edit-mode.test.ts`
- RED: `error TS2339: Property 'remedy' does not exist on type 'EditGate'` ×5 —
  compile-time RED, suite failed to run, `Tests: 0 total`.
- GREEN: `Tests: 31 passed, 31 total`
- Guarantees: the open-sale refusal carries an actionable remedy and a
  confirmation that says the sale will be discarded; refusals clearing cannot
  fix (started kitchen, missing permission, another branch) carry none; an
  allowed gate carries none.
- Checkpoints: RED `a213a64`, GREEN `af194ec`.

### 2. Collecting payment on a placed order

New pure module `lib/order-collect.ts` (gate + amount rule), new
`components/order/CollectPaymentSheet.tsx`, wired under the settlement card.

- Commands: `npx jest lib/order-collect.test.ts`,
  `npx jest components/order/CollectPaymentSheet.test.tsx`
- RED: `Cannot find module './order-collect'`; then
  `Cannot find module './CollectPaymentSheet'`.
- GREEN: `Tests: 22 passed, 22 total` and `Tests: 11 passed, 11 total`.
- Guarantees: nobody collects more than is owed; a negative is refused rather
  than treated as a refund (which has its own permission); collecting is refused
  on a cancelled order, against an unreadable ledger, on a backend with no write
  path, and for staff without `pos`; it IS allowed from `preparing` onwards,
  unlike editing, because most orders are paid at handover. On the sheet: the
  balance is pre-filled, the refusal is visible, an empty reference is omitted
  rather than sent blank, and a double tap submits once.
- Checkpoints: RED `fa22889` (rules) and `e080381` (sheet), GREEN `f5f115d`.

### 3. Discounting an order that is already placed

`editModeTotals` takes the edit's own discount lines; the store gained
`editTotals()` and an edit-aware `discountBasis()`; both register screens read
the store instead of computing the figure twice.

- Commands: `npx jest lib/pos-edit-mode.test.ts`,
  `npx jest stores/pos-edit-discount-journey.test.ts`
- RED: `error TS2554: Expected 2 arguments, but got 3` (lib);
  `error TS2339: Property 'editTotals' does not exist on type 'PosCartState'`
  (store).
- GREEN: `Tests: 46 passed, 46 total` (lib); `Tests: 9 passed, 9 total` (store).
- Guarantees: a code applied during an edit comes off the total and off the
  saved figure identically (`items + delivery + carriedChargesForSave ===
  newTotal`); the order's carried discount and the new one are capped as a pair
  so the total never goes negative; a code already on the order is ignored
  rather than counted twice; a free-delivery voucher is judged against the
  order's real delivery fee instead of a counter sale's zero; the code is
  cleared when the edit is abandoned and never prices onto the next counter
  sale.
- Checkpoints: RED `d91818d` (fold), `22e5feb` (store), `c41f12d` (burn rule); GREEN `6acb6ea`.

### 3b. A defect this work introduced, caught before shipping

Enabling discounts in edit mode created a way to give a single-use voucher away
forever: `burnPosRedemptions` was called only on the counter-sale path, so a
code applied during an edit priced into the bill and never incremented its usage
count. Fixed by exporting `newDiscountLines` and burning exactly those — the
order's own codes were burned when it was placed, and burning them again would
spend a second redemption on every later edit.

- RED: `error TS2305: Module '"./pos-edit-mode"' has no exported member 'newDiscountLines'`
- GREEN: `Tests: 46 passed, 46 total`

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | The register-busy refusal carries an action, not just advice | `lib/pos-edit-mode.test.ts:offers clearing the register as an action…` | unit | PASS | `npx jest lib/pos-edit-mode.test.ts` |
| 2 | Refusals clearing cannot fix carry no remedy | `…:offers no remedy for a refusal clearing the register cannot fix` | unit | PASS | same |
| 3 | Nobody may collect more than is owed | `lib/order-collect.test.ts:refuses more than is owed` | unit | PASS | `npx jest lib/order-collect.test.ts` |
| 4 | A refund cannot be taken as a negative collection | `…:refuses when money is owed back rather than owed` | unit | PASS | same |
| 5 | Collecting is refused against an unreadable ledger | `…:refuses when the payment ledger could not be loaded` | unit | PASS | same |
| 6 | Collecting needs the register permission, not just `orders` | `…:refuses staff who only move orders along` | unit | PASS | same |
| 7 | The sheet shows the refusal and does not submit | `components/order/CollectPaymentSheet.test.tsx:refuses more than is owed…` | component | PASS | `npx jest components/order/CollectPaymentSheet.test.tsx` |
| 8 | A double tap records one payment | `…:does not submit twice while the first is still in flight` | component | PASS | same |
| 9 | A code applied during an edit comes off the total | `lib/pos-edit-mode.test.ts:takes a newly applied discount off the total` | unit | PASS | `npx jest lib/pos-edit-mode.test.ts` |
| 10 | The total shown equals the total saved | `…:folds the new discount into the figure the revise mutation is sent` | unit | PASS | same |
| 11 | Two discounts cannot sum past the bill | `…:caps the pair at the bill rather than letting them sum past it` | unit | PASS | same |
| 12 | A code already on the order is not counted twice | `…:ignores a code the order is already discounted by` | unit | PASS | same |
| 13 | Only codes this edit added are burned | `…:leaves out a code the order already carried and already burned` | unit | PASS | same |
| 14 | A free-delivery code is judged against the order's real fee | `stores/pos-edit-discount-journey.test.ts:judges a free-delivery code…` | integration (store) | PASS | `npx jest stores/pos-edit-discount-journey.test.ts` |
| 15 | An edit's code never prices onto the next counter sale | `…:does not carry the code onto the next counter sale` | integration (store) | PASS | same |

## Coverage and known gaps

Full app suite: `npx jest --silent -w 2` → **158 suites, 2509 tests, all
passing**. `npx tsc --noEmit -p tsconfig.json` → clean.

Note on running the suite: a plain `npx jest` exited 137 with one suite reported
failed. That was an OOM-killed worker, not a test failure — re-running with
`-w 2` passes all 2509. Use `-w 2` on this machine.

Known gaps:

- **Nothing here has been exercised against a live tenant.** Both new screens
  (`app/(main)/order/[orderId].tsx`, `app/(main)/pos.tsx`) are outside Jest's
  roots in this app, so the wiring inside them — the collect button's placement,
  the remedy button's press handler, the discount sheet opening in edit mode —
  is verified only by the modules underneath it. The register-side money
  decisions were deliberately pushed into `lib/` and `stores/` for this reason.
- The `burnPosRedemptions` call on the edit-save path is screen code and is
  therefore untested; only its input rule (`newDiscountLines`) is covered.
- A collected payment cannot be undone from the order screen. Reversing one
  still needs the refund path in the register.
- `canCollectPayment` is a client-side gate. Convex mutations authenticate
  nowhere, so this is a UI guard, not a boundary — consistent with the rest of
  this app.

## Merge evidence

| Stage | Commit |
|---|---|
| RED — edit gate dead end | `a213a64` |
| GREEN — edit gate remedy | `af194ec` |
| RED — collect payment rules | `fa22889` |
| RED — collect payment sheet | `e080381` |
| GREEN — collect payment | `f5f115d` |
| RED — discount during an edit | `d91818d` (lib fold), `22e5feb` (store) |
| RED — burn only new codes | `c41f12d` |
| GREEN — discount a placed order | `6acb6ea` |
