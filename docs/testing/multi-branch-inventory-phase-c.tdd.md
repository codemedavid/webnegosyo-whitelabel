# Multi-branch inventory, Phase C — alerting the branch that ran out

**Source plan** — the A→B→C plan agreed on 2026-07-31. Phase C was scoped as
per-branch par levels and alerts, with auto-86 named up front as an explicit
non-goal.

**Branch** `feat/platform-supabase-order-parity`.

## The gap this closes

`stock-alerts-service.ts` evaluated `inventory_items.current_qty` — the chain
roll-up. A two-shop store holding 700g of flour at North and none at South read
as 700g, cleared every threshold, and nobody told South they could not cook.

That is precisely the blindness `BranchStockPanel` was built to make visible in
Phase 2, still live on the one path that actually interrupts a merchant.

## User journeys

1. As a branch manager, I want to be told when **my** shelf runs out, so I find
   out before a customer does.
2. As an owner, I do not want one shop running out to hide a dish at every
   other shop, so a fix for the first journey is not worse than the bug.
3. As a merchant who has never configured branches, I want alerting to behave
   exactly as it did yesterday.

## Task report

### C1. The store's items, restated as a branch's — `branch-stock-levels.ts`

RED `84489b5` → GREEN `1e6e477`.

```
npx jest --testPathPatterns="inventory-branch-stock-levels"
RED:   Cannot find module '@/lib/inventory/branch-stock-levels' — 0 of 11 run
GREEN: Tests: 10 passed, 10 total
```

One seam, so crossings, recovery and the alert row did not each have to learn
about branches.

**The par level falls back to the store's, and `applyBranchStock` deliberately
does not.** That view reports what a merchant has configured, so inventing a
threshold would misreport their configuration. This decides whether to
interrupt someone, and the store-wide level is their standing answer to "tell
me when it gets this low". Without the fallback, turning branches on would
silently switch off every low-stock alert a tenant already depends on — and
they would find out by running out. A branch that sets its own level overrides
the store's in both directions, so a quiet shop is not nagged with a busy one's
threshold.

`undefined` means "no branch named" and returns the caller's own array, so
today's behaviour is preserved exactly rather than approximately. `null` is
different — the unbranched store pool, a real shelf.

### C2. The service and the migration

RED `bd48a92` → GREEN `2b2cb24`.

```
npx jest --testPathPatterns="inventory-stock-alerts-service"
RED:   Tests: 3 failed, 25 passed, 28 total
GREEN: Tests: 30 passed, 30 total
```

Two of the RED-stage tests were **locks that already passed and had to keep
passing**: auto-86 must not fire when only one branch is out, and a caller with
no branch must behave exactly as before, never reading the branch table at all.

### C4. Auto-86 stays on the roll-up — deliberately

`menu_items.is_available` is store-wide. 86ing the chain because one shop ran
out would hide a bestseller everywhere, which is a worse failure than the
blindness it would be fixing. The entry point now computes two sets of
crossings from two different figures, and the comment says why. Per-branch
availability is Phase 5.

## Two defects the probe caught that reading did not

### 1. The branch figure is read after the write

The alert path takes pre-movement rows plus the deltas just applied, because
re-reading would race the running-total trigger. `inventory_stock` gets no such
choice — it is only readable once the ledger row exists, so it comes back
already reduced, and applying the delta to it again invents a crossing.

A shelf going 15 → 5 against a par level of 20 read as 5 → −5: an `out`
crossing, and an alert for stock that never ran out. `rewindToPreMovement` puts
the branch read back on the same footing. Caught when the pre-existing
`inventory-alerts-integration` suite went red, then pinned by two tests written
before the fix.

### 2. A pre-existing index made the whole feature impossible

`idx_stock_alerts_one_open_per_item` was `UNIQUE(tenant_id,
inventory_item_id) WHERE resolved_at IS NULL`. The second branch's alert
violated it. The service swallows its own errors — it runs behind an order that
is already paid for and must never fail a sale — so **the alerts would simply
have stopped appearing, with nothing anywhere saying why.**

Nothing in the code review would have found this: the service was correct, the
migration was correct, and the feature was dead. It surfaced on the first probe
insert after the migration was applied. Dropped and replaced by the two partial
indexes, which cover the same guarantee per branch.

## Live probe

Migration **`20260813120000` APPLIED 2026-07-31** and probed on
`gungjeon-unlimited` (2 real outlets, real branch manager), in a rolled-back
transaction:

| | Result |
|---|---|
| Three alerts for one ingredient (branch, branch, store-wide) coexist | yes — the old index allowed one |
| Central Cignal's manager sees their own branch's alert | yes |
| …and the store-wide alert | yes |
| …and Valenzuela's | **no** |
| Visible total | 2 of 3 |

Residue check: the tenant is left with 0 alerts, 0 probe items, 0 probe units,
and the old index is gone.

The RLS predicate is `outlet_id IS NULL OR app_user_may_reach_branch(...)`,
deliberately unlike `inventory_stock`'s bare predicate. There, NULL is the
unbranched store pool — a real shelf a branch manager has no business reading.
Here it means "about the store", which includes every alert raised before this
migration existed; hiding those would have blinded the accounts most likely to
act on them, on the day the migration ran.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A branch's quantity replaces the chain roll-up | `inventory-branch-stock-levels.test.ts` | unit | PASS |
| 2 | An empty branch reads as out of stock | same | unit | PASS |
| 3 | A branch par level is used once it exists | same | unit | PASS |
| 4 | The store threshold applies until a branch sets its own | same | unit | PASS |
| 5 | A branch threshold overrides a higher store one | same | unit | PASS |
| 6 | No row means zero, never the roll-up | same | unit | PASS |
| 7 | A caller with no branch gets its own array back untouched | same | unit | PASS |
| 8 | A branch that ran out alerts while the chain looks healthy | `inventory-stock-alerts-service.test.ts` | unit | PASS |
| 9 | The alert names the branch it is about | same | unit | PASS |
| 10 | One branch's open alert cannot silence another's | same | unit | PASS |
| 11 | The delta is not counted twice against the branch shelf | same | unit | PASS |
| 12 | A real branch crossing still alerts | same | unit | PASS |
| 13 | Auto-86 does not fire when only one branch is out | same | unit | PASS (lock) |
| 14 | A caller with no branch behaves exactly as before | same | unit | PASS (lock) |
| 15 | Per-branch alert rows can coexist for one ingredient | live probe | manual | PASS |
| 16 | A branch manager sees their own and store-wide alerts, not another branch's | live probe | manual | PASS |

## Coverage and known gaps

```
npx jest
Test Suites: 1 skipped, 367 passed, 367 of 368 total
Tests:       8 skipped, 4536 passed, 4544 total

npx tsc --noEmit  → no errors in any src/ file
npx eslint <4 changed files> → exit 0
```

Gaps, stated plainly:

- **C3 was not built.** There is no admin control for setting a per-branch par
  level. The column exists and the service reads it, so the feature is complete
  and correct without one — the store-wide fallback means every branched tenant
  gets branch-aware alerting today. What is missing is the ability to give a
  quiet shop a lower threshold than a busy one.
- **The alert banner does not say which branch.** `stock-alerts-read.ts` and
  `stock-alerts-view.ts` do not select or render `outlet_id`, so a merchant sees
  "Flour is out" without being told whose shelf. The data is now there; the
  display is not.
- **No merchant has received a branch alert.** Probed against real branch rows,
  real RLS and the real index, but with synthetic rows in a rolled-back
  transaction. `gungjeon-unlimited` still holds zero inventory items.
- **Auto-86 remains store-wide**, by decision. See C4.
- **`src/types/supabase.ts` still does not know `stock_alerts.outlet_id`**,
  along with the rest of its staleness.
