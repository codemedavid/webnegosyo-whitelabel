# Multi-branch inventory, C3 — a branch's own reorder level

**Source plan** — the remaining-tasks plan agreed on 2026-07-31. C3 was the one
Phase C task left unbuilt.

**Branch** `feat/platform-supabase-order-parity`.

## The gap this closes

Phase C taught the alert path to read `inventory_stock.reorder_level` and to
fall back to the store's when a branch has not chosen one, so every branched
tenant has been alerted correctly since. Nothing could **set** the branch
figure. A quiet shop could not be warned at 5 kg while a busy one was warned at
50, and a merchant looking at the panel could not tell whether a branch had a
threshold of its own or was inheriting.

## User journeys

1. As an owner, I want to give a quiet branch a lower reorder level than a busy
   one, so neither is nagged with the other's threshold.
2. As an owner, I want to see at a glance whether a branch has chosen a
   threshold or is inheriting the store's, so I know what is configured.
3. As a merchant, I want setting a threshold to leave my stock alone.

## Task report

### C3a. The write — `branch-par-service.ts`

RED `a3edf0b` → GREEN `c750f44`.

```
npx jest --testPathPatterns="inventory-branch-par-service"
RED:   Cannot find module '@/lib/inventory/branch-par-service' — 0 of 8 run
GREEN: Tests: 8 passed, 8 total
```

**This is deliberately not an upsert, and that is the whole point of the file.**
`inventory_stock.current_qty` is written only by `apply_stock_movement`, and
`inventory_items.current_qty` is a roll-up derived from it. An upsert must
supply `current_qty`, and supplying it on a row that already exists would empty
a physically full shelf from a settings screen — a stock loss with no movement
in the ledger to explain it, which is the one thing the ledger exists to make
impossible.

So: update the level alone, and insert only when there is genuinely no row. The
insert case is not an edge case — it is the quiet-shop case, a branch that has
never received stock and is exactly the one someone wants warned earlier.

The store pool is matched with `IS NULL`. `= NULL` matches nothing in SQL, so
getting this wrong would silently create a second pool row on every save.

Zero is accepted and means "fall back to the store level", because that is
already how `branchLevelInputs` reads an unset branch. Negative is rejected: a
threshold below zero can never be crossed, so it would read as "never warn me"
while looking like a configured number.

### C3b. The line and the panel

RED `854620a` → GREEN `9980663`.

```
npx jest --testPathPatterns="inventory-branch-stock-view"
RED:   Tests: 3 failed, 14 passed, 17 total   (reorderLevel undefined)
npx jest --testPathPatterns="inventory-branch-stock-panel"
RED:   Tests: 3 failed, 5 passed, 8 total
GREEN (all inventory suites): 1046 passed, 8 skipped, 90 suites
```

`BranchStockLine.reorderLevel` reports the branch's **own** level and stays zero
when unset — deliberately not filled in with the store's number, which would
make an inherited threshold indistinguishable from a chosen one.

The panel therefore says outright that *"Branches showing 0 use the store level
of 20 g"*. Without that line a zero reads as "never warn me", the opposite of
the truth, and the one misreading that would leave a shop silently unwatched.

Editing appears only when a save handler is supplied. The panel is rendered
read-only in other places, and a control that silently does nothing is worse
than no control.

**Two RED runs were discarded as invalid before this one.** The first view test
called `branchStockBreakdown(index, itemId, ...)` with the arguments
transposed, so it failed inside `stockOnHandAt` rather than on the missing
field; the first panel test expected an input while rendering without a save
handler, contradicting the read-only lock in the same file. Both were corrected
so the RED failed for the intended reason.

## Live probe

Run against a real two-outlet tenant with real triggers, in a rolled-back
transaction. `stock_movements` takes `quantity_delta`/`balance_after`, not
`quantity`/`unit_id`.

| Branch | current_qty | reorder_level | item roll-up |
|---|---|---|---|
| South — held 700 before its par was set | **700.0000** | 5.0000 | 700.0000 |
| North — par-only row, never stocked | 0.0000 | 50.0000 | 700.0000 |

Both hazards cleared: setting South's threshold left its 700 untouched, and
inserting a par-only row for North did not disturb the roll-up, which still
equals the sum of its branches.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | The level is written onto the branch's own row | `inventory-branch-par-service.test.ts` | unit | PASS |
| 2 | `current_qty` is never touched on an existing row | same | unit | PASS |
| 3 | A branch with no row gets one at zero stock | same | unit | PASS |
| 4 | The store pool is addressed with `IS NULL` | same | unit | PASS |
| 5 | A negative threshold is rejected | same | unit | PASS |
| 6 | A non-numeric threshold is rejected | same | unit | PASS |
| 7 | Zero is accepted as "inherit the store level" | same | unit | PASS |
| 8 | Permission is checked before writing | same | unit | PASS |
| 9 | A line carries the branch's own level | `inventory-branch-stock-view.test.ts` | unit | PASS |
| 10 | An unset branch reports zero, not the store's | same | unit | PASS |
| 11 | A branch with no row reports zero | same | unit | PASS |
| 12 | The panel shows a branch's own threshold | `inventory-branch-stock-panel.test.tsx` | unit | PASS |
| 13 | A zero is explained as inheriting the store level | same | unit | PASS |
| 14 | The typed threshold reaches the save handler | same | unit | PASS |
| 15 | No editing without a save handler | same | unit | PASS (lock) |
| 16 | Setting a par leaves the branch's stock untouched | live probe | manual | PASS |
| 17 | A par-only row does not disturb the roll-up | live probe | manual | PASS |

## Coverage and known gaps

```
npx jest --testPathPatterns="inventory"
Test Suites: 1 skipped, 90 passed, 90 of 91 total
Tests:       8 skipped, 1046 passed, 1054 total

npx tsc --noEmit  → no errors in any src/ file
npx eslint <5 changed files> → exit 0
```

Gaps, stated plainly:

- **No merchant has set a branch threshold.** The probe used real outlets,
  triggers and the real roll-up, but synthetic rows in a rolled-back
  transaction.
- **RLS was not probed for this write.** The service goes through the
  RLS-enforcing server client and `inventory_stock`'s policy is branch-scoped,
  so a manager setting another shop's level should be refused by the database —
  but that specific refusal was not exercised here, unlike the Phase C alert
  probe which did test its policy directly.
- **The save is fire-and-forget.** The action revalidates the page, but a failed
  write surfaces only as the number reverting on refresh — there is no toast.
  A threshold is a setting rather than a quantity, so nothing downstream waits
  on it the way a movement does, but the merchant is not told.
- **Only the web admin can set it.** The merchant app shows branch quantities
  (see `multi-branch-inventory-phase-d1.tdd.md`) but has no par-level control.
- `tests/integration/inventory-live-e2e.test.ts` reports pre-existing `tsc`
  errors from another session's commit. Untouched here; `src/` is clean.
