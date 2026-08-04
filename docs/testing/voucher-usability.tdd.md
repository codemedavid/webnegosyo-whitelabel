# TDD evidence — making a created voucher usable

## Source plan

No `*.plan.md`. Derived from a merchant report: *"we can create a voucher but
not use it — the views or the UI doesn't exist"*, naming the POS, the web
checkout, and orders management in the merchant app.

## What the investigation found

The report was right in effect and wrong about the cause — four surfaces, four
different reasons:

| Surface | Finding |
|---|---|
| Merchant POS | Built and working, but `+ Add discount` rendered only inside the **expanded** cart, and the sheet opens collapsed. Undiscoverable. |
| Web checkout | Built, on `main` (`9dc795e`), inside `OrderSummaryLines` which all five templates render, **no feature flag**. Nothing to build — if it is missing live, that is a stale deploy. |
| Customer mobile app (`mobile/`) | Genuinely absent. Zero matches for `voucher` across `app`, `lib`, `stores`, `components`. |
| Merchant orders management | Shows a discount amount, but never *which* voucher — and a placed order could not be discounted at all. |

## User journeys

1. As a cashier, I want to find the discount entry without knowing to expand the
   cart, so that a customer holding a code does not wait while I hunt for it.
2. As a merchant, I want an order's discount rows to say which voucher produced
   them, so that I can reconcile a day's takings and answer a dispute.
3. As a merchant, I want an order's stored discount to match its total after an
   edit, so that the rows on screen add up to the bill.

## Task report

### 1. POS discoverability

The discount entry now sits on the collapsed cart bar, and an applied discount
shows there too.

- Command: `npx jest components/pos/CartSheet.test.tsx`
- RED: `Tests: 3 failed, 8 passed, 11 total` — runtime RED; the affordance did
  not exist on the collapsed bar.
- GREEN: `Tests: 11 passed, 11 total`
- Guarantees: the entry is reachable without expanding; pressing it opens the
  same sheet; it is absent on an empty register and absent when the caller
  offers no discounting; an applied discount is visible while collapsed.
- Checkpoints: RED (`test: add reproducer for the undiscoverable POS discount entry`), GREEN `3906ed2`.

### 2. Recording the discount an edit settles on

`reviseOrder` had one channel for everything that is neither a line item nor
delivery: `serviceChargeAmount`. That made the total right but never updated the
stored discount payload, so an edit that re-priced a voucher — or applied a new
one — left the order showing its **original** rows beside a total those rows no
longer add up to.

**This was a gap in the edit-mode discounting shipped earlier on this branch
(`6acb6ea`).** The total was correct and the redemption was burned; nothing
recorded which voucher did it. The earlier tests asserted the total identity,
which holds, and did not assert the stored payload, which is where the gap was.

- Commands: `npx jest lib/backends/order-revise.test.ts`,
  `npx jest --config jest.config.cjs convex-template/convex/orderRevise.test.ts`,
  `npx jest lib/pos-edit-mode.test.ts`
- RED: `Property 'discount' does not exist in type 'Partial<ReviseOrderArgs>'`
  (platform); `TypeError: mergeOrderDiscount is not a function` ×6 (Convex);
  `Property 'settledDiscount' does not exist on type 'EditModeTotals'` (register).
- GREEN: `27 passed` / `39 passed` / `51 passed`.
- Guarantees: three states stay distinct — omitted leaves the stored discount
  alone (most edits never touch it), a payload replaces it, `null` clears it
  when re-pricing dropped every line. The total is still computed from
  `serviceChargeAmount`, never from the payload, so the discount is not deducted
  twice. On Convex — which has no discount column — `mergeOrderDiscount`
  replaces one key of `customerData` and copies the rest through, so a
  discounted edit cannot erase the customer's name and contact.
- Checkpoints: three RED commits, GREEN `0157478`.

### 3. Naming the voucher on a discount row

- Command: `npx jest lib/order-summary-rows.test.ts`
- RED: `Property 'code' does not exist on type 'OrderSummaryRow'`
- GREEN: `Tests: 18 passed, 18 total`
- Guarantees: a voucher row carries its code; a cashier's open discount and the
  unaccounted remainder carry none, because neither belongs to a voucher.
- Checkpoint: RED (`test: add reproducer for naming the voucher on a discount row`), GREEN `8059718`.

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | The discount entry is reachable without expanding the cart | `components/pos/CartSheet.test.tsx:offers a discount without making the cashier expand the cart first` | component | PASS | `npx jest components/pos/CartSheet.test.tsx` |
| 2 | An applied discount is visible on the collapsed bar | `…:shows an applied discount on the collapsed bar` | component | PASS | same |
| 3 | The entry is absent when the caller offers no discounting | `…:hides the affordance when the caller offers no discounting` | component | PASS | same |
| 4 | An edit that settles a discount records it on the order | `lib/backends/order-revise.test.ts:writes the settled discount onto the order` | unit | PASS | `npx jest lib/backends/order-revise.test.ts` |
| 5 | An edit that touches no discount leaves the stored one alone | `…:leaves the stored discount alone when the edit did not settle one` | unit | PASS | same |
| 6 | Removing the last code clears the stored discount | `…:clears the stored discount when the edit settled on none` | unit | PASS | same |
| 7 | The payload is a record, not a second deduction | `…:still totals from serviceChargeAmount, not from the payload` | unit | PASS | same |
| 8 | A discounted edit cannot erase the customer's own details | `convex-template/convex/orderRevise.test.ts:keeps every other customer field untouched` | unit | PASS | `npx jest --config jest.config.cjs convex-template` |
| 9 | Settling on no discount drops the key rather than zeroing it | `…:drops the discount key entirely when the edit settled on none` | unit | PASS | same |
| 10 | Stored rows reconcile to the stored total | `lib/pos-edit-mode.test.ts:stores a total that matches what came off the bill` | unit | PASS | `npx jest lib/pos-edit-mode.test.ts` |
| 11 | An ordinary edit writes no discount key at all | `…:reports nothing to store when the order never had a discount and none was added` | unit | PASS | same |
| 12 | A discount row names its voucher | `lib/order-summary-rows.test.ts:carries the code alongside the label` | unit | PASS | `npx jest lib/order-summary-rows.test.ts` |
| 13 | An open discount and the remainder carry no code | `…:leaves the code off a cashier's open discount, which has none` | unit | PASS | same |

## Coverage and known gaps

- `npx jest --silent -w 2` (merchant app) → **160 suites, 2536 tests, all passing**
- `npx jest --config jest.config.cjs convex-template` → **62 tests passing**
- `npx tsc --noEmit -p tsconfig.json` → clean

Known gaps — all significant:

- **The Convex change is not deployed.** `reviseOrder` now accepts a `discount`
  argument, but every tenant on Convex runs its own deployed bundle. Until each
  is redeployed, the argument is dropped and the stored payload stays stale on
  those tenants. The platform-backend path works immediately.
- **Nothing here has run against a live tenant.**
- **Two of the five requested items are NOT built:** vouchers in the customer
  mobile app (`mobile/` — a complete absence, the largest of the five), and
  applying a voucher directly in orders management for a cash customer. The
  second was blocked on exactly the write channel this work adds, so it is now
  unblocked but not started.
- The web checkout was diagnosed, not changed. If "Have a voucher?" is missing
  on the live storefront, check that tenant's deploy — the code is on `main`.

## Merge evidence

| Stage | Commit |
|---|---|
| RED — undiscoverable POS discount | `test: add reproducer for the undiscoverable POS discount entry` |
| GREEN — POS discoverability | `3906ed2` |
| RED — edit never records its discount (platform) | `test: add reproducer for an edit that never records its settled discount` |
| RED — Convex customerData merge | `test: add reproducer for merging a settled discount into Convex customerData` |
| RED — register reports settled discount | `test: add reproducer for an edit reporting the discount it settled on` |
| GREEN — discount recorded on both backends | `0157478` |
| RED — voucher not named on a row | `test: add reproducer for naming the voucher on a discount row` |
| GREEN — voucher named | `8059718` |
