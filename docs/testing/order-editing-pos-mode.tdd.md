# TDD evidence — Order editing (POS mode) + payment ledger

**Source plan**: produced inline in-session (`/ecc:plan`), not written to a `.plan.md` file.
**Scope confirmed with the user**: merchant mobile app only · platform Supabase + Convex backends · ledger-based settlement.
**Status**: Phases 1–2 complete. Phases 3–4 (backend mutation, UI) not started.

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

### Task 7 — Migration `20260803120000_order_edit_and_payments.sql`

Written and committed. **Not applied to any Supabase project** — awaiting the user's go-ahead.

- `order_payments` (append-only ledger), `order_revisions` (immutable before/after snapshots), `orders.amount_paid` / `revision_number` / `edited_at` / `edited_by`.
- `amount_paid` is trigger-maintained from the ledger; balance stays derived.
- `(order_id, revision_number)` unique doubles as the optimistic lock.
- Backfills an opening charge row for every already-paid order.
- Additive and idempotent (`if not exists` throughout), so it is safe to re-run.
- **No test evidence** — this is unverified until applied and probed. See gaps.

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

## Coverage

```
npx jest --coverage --collectCoverageFrom='lib/order-{balance,edit-cart,revision,stock-delta,edit-guards}.ts'

File                  | % Stmts | % Branch | % Funcs | % Lines
All files             |   98.57 |    90.14 |   96.96 |   98.41
 order-balance.ts     |     100 |     100  |     100 |     100
 order-edit-cart.ts   |   98.14 |   83.78  |     100 |   97.82
 order-edit-guards.ts |     100 |     100  |     100 |     100
 order-revision.ts    |   97.29 |   93.75  |   85.71 |   97.22
 order-stock-delta.ts |     100 |     100  |     100 |     100
```

Well above the 80% bar. Full merchant app suite: **62 suites, 975 tests, all passing** — no regressions.

## Known gaps

These are real and deliberate, not oversights:

1. **The migration is unverified.** It has never been applied or probed. Nothing in this report proves the trigger, the backfill, or the RLS policies behave as written.
2. **No backend write path exists yet** (Phase 3). `orders:reviseOrder` and `orders:recordPayment` are not implemented on either backend and are not in the merchant app adapter's `SUPPORTED_MUTATION_REFS`, so nothing can actually save an edit today.
3. **No UI** (Phase 4). None of these modules is wired to a screen.
4. **Screens are not unit-tested by design** — `webnegosyo-app/jest.config.js` scopes Jest to `lib/` and `theme/`; UI is exercised manually via Expo. Phase 4 will need manual verification across backend × settlement-direction.
5. **`order-edit-cart.ts:217` and `order-revision.ts:45` are uncovered** — both are defensive fallbacks on the orphan/duplicate paths.
6. **The POS price divergence is not fixed upstream.** `pos-order.ts:toOrderItem` still writes the base price into `order_items.price`. Hydration tolerates it, and the revise path normalizes to the web convention, but a POS-created order remains inconsistent with a web-created one until it is edited.

## Merge evidence

Checkpoint commits on `feat/platform-supabase-order-parity`:

| Commit | Stage |
|---|---|
| `57d0254` | RED — balance + hydration reproducers (TS2307, 0 tests run) |
| `f016492` | GREEN — 32 passed; full app suite 943 passed |
| `2db2232` | RED — guards, revision, stock-delta reproducers (TS2307, 0 tests run) |
| `2f721f1` | GREEN — 62 suites / 975 tests; web permissions 31 passed |
| `bdaf1d5` | Migration (no test evidence — unapplied) |
