# TDD evidence — Multi-branch inventory, Phase 2 (write path)

**Source plan**: inline `/ecc:plan` output (multi-branch inventory), confirmed 2026-07-31.
**Branch**: `feat/platform-supabase-order-parity`
**Checkpoints**: RED `a44dadf` → GREEN `1551d07`
**Predecessor**: [Phase 1](./multi-branch-inventory-phase1.tdd.md)

## What this phase closes

Phase 1 gave stock a location (`inventory_stock`, one row per item per branch)
but changed no observable behaviour: `applyOrderStockMovements` carried no
outlet, so every movement landed in the unbranched store pool and a two-branch
store still shared one pile of flour in practice. This phase makes the write
path branch-aware.

Scope note: this covers the **write** half of Phase 2. Branch-scoping the
**reads** and narrowing the still-role-only inventory RLS are not done — see
Known gaps.

## User journeys

1. As a branch owner, I want a sale at one shop to deplete only that shop's
   stock, so that my branches stop draining each other.
2. As a branch owner, I want a cancelled order to put stock back where it came
   from, so that a cancellation cannot move stock between shops.
3. As a store owner, I want a register to be unable to spend another branch's
   stock, so that a compromised or misconfigured device is contained.

## Task report

### Task 1 — depletion carries the order's branch

`applyOrderStockMovements` / `applyOrderStockBestEffort` /
`applyOrderRevisionStockBestEffort` gained an `outletId` parameter (defaulting to
`null` = store pool), written onto every `stock_movements` row.
`resolveMovementOutletId` in `stock-location.ts` normalises blank/absent to NULL.

- **RED**: `npx jest --testPathPatterns="inventory-order-stock-branch"` →
  `1 suite failed, 7 of 7 tests failed.` No ledger row carried `outlet_id`.
- **GREEN**: same command → `7 of 7 passed`.

### Task 2 — a reversal returns stock to the branch it left

The reversal's netting key was `(item, entered_unit)`; it is now
`(item, entered_unit, outlet)`, and the branch is carried onto the `void` rows.

- **Guaranteed**: an order that spent flour at two branches no longer nets into
  one unbranched row. Without the branch in the key that single row would take
  stock out of one pool and credit another, leaving the branch that actually
  spent it permanently short.
- The branch is read off the **recorded movement**, never re-resolved from the
  order. Those can disagree once an order's branch is corrected, and a sale and
  its reversal must not be able to disagree.

### Task 3 — every call site takes the branch from a server-verified source

| Call site | Source of the branch | Why |
|---|---|---|
| `src/app/actions/orders.ts` | the already-validated `resolvedOutlet` | re-checked against the tenant's own outlets before the order was written |
| `src/app/api/inventory/customer-order-stock/route.ts` | `orders.outlet_id` on the stored order | route is **public**; a caller who could name the branch could deplete an unrelated shop |
| `src/app/api/inventory/order-stock/route.ts` | the authenticated `app_users.outlet_id` | a register belongs to the shop it stands in — the same rule push registration follows |

No call site reads a branch from the request body.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Every ledger row carries the branch that took the order | `inventory-order-stock-branch.test.ts:stamps the branch…` | unit | PASS |
| 2 | A single-location tenant still writes an unbranched movement | `…:leaves the branch unset for a store with no branches` | unit | PASS |
| 3 | A blank branch is the store pool, not a branch named "" | `…:reads a blank branch as the store pool…` | unit | PASS |
| 4 | A reversal credits the branch recorded on the sale | `…:credits the branch recorded on the sale, not the order` | unit | PASS |
| 5 | Two branches' movements reverse separately | `…:keeps two branches apart instead of netting them into one row` | unit | PASS |
| 6 | Two movements at the SAME branch still net to one row | `…:still nets two movements at the SAME branch into one row` | unit | PASS |
| 7 | A pre-Phase-2 unbranched sale reverses into the store pool | `…:reverses an unbranched sale back into the store pool` | unit | PASS |
| 8 | The public route spends the branch stored on the order, ignoring the body | `api/inventory-customer-order-stock.test.ts:spends the branch recorded on the order` | integration | PASS |
| 9 | A register spends its own account's branch | `api/inventory-order-stock.test.ts:spends the branch the register-s own account belongs to` | integration | PASS |
| 10 | A branch named in the request body is ignored | `…:ignores a branch named in the request body` | integration | PASS |
| 11 | A store-wide account resolves to the unbranched pool | `…:resolves a store-wide account to the unbranched pool` | integration | PASS |

## Validation

```
npx jest --testPathPatterns="inventory"
  → Test Suites: 66 passed, 1 skipped, 67 total
  → Tests: 701 passed, 8 skipped, 709 total

npx eslint <the 8 changed files>  → exit 0
```

`npx tsc --noEmit` reports no errors in any file changed by this phase. Errors do
appear elsewhere under `src/` (`actions/convex.ts`, `actions/hero-designer.ts`,
`lib/checkout-leads/*`) — those belong to a concurrent session working in the
same tree, confirmed by `git log` on those paths.

## Coverage

```
npx jest --testPathPatterns="inventory-(order-stock|stock-location|stock-ledger)" --coverage \
  --collectCoverageFrom="src/lib/inventory/order-stock-service.ts" \
  --collectCoverageFrom="src/lib/inventory/stock-location.ts"

File                    | % Stmts | % Branch | % Funcs | % Lines
order-stock-service.ts  |   89.49 |    63.76 |      75 |   89.49
stock-location.ts       |     100 |      100 |     100 |     100
```

Statement coverage is above the 80% threshold. Branch coverage on
`order-stock-service.ts` (63.76%) is **below** it; the uncovered branches are the
pre-existing error/rollback paths (claim-release on throw, alert-path failures),
not code added by this phase.

## Known gaps

1. **Not proven against a database.** Phase 1's trigger was probed live; this
   phase's wiring is unit-tested only. Production has **0 recipes**, so no real
   order depletes anything and an end-to-end probe would require building a
   menu-item + recipe + component fixture.
2. **Reads are not branch-scoped.** The admin inventory table, low-stock
   evaluation and the merchant app still read `inventory_items.current_qty` —
   the roll-up. That is correct for an owner and wrong for a branch manager, who
   currently sees chain-wide totals.
3. **Inventory RLS is still role-based.** No `outlet_id` predicate, so a branch
   manager can read and write every branch's stock rows. Application-level
   scoping above is not a boundary.
4. **`src/types/database.ts` / `src/types/supabase.ts` remain stale** — they do
   not know `inventory_stock` or `stock_movements.outlet_id`. The inserts pass
   through `as never` casts that predate this phase, so nothing breaks, but the
   new column is untyped.
5. **Convex-backed tenants**: the public customer route reads `orders.outlet_id`
   from the platform database. A Convex tenant's order is not there, so its
   depletion resolves to the store pool. Those tenants keep today's behaviour
   rather than gaining branch-aware stock.
6. Two new `never`-typed mock assertions in `tests/unit/api/inventory-order-stock.test.ts`
   follow a pre-existing typing quirk in that file rather than fixing it.

---

# Phase 2, part 2 — reads and RLS

**Checkpoints**: RED `b99928d` → GREEN `7e1825c` → wiring `b426287` → RLS `ec16342`

## User journeys

4. As a branch manager, I want the stock screen to show what MY shop holds, so
   that I do not count my shelf against the whole chain's total.
5. As a branch manager, I want a delivery I record to land in my own shop.
6. As a store owner, I want to see what every shop holds of an ingredient, so
   that I know which one to transfer from.
7. As a store owner, I want a branch manager to be unable to touch another
   shop's stock even if they bypass the app.

## Task report

### Task 4 — `src/lib/inventory/branch-stock-view.ts` (new)

- **RED**: `npx jest --testPathPatterns="inventory-branch-stock-view"` →
  `1 suite failed`, module unresolvable.
- **GREEN**: same command → `14 of 14 passed`.
- `applyBranchStock` writes the branch's quantity back onto the item's own
  `current_qty` / `reorder_level`, mirroring `applyOutletMenuOverrides`. The
  table, low-stock evaluation and the CSV export become branch-aware at one seam.
- A branch holding none reads **zero**, never the roll-up.

### Task 5 — manual movements carry a branch

`recordStockMovementWith` resolves the author's scope from `app_users` (never the
request) and runs it through `resolveMovementBranch` before any read or write.

### Task 6 — RLS confinement (`20260809120000_inventory_branch_rls.sql`, APPLIED)

One `app_user_may_reach_branch(tenant, outlet)` predicate shared by
`inventory_stock` and `stock_movements`. Probed against **real production
accounts**:

| tenant | account | branch A | branch B | store pool |
|---|---|---|---|---|
| cafejuancho | store-wide owner | reach | reach | reach |
| cafejuancho | store-wide admin | reach | reach | reach |
| gungjeon-unlimited | manager @ Central Cignal | reach | **refused** | **refused** |

`stock_movements` keeps SELECT+INSERT policies only, so the ledger stays
append-only.

## Test specification (part 2)

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 12 | A store-wide account still sees the roll-up | `inventory-branch-stock-view.test.ts:leaves the roll-up alone…` | unit | PASS |
| 13 | A branch account sees only its own branch's quantity | `…:shows a branch account only what its own branch holds` | unit | PASS |
| 14 | A branch holding none reads zero, not the chain total | `…:shows zero rather than the chain total…` | unit | PASS |
| 15 | The branch's own par level applies | `…:applies the branch-s own reorder level` | unit | PASS |
| 16 | An ingredient the branch never stocked stays listed | `…:keeps every ingredient listed…` | unit | PASS |
| 17 | The owner's breakdown lists an empty branch as zero | `…:lists a branch holding nothing rather than omitting it` | unit | PASS |
| 18 | The owner may receive into any branch or the pool | `…:lets the owner receive into whichever shop they picked` | unit | PASS |
| 19 | A manager naming no branch still lands in their own | `…:pins a branch manager to their own branch when they name none` | unit | PASS |
| 20 | A manager naming another shop is refused, not redirected | `…:refuses a branch manager naming another shop` | unit | PASS |

## Validation (part 2)

```
npx jest --testPathPatterns="inventory"
  → Test Suites: 67 passed, 1 skipped, 68 total
  → Tests: 718 passed, 8 skipped, 726 total

npx eslint <changed files> → exit 0
```

## Known gaps (part 2)

1. **`applyBranchStock` and `branchStockBreakdown` are not called by any screen
   yet.** The modules and their rules are proven; the admin inventory page, the
   merchant app and the owner's cross-branch view still read the roll-up. Wiring
   the UI is the next step and is where journeys 4 and 6 actually become visible
   to a user.
2. **A branch manager can no longer see store-pool stock.** Deliberate —
   unbranched stock is the store's — but it means a tenant that switches on
   branches with existing unbranched stock leaves its managers seeing nothing
   until that stock is branched or transferred. No live tenant is in this state
   (the only inventory tenant has no branches), but there is no migration path
   for one that gets there.
3. **`recordStockMovementWith` adds an `app_users` read per movement.** Not
   batched or cached.
4. Gaps 1, 3, 4, 5 and 6 from part 1 still stand — notably that no part of
   Phase 2 has been proven end-to-end against a database with a real recipe.
