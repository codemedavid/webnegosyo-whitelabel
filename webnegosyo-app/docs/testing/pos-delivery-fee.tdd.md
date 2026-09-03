# TDD Evidence — Manual delivery fee, address & phone on the POS

**Source plan**: inline `/plan` (2026-08-27) — manual delivery fee on the register (especially delivery order type), optional address/phone on the register, fee attach/edit in order management, analytics revenue including delivery fees.

## User journeys

1. As a cashier, I ring up a delivery at the counter and add a delivery fee, address, and phone — all optional — so the customer is billed the fee and the rider knows where to go.
2. As a cashier, I attach or correct the delivery fee on a placed order (Edit order → fee), so a phoned-in delivery taken after placement charges correctly.
3. As a merchant, my revenue figures include delivery fees. (Satisfied by construction: every revenue path sums `order.total`, and the fee is now inside `total`.)
4. As a customer with a free-delivery voucher, the register accepts it once the sale carries a fee.

## RED → GREEN cycles (webnegosyo-app, all on `main`)

| Cycle | RED commit | GREEN commit | RED evidence |
|---|---|---|---|
| Money path (cartTotals/store/buildPosOrder) | `5a8a767` | `20e2e6f` | `npx jest pos-delivery` — TS2339 `deliveryFee`/`setDelivery`/`delivery` missing, module `./pos-delivery` absent |
| UI wiring (sheet, totals row, tender) | `test: … delivery UI wiring` | `258a4ec` | mount guardrail: 5 failed / 1 passed |
| delivery_address column promotion | `test: … delivery_address promotion` | `b8f39aa` | TS2339 `delivery_address` not on `OrderInsert` |
| Edit-mode fee + revision persistence | `test: … editing a placed order's delivery fee` + store RED | `35b41a4` | TS2305 `withEditDeliveryFee`, TS2339 `OrderRevisionPatch.delivery_fee`, `setEditDeliveryFee` |
| Top-level deliveryAddress parity | `test: … top-level deliveryAddress` | `feat: emit deliveryAddress top-level…` | TS2339 `deliveryAddress` not on `PosOrderArgs` |

Parent repo (whitelabel): RED `5529b67` (5 failed), GREEN `61c9acb` — `npx jest order-revise-delivery-fee` → 5 passed; `convex:prebundle` rerun, `CURRENT_SCHEMA_VERSION` 20 → 21.

## What the passing tests guarantee

| # | Guarantee | Test | Result |
|---|---|---|---|
| 1 | `cartTotals` is the one place the fee joins the bill; discounts cap at the chargeable amount INCLUDING the fee | `lib/pos-delivery.test.ts` (cartTotals block) | PASS |
| 2 | Fee/address/phone are optional; a sale without them sends the byte-identical argument shape stale backends have always accepted | `lib/pos-delivery.test.ts` (omission tests) | PASS |
| 3 | A free-delivery voucher is rejected with no fee and prices to the fee once one is attached, through the REAL store | `stores/pos-delivery-journey.test.ts` | PASS |
| 4 | Delivery state cannot outlive its sale (reset/beginEdit/endEdit clear it) | journey + `lib/pos-delivery-mount.test.ts` | PASS |
| 5 | Cash tender must cover merchandise + fee | `buildPosOrder … rejects cash` | PASS |
| 6 | The delivery phone becomes the order contact only when no guest is attached | `lib/pos-delivery.test.ts` | PASS |
| 7 | A fee-only edit is dirty/saveable; carried charges untouched; revision persists `delivery_fee` beside the total it computed | `lib/pos-edit-delivery.test.ts` | PASS |
| 8 | Convex revise patches `deliveryFee` with omitted/zero/positive kept distinct | `../tests/unit/order-revise-delivery-fee.test.ts` | PASS |
| 9 | Blob address is promoted to the platform `delivery_address` column | `lib/backends/supabase-orders.test.ts` | PASS |
| 10 | UI wiring exists (sheet mounted, totals row, tender passes delivery) | `lib/pos-delivery-mount.test.ts` | PASS |

## Validation actually run

- `npm test` (webnegosyo-app): **200 suites / 2,914 tests passed**
- `npx tsc --noEmit`: clean
- `npm run lint`: 0 errors; 6 pre-existing warnings in untouched files
- Parent repo: `npx jest order-revise-delivery-fee convex-push-bundle convex-deploy` → 28 passed; `npm run convex:prebundle` regenerated the bundle

## Known gaps / intentional scope

- **Analytics needed no code change**: dashboard/trends/superadmin all sum `order.total`, which now carries the fee. Item-level product analytics exclude fees by construction (deliberate).
- **Convex deploy is a runtime step**: schema v21 must be pushed to tenants via Deploy Schema before Convex-backed stores persist revised fees; until then revise still works, only the breakdown field lags.
- **Web admin orders UI** deliberately out of scope (no order-amount editing exists there at all); fee attach lives in the app's Edit-order flow.
- Address/phone are not editable on a placed order (fee-only sheet in edit mode) — they live on the order, and the revision path does not rewrite `customerData` contact keys.
