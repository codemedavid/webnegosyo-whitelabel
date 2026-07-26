# TDD Evidence — Stock movement ledger (Phase 4A)

## Source

No `*.plan.md` file was used. Journeys were derived during this TDD run from the
inline plan agreed in session. Phase 4A was scoped as "stock ledger + manual
receive/adjust". Earlier phases: [1](./inventory-cost-mode.tdd.md),
[2](./inventory-recipe-editor.tdd.md), [3](./inventory-prep-items.tdd.md).

## User journeys

- As a merchant, I want to record a delivery, so the system knows what I have.
- As a merchant, I want to record a stocktake, so the system agrees with what is
  physically on the shelf.
- As a merchant, I want to record waste, so losses are visible instead of
  showing up as an unexplained shortfall later.
- As a merchant, I want to see what is on hand and be warned before I run out.
- As a merchant, I want to know *why* a number is what it is.

## What was actually broken

`inventory_items.current_qty` has existed since the Phase A migration and has
never been written by anything. The column comment still reads *"Phase B
(created now, unused until then)"*. Nothing received stock, nothing counted it,
nothing spent it, and the figure rendered nowhere in the UI.

## Design decision: the ledger is the source of truth

`current_qty` is a running total maintained by a database trigger from
append-only `stock_movements` rows. It is never edited directly.

This matters more than it looks. Three writers will move stock — the web admin
(now), Convex order depletion (4B), and the per-tenant Supabase order backend
(4C). Had each done its own read-modify-write on `current_qty`, two concurrent
movements would lose one of them, and no one could ever answer "why is this
number wrong?". Applying the delta inside the insert serializes concurrent
movements on the item row, and every change leaves a row explaining itself.

The client sends only a **magnitude, a unit and a reason**; the signed delta is
resolved server-side against the quantity read in that same request. A client's
copy can be stale — two staff receiving stock on two tills would otherwise each
write a total based on what they last saw.

## Task report

### Task 1 — The ledger arithmetic

`src/lib/inventory/stock-ledger.ts`: `resolveMovementDelta` (signing + unit
conversion) and `movingAverageUnitCost`.

- **RED**: `npx jest --testPathPatterns="inventory-stock-ledger"`
  → `Cannot find module '@/lib/inventory/stock-ledger'` (compile-time RED).
- **GREEN**: same command → `Tests: 15 passed`.
- **Why pure, and why first**: this is the code every writer shares. A signing
  or conversion mistake corrupts stock silently, for every tenant, and it is the
  one part provable without a database.
- **A stocktake records the discrepancy, not the count.** The merchant reports
  what is physically there; the ledger stores the correction it implies. Both
  numbers survive (`entered_quantity` keeps the count) so the history reads
  honestly.
- **Negative quantities are refused.** "−200g of waste" would silently *add*
  stock. The reason carries direction; the quantity is always a magnitude.
- **Cross-dimension units throw** rather than inventing a conversion.

### Task 2 — The write path

`stock_movements` (migration `20260726120000`), `stock-service.ts`,
`recordStockMovementAction`, and the `stockMovementInputSchema`.

- **RED**: `npx jest --testPathPatterns="inventory-stock-form"`
  → `Cannot find module '@/lib/inventory/stock-form'` (compile-time RED).
- **GREEN**: same command → `Tests: 9 passed`.
- **A blank price means "unchanged", never "free"** — reading it as zero would
  drag the weighted-average cost toward nothing. A test pins this.
- **A blank quantity is refused rather than coerced to 0**, because zero is a
  meaningful stocktake ("we ran out") and must be typed deliberately.
- **The schema already admits `sale`/`void`**, the reasons Phase 4B/4C write, so
  the manual and automatic paths cannot drift apart.

### Task 3 — The merchant-facing surface

On-hand quantity, a low-stock badge, and a Stock dialog (Received / Counted /
Wasted) on every ingredient row.

- **RED**: `npx jest --testPathPatterns="inventory-stock-manager"`
  → `Tests: 5 failed, 1 passed`.
- **GREEN**: same command → `Tests: 6 passed`.
- **The server's figure wins**: the action returns the item as it stands after
  the movement and the list replaces its copy. A test asserts the displayed
  total comes from the response, not from local arithmetic.
- **A reorder level of 0 does not warn.** It means the merchant never set one;
  warning on it would flag every ingredient the moment stock tracking is
  enabled. Both the warning and its absence are tested.

## Test specification

| # | What is guaranteed | Test | Type | Result | Evidence |
|---|--------------------|------|------|--------|----------|
| 1 | A delivery adds stock; waste and sales remove it | `inventory-stock-ledger.test.ts` | unit | PASS | `npx jest inventory-stock-ledger` |
| 2 | A voided order returns stock | same | unit | PASS | same |
| 3 | A stocktake records the discrepancy, not the count | same | unit | PASS | same |
| 4 | A count matching exactly records no movement | same | unit | PASS | same |
| 5 | Entered units are converted to the stock unit before signing | same | unit | PASS | same |
| 6 | A cross-dimension unit is refused, not guessed | same | unit | PASS | same |
| 7 | A negative quantity is refused (it would flip the direction) | same | unit | PASS | same |
| 8 | A new delivery price blends with stock already on hand | same | unit | PASS | same |
| 9 | Negative on-hand stock does not skew the average cost | same | unit | PASS | same |
| 10 | A blank delivery price leaves the cost alone | `inventory-stock-form.test.ts` | unit | PASS | `npx jest inventory-stock-form` |
| 11 | A blank quantity is refused; a typed zero is allowed | same | unit | PASS | same |
| 12 | A movement with no unit is refused | same | unit | PASS | same |
| 13 | Unknown reasons are rejected; `sale`/`void` are accepted | same | unit | PASS | same |
| 14 | On-hand quantity is shown per ingredient | `inventory-stock-manager.test.tsx` | unit | PASS | `npx jest inventory-stock-manager` |
| 15 | A delivery is recorded as a magnitude + reason | same | unit | PASS | same |
| 16 | The displayed total comes from the server, not local math | same | unit | PASS | same |
| 17 | An empty form records nothing | same | unit | PASS | same |
| 18 | Low stock warns; an unset reorder level does not | same | unit | PASS | same |
| 19 | The whole inventory + product-editor surface still passes | `npx jest "inventory\|recipe\|modifier\|menu-item\|addon"` | unit | PASS | 35 suites / 340 tests |
| 20 | No type or boundary regression | `npm run build` | build | PASS | Compiled successfully |

## Coverage and known gaps

```
npx jest --testPathPatterns="inventory-stock" --coverage \
  --collectCoverageFrom="{src/lib/inventory/stock-ledger.ts,src/lib/inventory/stock-form.ts,src/components/admin/inventory-manager.tsx}"

File                    | % Stmts | % Branch | % Funcs | % Lines
All files               |   72.42 |    75.38 |    37.5 |   72.42
  inventory-manager.tsx |   66.49 |    66.66 |   28.57 |   66.49
  stock-form.ts         |     100 |    85.71 |     100 |     100
  stock-ledger.ts       |     100 |    91.66 |     100 |     100
```

The two pure modules — the parts that can corrupt data — are at 100% statements.
`inventory-manager.tsx` is at 66% (up from 56% in Phase 3, and from zero before
that); the uncovered remainder is the ingredient CRUD handlers and `UnitsTab`,
neither touched by this phase. Overall function coverage (37.5%) is below the
80% bar for the same jsdom reason reported in Phases 2–3.

**The significant gaps, stated plainly:**

- **The migration is written but NOT APPLIED.** `stock_movements`, its trigger
  and its RLS policies do not exist in any database yet. Until it is applied,
  recording stock fails at runtime. Nothing in this phase has been exercised
  against a real database.
- **The trigger is untested.** The running-total update, the tenant-mismatch
  guard, and `balance_after` are plain SQL with no test harness in this repo.
  They are the load-bearing part of the concurrency argument above and are
  currently only reasoned about, not proven.
- **`recordStockMovement` has no service-level test.** The repo has no
  Supabase-mocking pattern for services (every existing service test is
  schema-only), so the fetch → resolve → insert → re-read sequence is unverified
  as a whole. Its pure inputs and outputs are covered at both ends.
- **RLS is unverified**, as for all prior inventory phases (Phase 7).
- **No stock history UI.** `getStockMovementsAction` exists and returns the
  ledger, but nothing displays it — so "why is this number wrong?" is currently
  answerable only via SQL. This is the main reason to keep 4A open.
- **Nothing depletes stock on an order yet.** That is Phase 4B (Convex) and 4C
  (tenant Supabase). Until then the ledger only moves when a merchant moves it.
- Movements are append-only by convention, not enforced — no policy blocks an
  `UPDATE` or `DELETE` on `stock_movements`, which would desynchronize
  `current_qty` from its history.

## Environment note

A second Claude session has been committing to this branch throughout. Only this
task's paths were staged; both checkpoints were verified reachable from `HEAD`.

## Merge evidence (checkpoint commits)

| Commit | Stage |
|---|---|
| `8d3d20d` | RED — reproducer for the stock movement ledger |
| `214b744` | RED — reproducers for stock movement form and manager UI |
| `e49c8dd` | GREEN — ledger + manual receive/stocktake/waste |

Lint: `npx eslint` over every changed file → clean.
