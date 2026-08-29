# TDD Evidence — Naming the service charge and the edited delivery fee

**Source plan**: inline plan from `/ecc:plan` (this session), confirmed with "proceed". No `.plan.md` artifact.
**Checkpoints**: `6d293ea4` (RED) → `b6f6fe72` (GREEN). Both reachable from `main`.
**Result**: merchant app **3231/3231 passing**, 227 suites. Web receipt suites 56/56.

---

## The defect

The register computed a service charge from the order type, folded it into
`total`, and discarded the figure. No write path stored it:

- Convex `orders` had **no field at all**. `reviseOrder` accepted
  `serviceChargeAmount`, added it to the total, and persisted nothing.
- The platform `orders` table **did** have `service_charge_amount` (since
  `20250310000000_add_service_charge_to_order_types.sql`) and web checkout has
  always written it — but the merchant app neither wrote nor read it.

Everything downstream therefore showed items that did not add up to the bill,
with nothing to caption the difference. On edit, `deriveCarriedCharges`
reconstructed it by subtraction into a single anonymous residue that also
absorbs discounts and rounding — which is why it could not be labelled, and
what the merchant saw as *"an additional fee without knowing what it is"*.

The rendering layer was never the problem: `orderSummaryRows` has always
emitted a `Service charge` row and `RECEIPT_LABELS` has always had a caption
for it. Nothing passed the value, because nothing kept it.

## User journeys

1. As a cashier, I want the service charge named on the order screen, so a
   customer querying their bill gets an answer.
2. As a cashier editing an order, I want every peso on the sheet labelled, so
   attaching a delivery fee does not produce money I cannot explain.
3. As a merchant, I want the service charge on the printed receipt, so the chit
   reconciles to what I charged.
4. As a merchant designing a receipt layout, I want the preview to show the fee
   rows, so I do not discover their placement on a live chit.
5. As a merchant on a Convex deployment that has not been redeployed, I want my
   register to keep working exactly as before.

## Task report

| Task | Validation run | RED | GREEN |
|---|---|---|---|
| Register records the charge | `npx jest lib/pos-order.test.ts` | `TS2339: Property 'serviceCharge' does not exist on type 'PosOrderArgs'` | 30/30 |
| Convex stores it | `npx jest tests/unit/order-revise-service-charge.test.ts` | 8 failures + missing `revisedServiceChargePatch` | 9/9 |
| Platform stores + projects it | `npx jest lib/backends/supabase-orders.test.ts` | `TS2339` on `OrderInsert`/`OrderDto` | 45/45 |
| Edits persist it | `npx jest lib/backends/order-revise.test.ts` | `TS2339: 'service_charge_amount' does not exist on 'OrderRevisionPatch'` | 33/33 |
| Edit mode names it | `npx jest lib/pos-edit-mode.test.ts` | `TS2339: 'serviceCharge' does not exist on 'OrderEditContext'` | 58/58 |
| Sheet labels the remainder | `npx jest components/pos/CartSheet.test.tsx` | 2 failures — no `Adjustment` row rendered | 16/16 |
| Receipt prints it (app) | `npx jest lib/receipt-layout.test.ts` | 3 failures incl. `Subtotal mismatch: computed=327.50 vs order.total=360.25` | 31/31 |
| Receipt prints it (web mirror) | `npx jest tests/unit/receipt-layout.test.ts` | 2 failures | passing |
| Web admin mapper | `npx jest tests/unit/receipt-web.test.ts` | 2 failures — column dropped | passing |
| Editor preview sample | `npx jest tests/unit/receipt-editor-sample-order.test.ts` | 4 failures | 4/4 |
| Version gate | `npx jest lib/convex-service-charge-arg.test.ts` | `TS2307: Cannot find module` | 7/7 |

## Test specification

| # | What is guaranteed | Test | Result |
|---|---|---|---|
| 1 | The register sends the charge beside the total it is part of | `pos-order.test.ts:sends the charge alongside the total it is part of` | PASS |
| 2 | An order type charging none sends no key at all | `pos-order.test.ts:omits the field entirely…` | PASS |
| 3 | The charge is reported as levied, not net of discount | `pos-order.test.ts:reports the charge on the cart, not on the discounted bill` | PASS |
| 4 | An edit stores the named charge | `order-revise.test.ts:stores the named charge in the breakdown column` | PASS |
| 5 | **The total never follows the named charge** | `order-revise.test.ts:never totals from the named charge` | PASS |
| 6 | An old app build cannot blank a charge it never knew about | `order-revise.test.ts:leaves the stored charge alone when the caller sent none` | PASS |
| 7 | Convex patch mirrors the delivery-fee states exactly | `order-revise-service-charge.test.ts:revisedServiceChargePatch` (5 cases) | PASS |
| 8 | A negative service charge is refused, not credited | `order-revise-service-charge.test.ts:refuses a negative charge…` | PASS |
| 9 | The Convex total still comes from `serviceChargeAmount` alone | `order-revise-service-charge.test.ts:still totals from serviceChargeAmount alone` | PASS |
| 10 | The platform write stores it; NULL when unserviced | `supabase-orders.test.ts:writes the charge…` / `writes NULL rather than zero…` | PASS |
| 11 | Postgres numeric strings are coerced | `supabase-orders.test.ts:reads a numeric string…` | PASS |
| 12 | A known charge leaves the residue empty | `pos-edit-mode.test.ts:leaves nothing anonymous…` | PASS |
| 13 | A genuine remainder stays anonymous rather than mislabelled | `pos-edit-mode.test.ts:keeps a genuine remainder anonymous…` | PASS |
| 14 | **Naming the money does not move it** | `pos-edit-mode.test.ts:bills the same total as before the charge was ever named` | PASS |
| 15 | Legacy orders still recover the charge as residue | `pos-edit-mode.test.ts:still recovers the charge as residue…` | PASS |
| 16 | The mutation receives charge + residue as one figure | `pos-edit-mode.test.ts:sends the charge and the residue as one figure…` | PASS |
| 17 | Correcting delivery leaves the charge whole | `pos-edit-mode.test.ts:keeps the charge whole when the cashier corrects the delivery fee` | PASS |
| 18 | The sheet labels an unexplained remainder `Adjustment` | `CartSheet.test.tsx:labels an unattributable remainder rather than hiding it` | PASS |
| 19 | A negative remainder reads as a deduction | `CartSheet.test.tsx:shows a negative remainder as a deduction, not a charge` | PASS |
| 20 | The receipt prints the charge, captioned, with a subtotal | `receipt-layout.test.ts` (app + web) | PASS |
| 21 | The reconciliation warning stays silent on serviced orders | `receipt-layout.test.ts:reconciles, so the mismatch warning stays silent` | PASS |
| 22 | **Classic still prints byte-for-byte when there is no charge** | `receipt-layout.test.ts:still prints Classic byte-for-byte…` | PASS |
| 23 | The web admin's receipt maps the column it always had | `receipt-web.test.ts` (3 cases) | PASS |
| 24 | The editor preview shows both fee rows and reconciles | `receipt-editor-sample-order.test.ts` (4 cases) | PASS |
| 25 | A pre-v23 deployment is never sent the field | `convex-service-charge-arg.test.ts:withholds it from a deployment that would reject it` | PASS |
| 26 | An unrecorded schema version counts as too old | `convex-service-charge-arg.test.ts:treats an unrecorded version as too old` | PASS |

## The invariant that matters most

`serviceChargeAmount` remains the **single money channel**. The named
`serviceCharge` is a record stored beside a total it does not contribute to —
the same arrangement `discount_data` already uses. Guarantees **5**, **9** and
**14** exist specifically to stop a future change from adding both, which would
bill every edited customer for service twice.

## Verification

```
npx jest                                   # webnegosyo-app: 227 suites, 3231/3231
npx tsc --noEmit -p webnegosyo-app/tsconfig.json   # clean
npm run lint                               # no findings in any file changed here
```

Web `tsc --noEmit` and `npm run lint` report pre-existing failures in unrelated
files (integration test fixtures, branding test fixtures, a vendored bundle).
None are in files this change touched — verified by grep over the output.

## Known gaps and follow-ups

1. **Not deployed.** Convex tenants must reach **v23** before the field is sent
   at all. `CURRENT_SCHEMA_VERSION` is now 24 (a concurrent session added
   prep-time as v24 in the same window); one bulk deploy covers both. Until
   then `convexServiceChargeArg` withholds the argument and behaviour is
   unchanged — this is by design, not a regression.
2. **No back-fill.** Historical orders keep showing `Adjustment` rather than a
   named charge. The figure is not reliably recoverable: the order type's rate
   may have changed since, and the residue also holds discounts and rounding.
   Guessing would print a number the shop never charged. Flagged to the user at
   plan time and accepted.
3. **Desktop POS not covered.** `webnegosyo-desktop` has its own register and
   was outside the requested scope; it does not yet send `serviceCharge`.
4. **Concurrent-session note.** Two other sessions were editing this tree.
   `webnegosyo-app/lib/backends/order-revise.ts` — including this change's edits
   to it — was swept into commit `e76673ef` by another session's `git add`
   against the shared index. The code is present and tested; only the commit
   attribution is muddled. This change's own GREEN commit `b6f6fe72` was made
   with a pathspec-limited `git commit -- <paths>` to avoid doing the same to
   them. One unrelated one-line fix (`ReviseOrderItem` gaining the legacy
   `variation` / bundle fields, which `toItemRow` already wrote) was made here
   because it blocked compilation of a shared test file; another session landed
   the same fix moments later.

## Merge evidence

RED `6d293ea4` → GREEN `b6f6fe72`. If squashed, the RED/GREEN mapping above is
the record. No refactor commit was needed: the implementation landed in the
shape the tests specified.
