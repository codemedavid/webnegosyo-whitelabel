# TDD evidence — Order editing (POS mode) + payment ledger

**Source plan**: produced inline in-session (`/ecc:plan`), not written to a `.plan.md` file.
**Scope confirmed with the user**: merchant mobile app only · platform Supabase + Convex backends · ledger-based settlement.
**Status**: Phases 1–3 complete. Phase 4 partially complete — the session logic and drawer reconciliation are done and tested; the screens themselves are not built.

## User journeys

1. As a cashier, I want to open a placed order and change its items, so that I can correct a customer's bill without cancelling and re-ringing the whole order.
2. As a cashier, when an edit raises the total on an order already paid by GCash, I want to collect the difference by any method, so that the customer is not forced to re-pay the whole bill.
3. As a cashier, when an edit lowers the total on a paid order, I want to record a refund with a reference and proof, so that the money returned is accounted for.
4. As a cashier editing a cash order, I want the drawer total to stay correct, so that my shift reconciles.
5. As a merchant, I want to see who edited an order, what changed, and what was collected or returned, so that an edited bill is defensible weeks later.
6. As an owner, I want refund rights granted separately from edit rights, so that not every staff member can move money out of the drawer.

## Task report

### Task 1 — Money math (`lib/order-balance.ts`)

Single home for the collect/refund/settled judgement, so no screen re-derives it.

- **RED**: `npx jest lib/order-balance.test.ts` → `TS2307: Cannot find module './order-balance'`. Suite failed to run; 0 tests.
- **GREEN**: `npx jest lib/order-balance.test.ts lib/order-edit-cart.test.ts` → `Tests: 32 passed`.
- **Guaranteed**: charges and refunds net correctly including float drift (`0.1 + 0.2` → `0.3`); an over-refund reports negative rather than being clamped; a single bad row (`NaN`) does not poison the total; sub-centavo balances read as settled so a cashier is never asked to collect ₱0.004, while ₱0.01 still reads as collect.

### Task 2 — Cart hydration round-trip (`lib/order-edit-cart.ts`)

The riskiest translation in the feature: a placed order must become a register cart and become order items again without repricing anything.

- **RED**: same run as Task 1 → `TS2307: Cannot find module './order-edit-cart'`.
- **First GREEN attempt failed** — 31/32. A resolved add-on ("Pearls") serialized back out as a *variation*, losing round-trip fidelity. Fixed in implementation by partitioning on the group's `max_select` rule (the unified modifier model's own definition of add-on vs variation) rather than on a historical flag. This required `posCartToOrderItems` to take the catalog; the three test call sites were updated for the discovered signature, with the asserted guarantees unchanged.
- **GREEN**: `Tests: 32 passed`.
- **Guaranteed**: the unit price is derived from `subtotal / quantity` and never from `order_items.price` — the register writes the *base* price into that column while web checkout writes the *loaded* unit price, and only `subtotal === unitPrice × quantity` holds for both (both writers pinned by separate tests); modifier ids are recovered by name against the live menu; an option or menu item deleted since the sale is **reported**, not dropped, and the line stays correctly priced; identically-configured items stack; a corrupt zero-quantity row does not divide by zero.

### Task 3 — Edit permission gate (`lib/order-edit-guards.ts`)

- **RED**: `npx jest lib/order-edit-guards.test.ts …` → `TS2307: Cannot find module './order-edit-guards'`. 3 suites failed, 0 tests.
- **GREEN**: merchant app full suite → `62 suites, 975 tests passed`.
- **Guaranteed**: delivered and cancelled orders are not editable by anyone; per-tenant Supabase (no mutation path today) is refused with a backend reason; staff without `order_edit` are refused; the status refusal is reported *ahead of* the permission refusal, so a staff member is not sent to ask a manager for access that would not have helped; refunds require the separate `order_refund` key, which `order_edit` alone does not grant.

### Task 4 — Revision diff (`lib/order-revision.ts`)

- **RED**: as Task 3 → `TS2307: Cannot find module './order-revision'`.
- **GREEN**: as Task 3.
- **Guaranteed**: added / removed / quantity-changed / repriced are distinguished; a modifier swap (Small → Large) reads as a remove plus an add rather than a repricing; lines with different kitchen notes stay distinct; the signed `subtotalDelta` values reconcile to the true difference in order totals (pinned by an explicit mixed-edit test) — if they did not, the balance shown to the cashier would be wrong; `describeChange` renders merchant-readable history lines.

### Task 5 — Stock movement (`lib/order-stock-delta.ts`)

- **RED**: as Task 3 → `TS2307: Cannot find module './order-stock-delta'`.
- **GREEN**: as Task 3.
- **Guaranteed**: only the *difference* moves (1 → 3 depletes 2, not 3); removals restore; a same-item modifier swap nets to **zero** movement, because stock groups by menu item while the revision diff groups by configured line; each menu item appears once; items with no menu id are skipped.

### Task 6 — Permission registry sync (3 copies)

`order_edit` and `order_refund` added to `webnegosyo-app/lib/staff-permissions.ts`, `src/lib/staff-permissions.ts` (with UI labels), and `webnegosyo-desktop/src/renderer/src/lib/staff-permissions.ts`.

- The web registry-pinning test `tests/unit/staff-permissions.test.ts` **failed as designed** on the new keys and was updated to enumerate them.
- **GREEN**: `npx jest tests/unit/staff-permissions` → `31 passed`.

### Task 7 — Migration `20260803120000_order_edit_and_payments.sql` — APPLIED 2026-07-29

`order_payments` (append-only ledger), `order_revisions` (immutable snapshots), `orders.amount_paid` / `revision_number` / `edited_at` / `edited_by`, plus the `sync_order_amount_paid` trigger.

**The first apply attempt failed, and usefully.** `ERROR: 42703: column u.id does not exist` — `app_users` keys on `user_id`. Investigating that exposed a worse bug in the same policy: the SELECT policy scoped only through the parent order's `tenant_id`, a check that passes for **any authenticated user including a customer**. Shipped as written it would have exposed every merchant's takings. Both policies were rewritten to mirror `orders_select_by_tenant` / `orders_write_admin` exactly.

Live probe after applying (`mcp__supabase__execute_sql`):

| Probe | Result |
|---|---|
| Backfill | 38 paid orders → 38 ledger rows |
| `amount_paid` cache vs `total` on paid orders | 0 mismatches |
| Insert charge ₱150 | `amount_paid` → 150.00 |
| Insert refund ₱40 | `amount_paid` → 110.00 |
| Insert amount `-5` | rejected (`check_violation`) |
| Insert kind `'discount'` | rejected (`check_violation`) |
| Duplicate `(order_id, revision_number)` | rejected (`unique_violation`) — the optimistic lock works |
| Delete probe rows | `amount_paid` → 0.00, ledger back to 38, 0 mismatches |

Verified by asserting row counts, since `raise notice` output is not returned through MCP. The probe left no trace.

### Task 8 — Platform write path (`lib/backends/order-revise.ts` + adapter)

- **RED**: `npx jest lib/backends/order-revise.test.ts lib/backends/supabase-adapter.test.ts` → `TS2307: Cannot find module './order-revise'`, plus a genuine **runtime** failure: `● isPlatformRefSupported › claims the order-edit refs` (`1 failed, 22 passed`).
- **GREEN**: `npx jest` → `63 suites, 995 tests passed` (up from 62/975).
- Two bugs surfaced during implementation: the narrow `PlatformQueryBuilder` interface had no `delete` (added deliberately, with a note that widening it widens what the adapter can destroy), and one test passed a stale expected-revision by accident so it was tripping the concurrency guard instead of asserting the revision bump.
- **Guaranteed**: the total is recomputed from items and a caller-supplied total is ignored; each subtotal is forced to `price × quantity`; delivery fee and service charge are added; `revision_number` bumps and `edited_at`/`edited_by` are stamped; `item_count` is recounted; both sides are snapshotted into the revision row; a stale revision is refused; emptying an order is refused (that is a cancellation); non-positive/oversized quantities and negative/implausible prices are refused; payment amounts are stored unsigned with the kind carrying direction, rounded to centavos, non-positive and non-finite amounts refused, references trimmed, absent optionals written as `null` not `undefined`.

### Task 9 — Convex write path

`reviseOrder`, `recordPayment`, `getOrderPayments`, `getOrderRevisions` mutations/queries; `orderPayments` + `orderRevisions` tables; `amountPaid`/`revisionNumber`/`editedAt`/`editedBy` on `orders` (all optional so pre-existing orders keep validating). `CURRENT_SCHEMA_VERSION` bumped 13 → 14 and the template rebundled.

- **Validated**: `npx tsc --noEmit -p .` in `convex-template` → clean; bundle grepped and confirmed to contain `reviseOrder` and `orderPayments`; web `npx jest tests/unit` → `271 suites, 3390 tests passed`.
- Convex gets atomicity the platform backend cannot: the whole handler is one transaction. With no triggers available, `recordPayment` maintains the `amountPaid` cache inside that same transaction.
- **No unit tests** — Convex functions are not covered by either Jest project. This is the weakest link in the phase; see gaps.

### Task 10 — Edit session state (`lib/order-edit-session.ts`)

The brain the edit and settle screens render. It lives in `lib/` because Jest is scoped there in this app — putting this in a component would make "did we ask the cashier for the right amount" untestable.

- **RED**: `npx jest lib/order-edit-session.test.ts lib/pos-sales.test.ts` → `TS2307: Cannot find module './order-edit-session'`. 0 tests run.
- **GREEN**: `npx jest` → `65 suites, 1028 tests passed`.
- **Guaranteed**: a session opens with the order's items already in the cart, clean and unsaveable until something changes; a fully-paid untouched order opens `settled`, an unpaid one opens owing its full total; the expected revision number is carried for the concurrency check; deleted menu items surface as warnings; raising the total yields `collect` and lowering it yields `refund`, with the correct balance; undoing an edit returns the session to clean; an emptied cart cannot be saved and says why; sessions are never mutated; the original total is retained for the "was / now" header. Dirty-checking reuses the revision diff, so an enabled Save button can never disagree with an empty change list.

### Task 11 — Drawer reconciliation after an edit (`lib/pos-sales.ts`)

A real bug rather than bookkeeping polish. `sale.total` stops describing the till the moment an order can be edited: a ₱450 GCash bill topped up with ₱120 in cash still records `paymentMethod: 'GCash'`, so the whole ₱570 landed in non-cash and the ₱120 physically in the drawer went unaccounted for.

- **RED**: `npx jest lib/pos-sales.test.ts` → `TS2554: Expected 1 arguments, but got 2` and `TS2339: Property 'refundsPaid' does not exist on type 'CounterSalesSummary'`. 0 tests run.
- **GREEN**: `npx jest` → `65 suites, 1028 tests passed`.
- **Guaranteed**: when a sale has settlement rows the drawer splits by how each peso was **actually** taken, not by the order's single payment method; a cash refund reduces the drawer and is also reported separately, because a cashier counting the till needs to see money that left it; another order's ledger rows are ignored; sales with no rows (every counter sale rung up before the ledger existed) keep the original behaviour so historic shifts still reconcile.
- One existing test pinned the exact zero-summary object and was updated for the new `refundsPaid` field; the guarantee it asserts is unchanged.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Charges minus refunds net to the amount paid, with float drift rounded to centavos | `lib/order-balance.test.ts:amountPaid` | unit | PASS |
| 2 | A single non-finite ledger row does not poison the total | `lib/order-balance.test.ts:ignores non-finite amounts` | unit | PASS |
| 3 | An over-refund reports a negative balance rather than being clamped away | `lib/order-balance.test.ts:goes negative when refunds exceed charges` | unit | PASS |
| 4 | Sub-centavo balances read as settled; one centavo does not | `lib/order-balance.test.ts:settlementIntent` | unit | PASS |
| 5 | Unit price is derived from subtotal, so register-written and web-written items hydrate identically | `lib/order-edit-cart.test.ts:derives the unit price…` ×2 | unit | PASS |
| 6 | A modifier deleted from the menu since the sale is reported, not silently dropped | `lib/order-edit-cart.test.ts:reports an option that no longer exists` | unit | PASS |
| 7 | A fully-configured order round-trips through the cart without loss | `lib/order-edit-cart.test.ts:round-trips a fully-configured order` | unit | PASS |
| 8 | Serialized items satisfy `subtotal === price × quantity`, the server's revalidation identity | `lib/order-edit-cart.test.ts:writes the loaded unit price` | unit | PASS |
| 9 | Delivered and cancelled orders cannot be edited by anyone | `lib/order-edit-guards.test.ts:refuses to edit a delivered/cancelled order` | unit | PASS |
| 10 | The status refusal is reported before the permission refusal | `lib/order-edit-guards.test.ts:reports the status refusal before…` | unit | PASS |
| 11 | Refund rights are not implied by edit rights | `lib/order-edit-guards.test.ts:refuses staff who may edit but…` | unit | PASS |
| 12 | Revision deltas reconcile to the true change in order total | `lib/order-revision.test.ts:sums to the true total change` | unit | PASS |
| 13 | A modifier swap is a remove plus an add, not a repricing | `lib/order-revision.test.ts:treats a changed modifier as a different line` | unit | PASS |
| 14 | An edit moves only the stock difference | `lib/order-stock-delta.test.ts:moves only the difference` | unit | PASS |
| 15 | A same-item modifier swap moves no stock | `lib/order-stock-delta.test.ts:nets a swap…to zero` | unit | PASS |
| 16 | The permission registry enumerates the new keys across all surfaces | `tests/unit/staff-permissions.test.ts` | unit | PASS |
| 17 | An edit's total is recomputed, never taken from the caller | `lib/backends/order-revise.test.ts:ignores a caller-supplied total` | unit | PASS |
| 18 | Each line's subtotal is forced to price × quantity | `lib/backends/order-revise.test.ts:forces each line's subtotal` | unit | PASS |
| 19 | An edit built on a stale revision is refused | `lib/backends/order-revise.test.ts:refuses an edit built against a stale revision` | unit | PASS |
| 20 | An order cannot be emptied by editing | `lib/backends/order-revise.test.ts:refuses to empty an order` | unit | PASS |
| 21 | Implausible quantities and prices are refused | `lib/backends/order-revise.test.ts:refuses a non-positive quantity / implausible price / negative price` | unit | PASS |
| 22 | Payment amounts are unsigned, positive, finite, and centavo-rounded | `lib/backends/order-revise.test.ts:buildPaymentRow` | unit | PASS |
| 23 | The platform adapter claims the order-edit refs | `lib/backends/supabase-adapter.test.ts:claims the order-edit refs` | unit | PASS |
| 24 | The ledger trigger, constraints and optimistic lock behave on the live DB | live probe, see Task 7 | integration | PASS |
| 25 | An edit session opens clean and cannot be saved until something changes | `lib/order-edit-session.test.ts:opens clean` | unit | PASS |
| 26 | Raising the total asks for collection; lowering it asks for a refund | `lib/order-edit-session.test.ts:asks the cashier to collect / to refund` | unit | PASS |
| 27 | Undoing an edit returns the session to clean | `lib/order-edit-session.test.ts:goes back to clean` | unit | PASS |
| 28 | An emptied cart cannot be saved, and says why | `lib/order-edit-session.test.ts:refuses to save an emptied cart` | unit | PASS |
| 29 | The drawer splits by how each peso was actually taken | `lib/pos-sales.test.ts:splits the drawer by how each settlement was actually taken` | unit | PASS |
| 30 | A cash refund leaves the drawer and is reported | `lib/pos-sales.test.ts:subtracts a cash refund from the drawer` | unit | PASS |
| 31 | Pre-ledger counter sales still reconcile | `lib/pos-sales.test.ts:falls back to the order's own method` | unit | PASS |

## Coverage

```
All files              |   98.78 |    94.16 |   97.43 |   98.66
 lib                   |   98.57 |    90.14 |   96.96 |   98.41
  order-balance.ts     |     100 |      100 |     100 |     100
  order-edit-cart.ts   |   98.14 |    83.78 |     100 |   97.82
  order-edit-guards.ts |     100 |      100 |     100 |     100
  order-revision.ts    |   97.29 |    93.75 |   85.71 |   97.22
  order-stock-delta.ts |     100 |      100 |     100 |     100
 lib/backends          |     100 |      100 |     100 |     100
  order-revise.ts      |     100 |      100 |     100 |     100
Tests:       83 passed, 83 total
```

Well above the 80% bar, but note this measures only the TypeScript modules. Convex functions are outside every coverage report in this repo.

Full suites: merchant app **63 suites / 995 tests**; web **271 suites / 3390 tests**. No regressions.

## Known gaps

These are real and deliberate, not oversights:

1. **The screens are not built.** `order/[orderId]/edit.tsx`, `settle.tsx`, and the payments/revision cards on order detail do not exist. Every piece they need is built and tested — session state, guards, diff, balance, write path — but no merchant can edit an order yet because nothing renders it. `pos-sales.tsx` also still calls `summarizeCounterSales` with one argument, so the drawer fix is inert until the screen passes the ledger.
2. **The RLS policies were not probed under a real user session.** The live probe ran through MCP with elevated rights, which does not exercise the policies. The policy text is now copied from the working `orders` policies, but "an ordinary tenant admin can insert a payment, and cannot see another tenant's" is asserted by construction, not by test.
3. **Convex `reviseOrder` / `recordPayment` have no automated tests at all.** Neither Jest project covers `convex-template/`. They typecheck and they bundle; that is all that is proven. They have not been deployed to a scratch tenant or executed once.
4. **The platform revise path is not atomic.** PostgREST cannot span a transaction across the revision insert, item delete/insert, and order patch. The order of writes is chosen so the worst partial failure leaves an audit row for an edit that did not fully apply, rather than a rewritten bill with no record — but moving it into a Postgres RPC is a real follow-up, not a nicety.
5. **Screens are not unit-tested by design** — `webnegosyo-app/jest.config.js` scopes Jest to `lib/` and `theme/`. Phase 4 needs manual verification across backend × settlement-direction.
6. **Stock movement is computed but never applied.** `stockDelta` is tested and unused; nothing calls the inventory path yet.
7. **`order-edit-cart.ts:217` and `order-revision.ts:45` are uncovered** — defensive fallbacks on the orphan/duplicate paths.
8. **The POS price divergence is not fixed upstream.** `pos-order.ts:toOrderItem` still writes the base price into `order_items.price`. Hydration tolerates it and the revise path normalizes to the web convention, but a POS-created order stays inconsistent with a web-created one until it is edited.

## Merge evidence

Checkpoint commits on `feat/platform-supabase-order-parity`:

| Commit | Stage |
|---|---|
| `57d0254` | RED — balance + hydration reproducers (TS2307, 0 tests run) |
| `f016492` | GREEN — 32 passed; full app suite 943 passed |
| `2db2232` | RED — guards, revision, stock-delta reproducers (TS2307, 0 tests run) |
| `2f721f1` | GREEN — 62 suites / 975 tests; web permissions 31 passed |
| `bdaf1d5` | Migration written (unapplied at that point) |
| `f7b4ad7` | Migration APPLIED + RLS fix — live probe results in Task 7 |
| `8244ba6` | RED — revise/payment reproducers (TS2307 + runtime ref failure) |
| `059faf4` | GREEN — 63 suites / 995 tests |
| `975c314` | Convex backend + schema v14 + rebundle; web 271 suites / 3390 tests |
| `e858f83` | RED — edit session + drawer reproducers (TS2307 / TS2554 / TS2339) |
| `489ac35` | GREEN — 65 suites / 1028 tests |
