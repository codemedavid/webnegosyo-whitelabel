# TDD Evidence — Drawer order intake & configurable print timing

**Source plan:** none on disk. Journeys were derived during the `/ecc:plan` run in this session and confirmed with the user in conversation (the user clarified request #1 in Filipino: incoming orders should be visible *in the Drawer, not the bottom sheet*, confirmable there, and once confirmed at the POS their sales should show in the drawer totals).

**Scope delivered:** Phase 1 (Drawer intake) and Phase 2 (print timing). Phase 3 (append-to-order + standalone new order entry) is **not** implemented — see *Known gaps*.

---

## User journeys

**Phase 1 — Drawer intake**
1. As a cashier, I want to see Smart Menu orders in the Drawer tab, so I can confirm them without leaving the register.
2. As a cashier, I want an online order I confirmed at the POS to count in my shift totals, so my drawer reconciles.
3. As a store owner, I don't want unpaid online orders inflating "Expected in drawer", so the till count stays honest.

**Phase 2 — Print timing**
4. As a merchant, I want to choose *when* receipts print — on confirmation (kitchen ticket) or at bill-out — so the paper matches how my store works.
5. As an upgrading merchant, I don't want my existing auto-print behaviour to change silently.

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

---

## Coverage

```
npx jest --selectProjects logic --coverage \
  --collectCoverageFrom='lib/pos-sales.ts' --collectCoverageFrom='lib/drawer-intake.ts' \
  --collectCoverageFrom='lib/print-trigger.ts' --collectCoverageFrom='stores/register-settings-store.ts' \
  --testPathPattern "(pos-sales|drawer-intake|print-trigger|register-settings)"

All files   | 97.26 % Stmts | 83.33 % Branch | 100 % Funcs | 100 % Lines
```

Full suite: `npx jest` → **170 suites, 2640 tests passed**. Typecheck: `npx tsc --noEmit` → clean.

---

## Known gaps

1. **Phase 3 not implemented.** Append-items-to-an-existing-order and standalone new-order entry (the user's request #3, answered "Pareho") remain unbuilt. No code or tests for them exist yet.
2. **"Confirmed at the POS" is inferred, not marked.** Per the plan's Option A, an online order counts once its status is past `pending` and money has settled. An order confirmed on the *web dashboard* and later paid will therefore also count toward the register's drawer. The precise fix (Option B — a durable `posConfirmedAt` written at confirm time) needs a new field through `orders:updateOrderStatus` on both Convex and the platform adapter, plus a Convex deploy to every tenant. The toggle is off by default and its hint says the total uses what has actually been paid.
3. **The orders list still does not print.** `orders.tsx` holds order rows without line items, so printing there would emit an itemless receipt. It now points at the order detail screen, gated on the real setting instead of the removed `autoPrint`. Fixing properly needs an `orders:getAllOrderItems` fetch on that screen.
4. **No rendered-component tests for the Drawer screen.** The `components` Jest project only roots at `components/`, so screens under `app/` are covered by source-assertion guardrails (`*-mount.test.ts`), matching the existing convention. The Confirm button's runtime behaviour is not exercised by a renderer.
5. **`lib/printer.ts` transport remains untested**, as before this change.
6. One full-suite run showed a single `components/pos/DiscountSheet.test.tsx` failure that did not reproduce on re-run or when the `components` project ran alone (51/51 passed). Treated as a pre-existing cross-project flake; that file was not touched here.

---

## Merge evidence (for squash)

- **RED 1** `1e6e632` — reproducers for Drawer intake + online-order drawer totals; compile-time RED (`amountPaid` / 3rd arg / missing module).
- **GREEN 1** `266024b` — Drawer intake implemented; `npx jest` 169 suites / 2630 tests passed. Includes the mid-cycle fix for the duplicated source rule caught by the mount guardrail.
- **RED 2** `3dfa656` — reproducer for print timing; compile-time RED (missing `./print-trigger`).
- **GREEN 2** `c2e4325` — print timing implemented; `npx jest` 170 suites / 2640 tests passed, `tsc --noEmit` clean.
