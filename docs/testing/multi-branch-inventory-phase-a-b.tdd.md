# Multi-branch inventory — proving it, and making the screen honest

**Source plan** — the A→B→C plan agreed on 2026-07-31, following
[`multi-branch-inventory-phase3-ui.tdd.md`](./multi-branch-inventory-phase3-ui.tdd.md),
which closed with *"still never run against a real tenant"* as the largest
untested risk in the feature.

**Branch** `feat/platform-supabase-order-parity`.

## What changed about the risk

`gungjeon-unlimited` now has **`inventory_enabled = true` and
`multi_branch_enabled = true`** with two real outlets (Central Cignal,
Valenzuela) and a real branch-scoped manager. It is the first production tenant
in the configuration this feature was built for and had never run in. It holds
zero inventory items so far, so nothing was at risk — but the Transfers entry is
live in its sidebar, and the clock on "never probed" had started.

## User journeys

1. As an owner, I want a transfer to move stock without destroying any, so my
   books still agree with my shelves afterwards.
2. As a receiving manager, I want a shortfall recorded once, so the branch that
   lost it is answerable for what was actually lost.
3. As an owner drafting a transfer, I want to be offered only what the source
   branch is holding, so I do not compose a load that cannot leave.
4. As an owner looking at a branch that has run out, I want to act on what the
   screen is telling me without having to go and find the feature.

## Phase A — the probe

### A1. The arithmetic, on real branch rows

No code change. One transaction on `gungjeon-unlimited`'s real outlets,
replicating the exact legs `buildSendMovements` / `buildReceiveMovements`
produce, then `ROLLBACK`.

```
Opened:   Central 400 + Valenzuela 100          = 500
Sent:     120 Central -> Valenzuela
Received: 100 (shortfall 20)
Result:   Central 260, Valenzuela 200, roll-up 460, branch sum 460
```

**The chain lost 40 for a shortfall of 20.** The `transfer_out` leg takes the
whole load off the sender at send time; the `waste` leg written on receipt then
removes the missing part a second time.

The trigger and the roll-up invariant were both fine — branch sum equalled the
roll-up throughout. The defect was in the pure module, and every one of its
existing tests passed, because each checked one leg's shape in isolation and
none of them added a pair together.

The code comment stated the reasoning that produced it: *"it is not still at the
sender either (their `transfer_out` already took it off)"* — true, and precisely
why wasting it removes it twice.

### The fix

RED `22ae4a1` → GREEN `a006b7a`.

```
npx jest --testPathPatterns="inventory-stock-transfer\.test"
RED:   Tests: 3 failed, 35 passed, 38 total
       chain net for a 2-unit shortfall: expected -2, received -4
       sending branch net:               expected -10, received -12
       chain net when nothing arrives:   expected -10, received -20
GREEN: Tests: 53 passed, 53 total (both transfer suites)
```

The undelivered quantity is returned to the sender's book before it is written
off. The sender ends down by exactly what left their shelf, and the `waste` leg
— which is what a variance report reads — still names them.

The return leg is a `transfer_in`, not a `void`: `daily-report.ts` buckets
transfers **signed**, so it nets against the `transfer_out` and reads as *"sent
8 net, wasted 2"*. A `void` would land in `saleNet` and claim a sale that never
happened.

Re-probed on the same real rows: **Central 280, Valenzuela 200, roll-up 480,
branch sum 480** — down 20 for a shortfall of 20.

One pre-existing test, *"accepts a load that never arrived at all"*, pinned the
exact leg list and so encoded the double-charge. It now asserts the same intent
against legs that conserve stock.

### A2. The RLS boundary, as a real branch manager

Three transfers created and queried as `manager@centralgunjeon.com` (scoped to
Central Cignal), inside a transaction:

| | Result |
|---|---|
| Sees a transfer **out of** their branch | yes |
| Sees a transfer **into** their branch | yes |
| Sees a transfer touching **neither** | no |
| Total visible | 2 of 3 |
| `app_user_may_reach_branch(tenant, other branch)` | false |
| `app_user_may_reach_branch(tenant, NULL)` — the store pool | false |

Exactly the designed behaviour: either end may see a transfer, because hiding it
from one branch makes a shortfall unexplainable.

**Residue check after every probe**: the tenant still has 0 inventory items,
0 stock rows, 0 movements, 0 transfers, and no `PROBE%` row exists anywhere.

## Phase B — making the screen honest

### B1/B2. Availability comes from the source branch

RED `0d6a96b` → GREEN `b8fa306` (pure module), RED `45b37f4` → GREEN `203643c`
(the screen).

```
npx jest --testPathPatterns="inventory-transfer-availability"
RED:   Cannot find module '@/lib/inventory/transfer-availability' — 0 of 16 run
GREEN: Tests: 16 passed, 16 total

npx jest --testPathPatterns="inventory-transfers-workbench"
RED:   Tests: 6 failed, 9 passed, 15 total
GREEN: Tests: 15 passed, 15 total
```

`transfer-availability.ts` reads the branch row through `stockOnHandAt`, never
`inventory_items.current_qty`. A chain holding 700g of flour across four shops
cannot send 700g from one of them, and the roll-up is exactly the number that
says it can.

A zero-stock ingredient is **dropped** here, which is deliberately the opposite
of `applyBranchStock` keeping it listed in the catalogue: a shelf with nothing
on it is something you can put stock *on* and not something you can take stock
*off*. Negative on-hand is dropped for the same reason — it means a sale landed
before its delivery, and there is still nothing physically there to load.

The selected ingredient is **derived during render**, so switching source branch
cannot leave the picker showing something the new branch has none of.

A failed stock read yields an empty index, offering nothing rather than falling
back to the roll-up. Refusing a legitimate transfer is recoverable; drafting one
the ledger will reject at send is what this exists to prevent.

None of it is a boundary — `apply_stock_movement()` still has the final say.

### B3. The suggestion became actionable

RED `e19cf47` → GREEN `32a2855`.

```
npx jest --testPathPatterns="inventory-branch-stock-panel"
RED:   Tests: 1 failed, 3 passed, 4 total — no accessible element with role "link"
GREEN: Tests: 4 passed, 4 total
```

The link appears only alongside a suggestion. When every branch is out there is
nothing to move — that is a purchasing problem — and a link would lead to a
screen that cannot help. `transfersHref` is optional so a caller with no slug
still renders a working panel.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A clean transfer moves no stock on or off the chain | `inventory-stock-transfer.test.ts` | unit | PASS |
| 2 | A shortfall costs the chain exactly once | same | unit | PASS |
| 3 | The sending branch loses exactly what left it | same | unit | PASS |
| 4 | The receiving branch gains exactly what arrived | same | unit | PASS |
| 5 | The loss is still booked as waste against the sender | same | unit | PASS |
| 6 | A load that never arrives costs the chain the load, once | same | unit | PASS |
| 7 | Only what the source branch holds is offered | `inventory-transfer-availability.test.ts` | unit | PASS |
| 8 | The branch quantity is reported, never the roll-up | same | unit | PASS |
| 9 | A zero or negative shelf offers nothing | same | unit | PASS |
| 10 | The store pool is a source like any other | same | unit | PASS |
| 11 | A line over the shelf is named; one that empties it exactly is not | same | unit | PASS |
| 12 | Rounding dust is not an over-draft | same | unit | PASS |
| 13 | The picker re-offers when the source branch changes | `inventory-transfers-workbench.test.tsx` | unit | PASS |
| 14 | The source branch's on-hand is on screen while deciding | same | unit | PASS |
| 15 | An over-drafted line blocks Create and is named | same | unit | PASS |
| 16 | An empty picker explains itself | same | unit | PASS |
| 17 | The suggestion links to the screen that performs it | `inventory-branch-stock-panel.test.tsx` | unit | PASS |
| 18 | No link when there is nothing to move | same | unit | PASS |
| 19 | A branch manager sees transfers at either end of their branch, and no others | live probe on `gungjeon-unlimited` | manual | PASS |
| 20 | A branch manager cannot reach another branch or the store pool | same | manual | PASS |

## Coverage and known gaps

```
npx jest --testPathPatterns="inventory|transfer|sidebar"
Test Suites: 1 skipped, 85 passed, 85 of 86 total
Tests:       8 skipped, 975 passed, 983 total

npx tsc --noEmit  → no errors in any src/ file
npm run lint      → 953 problems, all pre-existing; none in the changed files
```

Gaps, stated plainly:

- **Still no merchant has moved a real sack of flour.** The probe used real
  branch rows, the real trigger and the real RLS policies, but synthetic stock
  inside a rolled-back transaction. `gungjeon-unlimited` holds zero inventory
  items; the first real transfer will be the first end-to-end run.
- **The shortfall fix is not retroactive.** No production transfer has ever been
  received, so there is no corrupted history to repair — but if one had been,
  nothing here would find it.
- **The merchant app and POS still cannot transfer.** Web admin only.
- **No E2E test.** The route composes eight unit-tested modules; nothing
  exercises them together in a browser.
- **Alerts and auto-86 are still store-wide.** `stock-alerts-service.ts`
  evaluates the roll-up, so a branch at zero raises nothing while the chain
  looks healthy — the same blindness `BranchStockPanel` exists to fix, still
  live on the path that actually interrupts a merchant. That is Phase C.
- **`src/types/supabase.ts` is still stale** and still blocked on the concurrent
  session's tree being clean.

## Hazard note

`inventory-manager.tsx` was **clean** in `git status` when B3 edited it — the
concurrent session had committed. Every other file touched here was either new
or verified clean immediately before editing. One sweep run reported a spurious
failure in `inventory-stock-manager.test.tsx`, which passed in isolation and on
re-run: that file was being written by the other session mid-run.
