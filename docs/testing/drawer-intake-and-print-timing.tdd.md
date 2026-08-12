# TDD Evidence — Drawer order intake & configurable print timing

**Source plan:** none on disk. Journeys were derived during the `/ecc:plan` run in this session and confirmed with the user in conversation (the user clarified request #1 in Filipino: incoming orders should be visible *in the Drawer, not the bottom sheet*, confirmable there, and once confirmed at the POS their sales should show in the drawer totals).

**Scope delivered:** Phase 1 (Drawer intake), Phase 2 (print timing) and Phase 3 (adding a round to a placed order).

---

## User journeys

**Phase 1 — Drawer intake**
1. As a cashier, I want to see Smart Menu orders in the Drawer tab, so I can confirm them without leaving the register.
2. As a cashier, I want an online order I confirmed at the POS to count in my shift totals, so my drawer reconciles.
3. As a store owner, I don't want unpaid online orders inflating "Expected in drawer", so the till count stays honest.

**Phase 2 — Print timing**
4. As a merchant, I want to choose *when* receipts print — on confirmation (kitchen ticket) or at bill-out — so the paper matches how my store works.
5. As an upgrading merchant, I don't want my existing auto-print behaviour to change silently.

**Phase 3 — Adding a round**
6. As a cashier, I want to ring up "two more beers" onto a table's existing order without hunting through the twelve lines they already have, so I cannot knock one out by accident.
7. As a cashier, I want to add that round *while the kitchen is cooking the first one*, because that is when the table asks.
8. As a store owner, I want the customer billed for both rounds, and only charged for what they have not already paid.

---

## Task report

### Task 1 — Drawer counts online orders by what was settled

Widened `summarizeCounterSales` with a `SourcePolicy` and added `selectShiftSales`, so an online order confirmed at the register contributes its **settled** amount (`amountPaid`) rather than its `total`.

- **RED command:** `npx jest --selectProjects logic --testPathPattern "(pos-sales|drawer-intake)"`
- **RED output:** `TS2353: Object literal may only specify known properties, and 'amountPaid' does not exist in type 'Partial<CounterSale>'` / `TS2554: Expected 1-2 arguments, but got 3` / `Cannot find module './drawer-intake'` → `Test Suites: 2 failed, 2 total / Tests: 0 total` (compile-time RED)
- **GREEN output:** `Test Suites: 7 passed, 7 total / Tests: 69 passed`
- **Guaranteed:** a confirmed-but-unpaid online order adds ₱0 to `cashTotal`; a missing `amountPaid` reads as unpaid, never as the full bill; cancelled and still-pending online orders are excluded entirely; the settlement ledger wins over `amountPaid` when rows exist; with the policy off, behaviour is byte-identical to before.

### Task 2 — Drawer lists and confirms incoming orders

New pure module `lib/drawer-intake.ts` (`selectDrawerIncoming`, `canConfirmFromDrawer`), wired into `app/(main)/pos-sales.tsx` with a live `orders:getRealtimeQueue` subscription, branch scoping, demo-mode refusal and a Confirm action through `orders:updateOrderStatus`.

- **RED command:** `npx jest --selectProjects logic --testPathPattern "(register-settings-store|drawer-intake-mount)"`
- **RED output:** `Test Suites: 2 failed, 2 total / Tests: 7 failed, 7 total`
- **GREEN output:** `Test Suites: 7 passed / Tests: 69 passed`
- **Guaranteed:** counter sales never appear as "incoming"; manual/phone-in orders do; only `pending` can be confirmed; read-only per-tenant Supabase backends are refused up front with a reason rather than failing at the tap.

**Defect the guardrail caught mid-cycle:** the first screen implementation re-stated `source === "pos"` in a local `shiftSales` memo, so the visible list and the totals were two different rules. `drawer-intake-mount.test.ts:"selects its intake rows through the shared rule, never inline"` failed. Fixed by extracting `selectShiftSales` and having both the list and the summary consume it.

### Task 3 — Configurable print timing

New pure module `lib/print-trigger.ts`; `printer-store` migrated from `autoPrint: boolean` to `printTrigger: PrintTrigger`; `useOrderPrint` exposes `shouldPrint(moment)` / `printAt(moment, order)`; four call sites unified.

- **RED command:** `npx jest --selectProjects logic --testPathPattern "print-trigger"`
- **RED output:** `TS2307: Cannot find module './print-trigger'` → `Tests: 0 total` (compile-time RED)
- **GREEN output:** `Tests: 10 passed, 10 total`
- **Guaranteed:** each trigger fires at exactly its declared moments; an unrecognised trigger prints nothing rather than everything; `auto_print=true` migrates to `confirmation`, `false` to `off`, and an unset key defaults to `confirmation` (matching the old store's `true` default).

**Three pre-existing inconsistencies this closed:**
- `pos-tender.tsx:431` printed whenever a printer existed, ignoring the setting entirely.
- `order/[orderId].tsx handleCollect` — the actual bill-out moment — never printed.
- `orders.tsx:124` showed "Open order details to print receipt" gated on `autoPrint`, a setting it then did nothing with.

### Task 4 — Adding a round to a placed order

`OrderEditContext` gained a `mode: "revise" | "append"` and an `appendBaseCart`. `enterAppendMode` loads an order exactly as `enterEditMode` does but hands the register an **empty** cart and parks the order's own lines in the context. One new pure rule, `effectiveEditCart`, folds them back together, and every sum — items total, discount re-pricing, dirty check, and the tender screen's save and stock revision — goes through it.

- **RED command:** `npx jest --selectProjects logic --testPathPattern "pos-append-mode"`
- **RED output:** `TS2724: '"./pos-edit-mode"' has no exported member named 'canEnterAppendMode'` / `TS2305: no exported member 'effectiveEditCart'` / `TS2724: no exported member named 'enterAppendMode'` / `TS2724: '"./order-edit-guards"' has no exported member named 'canAppendToOrder'` / `TS2339: Property 'mode' does not exist on type 'OrderEditContext'` (compile-time RED)
- **GREEN output:** `Test Suites: 2 passed / Tests: 27 passed`
- **Guaranteed:** the register opens empty; the customer is billed for both rounds; a third Latte stacks onto the line the order already had rather than listing it twice; an already-paid first round leaves only the new items to collect; the parked lines are never mutated; and an empty append is blocked with "add at least one item" rather than the edit path's alarming "cancel it instead".

**The kitchen rule was relaxed — deliberately, and only for append.** `canEditOrder` bars `preparing` and `ready` because rewriting a line desynchronises the bill from food already on the stove. Appending changes nothing that is cooking, and `preparing`/`ready` is the *only* window a second round is ever requested in, so `canAppendToOrder` bars only `delivered` and `cancelled`. Permission (`order_edit`), backend, branch scope and the empty-register rule are all unchanged and shared — `checkOrderWrite` is now the single implementation both gates call.

**The defect the guardrail exists for:** `pos-tender.tsx` saved `posCartToOrderItems(lines)` — the *register's* cart. On an append that is the second round alone, so saving would have replaced the table's whole order with it, deleting the first round off a bill the customer had already eaten. Every unit test would still have passed and the on-screen total would still have been right. `pos-append-mount.test.ts` locks the save and the stock revision onto `savedItems`.

---

## Test specification

| # | What is guaranteed | Test file / case | Type | Result | Evidence |
|---|---|---|---|---|---|
| 1 | Online orders are ignored by the drawer unless the merchant opts in | `lib/pos-sales.test.ts:ignores online orders when no source policy is given` | unit | PASS | `npx jest --selectProjects logic -t pos-sales` |
| 2 | A confirmed online order paid in cash counts toward the drawer | `lib/pos-sales.test.ts:counts a confirmed online order that was paid in cash` | unit | PASS | same |
| 3 | A confirmed but unpaid online order adds ₱0 to the drawer | `lib/pos-sales.test.ts:adds nothing to the drawer for a confirmed online order nobody has paid yet` | unit | PASS | same |
| 4 | A missing `amountPaid` reads as unpaid, not as the full total | `lib/pos-sales.test.ts:treats a missing amountPaid as unpaid rather than as the full total` | unit | PASS | same |
| 5 | Non-cash online payments land in the non-cash column | `lib/pos-sales.test.ts:routes a non-cash online payment to the non-cash column` | unit | PASS | same |
| 6 | Pending and cancelled online orders are excluded | `lib/pos-sales.test.ts:excludes an online order still waiting to be confirmed`, `:excludes a cancelled online order…` | unit | PASS | same |
| 7 | The settlement ledger overrides `amountPaid` when rows exist | `lib/pos-sales.test.ts:prefers the settlement ledger over amountPaid when rows exist` | unit | PASS | same |
| 8 | The visible list and the totals come from one predicate | `lib/pos-sales.test.ts:lists exactly the rows the summary counted` | unit | PASS | same |
| 9 | Counter sales never show as "incoming"; manual orders do | `lib/drawer-intake.test.ts:excludes the register's own counter sales`, `:shows a manually entered order…` | unit | PASS | `npx jest -t drawer-intake` |
| 10 | Only pending orders can be confirmed, with a stated reason otherwise | `lib/drawer-intake.test.ts:refuses an order the kitchen already confirmed, and says why` | unit | PASS | same |
| 11 | Read-only backends refuse confirm up front | `lib/drawer-intake.test.ts:refuses on a backend that cannot write orders…` | unit | PASS | same |
| 12 | The Drawer screen defers intake/scope/gate/demo decisions to shared rules | `lib/drawer-intake-mount.test.ts` (7 cases) | guardrail | PASS | same |
| 13 | The drawer opt-in defaults off and survives a shift change | `stores/register-settings-store.test.ts` (5 cases) | unit | PASS | `npx jest -t register-settings` |
| 14 | A failed settings write never throws at the register | `stores/register-settings-store.test.ts:does not throw when the device storage rejects the write` | unit | PASS | same |
| 15 | Each print trigger fires at exactly its declared moments | `lib/print-trigger.test.ts` (7 cases under `shouldPrintAt`) | unit | PASS | `npx jest -t print-trigger` |
| 16 | Upgrading merchants keep their existing print behaviour | `lib/print-trigger.test.ts` (3 cases under `migrateAutoPrint`) | unit | PASS | same |
| 17 | An append opens an empty register and remembers the original food | `lib/pos-append-mode.test.ts` (4 cases under `enterAppendMode`) | unit | PASS | `npx jest -t pos-append-mode` |
| 18 | The customer is billed for both rounds, not just the new one | `lib/pos-append-mode.test.ts:bills the original food as well as the new round` | unit | PASS | same |
| 19 | A repeat of an existing item stacks instead of listing twice | `lib/pos-append-mode.test.ts:stacks a second helping onto the line the order already had…` | unit | PASS | same |
| 20 | Only the unpaid remainder is collected | `lib/pos-append-mode.test.ts:charges only the new round when the original was already paid for` | unit | PASS | same |
| 21 | An empty append is blocked with useful copy, not "cancel it instead" | `lib/pos-append-mode.test.ts` (2 cases) | unit | PASS | same |
| 22 | A round can be added while cooking, but not after handover or cancellation | `lib/pos-append-mode.test.ts` (6 cases under `canAppendToOrder`) | unit | PASS | same |
| 23 | An append still refuses to land on a counter sale in progress | `lib/pos-append-mode.test.ts` (2 cases under `canEnterAppendMode`) | unit | PASS | same |
| 24 | The tender screen saves the whole order, never the register cart alone | `lib/pos-append-mount.test.ts` (7 guardrails) | guardrail | PASS | `npx jest -t pos-append-mount` |

---

## Coverage

```
npx jest --selectProjects logic --coverage \
  --collectCoverageFrom='lib/pos-sales.ts' --collectCoverageFrom='lib/drawer-intake.ts' \
  --collectCoverageFrom='lib/print-trigger.ts' --collectCoverageFrom='stores/register-settings-store.ts' \
  --testPathPattern "(pos-sales|drawer-intake|print-trigger|register-settings)"

All files   | 97.26 % Stmts | 83.33 % Branch | 100 % Funcs | 100 % Lines
```

Phase 3:

```
npx jest --selectProjects logic --coverage \
  --collectCoverageFrom='lib/pos-edit-mode.ts' --collectCoverageFrom='lib/order-edit-guards.ts' \
  --testPathPattern "(pos-append|pos-edit-mode|order-edit-guards|pos-edit-save|pos-edit-voucher)"

All files            | 99.04 % Stmts | 93.10 % Branch | 100 % Funcs | 100 % Lines
 order-edit-guards.ts |   100 %      | 88.88 %        | 100 %       | 100 %
 pos-edit-mode.ts     | 98.76 %      | 93.87 %        | 100 %       | 100 %
```

Full suite: `npx jest` → **172 suites, 2667 tests passed**. Typecheck: `npx tsc --noEmit` → clean. Lint: `npx expo lint` → **0 errors**, 6 pre-existing warnings, none in a touched file.

---

## Known gaps

1. **Standalone new-order entry was not built as a new screen** — the second half of the user's "Pareho". The register (`app/(main)/pos.tsx`) already *is* a from-scratch order entry: it rings up an order with no prior order involved and writes it via `buildPosOrder`. Nothing new was added there, so if the intent was a *differently shaped* new-order screen rather than the existing register, that is still outstanding and should be specified before it is built.
2. **A voucher that qualified on an original item is re-priced against the merged cart**, which is correct — but the register's *session* discount (codes typed during the append) is judged against the register's own lines. A code requiring a minimum spend may therefore read the second round's subtotal rather than the whole bill.
3. **Append has no rendered-component test**, same as the Drawer — screens under `app/` sit outside both Jest roots, so `pos-append-mount.test.ts` asserts on source text.
4. **Only the new round should print as a chit**, and it does not: an append reprints via the ordinary bill-out path with the full order on it. The kitchen sees items it already made.
5. **"Confirmed at the POS" is inferred, not marked.** Per the plan's Option A, an online order counts once its status is past `pending` and money has settled. An order confirmed on the *web dashboard* and later paid will therefore also count toward the register's drawer. The precise fix (Option B — a durable `posConfirmedAt` written at confirm time) needs a new field through `orders:updateOrderStatus` on both Convex and the platform adapter, plus a Convex deploy to every tenant. The toggle is off by default and its hint says the total uses what has actually been paid.
6. **The orders list still does not print.** `orders.tsx` holds order rows without line items, so printing there would emit an itemless receipt. It now points at the order detail screen, gated on the real setting instead of the removed `autoPrint`. Fixing properly needs an `orders:getAllOrderItems` fetch on that screen.
7. **No rendered-component tests for the Drawer screen.** The `components` Jest project only roots at `components/`, so screens under `app/` are covered by source-assertion guardrails (`*-mount.test.ts`), matching the existing convention. The Confirm button's runtime behaviour is not exercised by a renderer.
8. **`lib/printer.ts` transport remains untested**, as before this change.
9. One full-suite run showed a single `components/pos/DiscountSheet.test.tsx` failure that did not reproduce on re-run or when the `components` project ran alone (51/51 passed). Treated as a pre-existing cross-project flake; that file was not touched here.

---

## Merge evidence (for squash)

- **RED 1** `1e6e632` — reproducers for Drawer intake + online-order drawer totals; compile-time RED (`amountPaid` / 3rd arg / missing module).
- **GREEN 1** `266024b` — Drawer intake implemented; `npx jest` 169 suites / 2630 tests passed. Includes the mid-cycle fix for the duplicated source rule caught by the mount guardrail.
- **RED 2** `3dfa656` — reproducer for print timing; compile-time RED (missing `./print-trigger`).
- **GREEN 2** `c2e4325` — print timing implemented; `npx jest` 170 suites / 2640 tests passed, `tsc --noEmit` clean.
- **RED 3** `5fcfa9e` — reproducer for appending a round; compile-time RED (missing `enterAppendMode` / `effectiveEditCart` / `canAppendToOrder` / `mode`).
- **RED 4** `74ac1a8` — source guardrail for the screen wiring; runtime RED, 6 of 7 cases failing.
- **GREEN 3** `add1be6` — append mode implemented; `npx jest` 172 suites / 2667 tests passed, `tsc --noEmit` clean, `expo lint` 0 errors.
