# Multi-branch inventory, D1 — the merchant app's shelf

**Source plan** — the remaining-tasks plan agreed on 2026-07-31, which ordered
D1 first on the grounds that it is the only outstanding item that fixes
something currently wrong for a real user rather than adding a surface.

**Branch** `feat/platform-supabase-order-parity`.

## A correction to the Phase C report

`docs/testing/multi-branch-inventory-phase-c.tdd.md` claimed the merchant app
"renders alerts from the same pure view module, so it gains the branch name for
free." **That is wrong.** `webnegosyo-app/lib/inventory-stock.ts:9` states it
plainly: the app reads no `stock_alerts` at all and derives low/out itself from
`inventory_items.current_qty` against `reorder_level`.

So there was no branch name to gain. What there was instead is the same
blindness Phase C fixed on the web alert path, fully live on the surface a
branch manager actually uses — `inventory-service.ts` contained zero
occurrences of `outlet`.

## The gap this closes

`inventory_items.current_qty` is the chain roll-up. A two-shop store holding
700 g of flour at North and none at South showed **750 g to the manager standing
at South**, who then could not cook with it.

## User journeys

1. As a branch manager, I want the phone to show what is on **my** shelf, so I
   find out I cannot cook before a customer orders.
2. As a branch manager, I want a delivery I record to land on the shelf I am
   looking at, so the number I see and the number I change are the same shelf.
3. As a merchant who has never configured branches, I want the screen to behave
   exactly as it did yesterday, and to cost no extra query.

## Task report

### D1a. `applyBranchStock` and the branch-scoped read

RED `56034f2` → GREEN `80e88aa`.

```
npm --prefix webnegosyo-app test -- inventory-stock.test.ts inventory-service.test.ts
RED:   2 suites failed to run — TS2305 no exported member 'applyBranchStock'
                                TS2554 loadInventoryStock expected 1 argument, got 2
GREEN: Tests: 51 passed, 51 total
```

Compile-time RED: the tests name the missing capability, and nothing unrelated.

**A branch with no row holds ZERO, never the roll-up** — the rule separating
stock from `outlet_menu_items`, where a missing override inherits. A price is a
setting; a quantity is a physical fact about one shelf, and inheriting it would
report the same sack of flour as present at every branch at once.

**The reorder level goes the other way and falls back to the store's.** That
level is the merchant's standing answer to "warn me when it gets this low".
Dropping it would silently switch off every low-stock warning a tenant already
relies on, on the day they turned branches on — and they would find out by
running out. This mirrors `branchLevelInputs` on the web, deliberately unlike
`applyBranchStock`'s web namesake in `branch-stock-view.ts`, which reports
configuration rather than deciding whether to interrupt someone.

`undefined` returns the caller's own array and skips the `inventory_stock` query
entirely, so a single-shop tenant pays nothing and behaves exactly as before.
`null` is different — the unbranched pool, a real shelf.

**A failed branch read leaves rows at zero rather than falling back to the
roll-up.** Showing a manager the chain's flour labelled as their own is the
precise failure being fixed, and it is worse than an empty shelf: one is wrong
quietly, the other is obviously wrong.

### D1b. The write has to reach the same shelf

RED `39f32da` → GREEN `af5d954`.

```
npm --prefix webnegosyo-app test -- inventory-screen-mount.test.ts
RED:   Tests: 4 failed, 13 passed, 17 total
GREEN (all inventory suites): Tests: 90 passed, 90 total
```

Grounding the write path turned up that reading alone would have been **worse
than the blindness it fixed**. The app's movement path had no branch either, so
a manager would see South's zero, record a 50 kg delivery, and have it land in
the unbranched pool — their shelf still reading zero, the stock somewhere they
did not put it. The number they see and the number they change would be
different shelves.

`src/app/api/inventory/movement/route.ts:147` **already accepted and vetted**
`outletId` server-side — `resolveMovementBranch` refuses a manager naming
another shop. The app simply never sent it. The fix is therefore three small
edits, not a new authority path.

The screen derives one `outletId` from `useBranchScope()` and passes it to both
the read and the sheet, so the two cannot disagree. It is `undefined` rather
than `null` for a store-wide view: `null` would show an owner only the stock
predating their branches. The branch is omitted from the request body entirely
when absent, so a single-shop tenant's request is byte-for-byte unchanged.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A branch sees its own shelf, not the chain total | `inventory-stock.test.ts` | unit | PASS |
| 2 | A branch with no row reads zero, never the roll-up | same | unit | PASS |
| 3 | The unbranched pool is a real shelf of its own | same | unit | PASS |
| 4 | A blank branch id reads as the pool, not a branch named "" | same | unit | PASS |
| 5 | No branch named returns the caller's own array | same | unit | PASS |
| 6 | A branch's own reorder level is used once set | same | unit | PASS |
| 7 | The store threshold applies until a branch sets one | same | unit | PASS |
| 8 | A branch quantity may go negative rather than clamp | same | unit | PASS |
| 9 | The caller's rows are not mutated | same | unit | PASS |
| 10 | The branch figure reaches the level, not just the number | same | unit | PASS |
| 11 | The read shows a branch manager their own shelf | `inventory-service.test.ts` | unit | PASS |
| 12 | No branch named reads no `inventory_stock` at all | same | unit | PASS |
| 13 | A failed branch read gives zero, not the roll-up | same | unit | PASS |
| 14 | The screen scopes through the shared hook | `inventory-screen-mount.test.ts` | source guard | PASS |
| 15 | The branch reaches the query, not a post-filter | same | source guard | PASS |
| 16 | Drilling into another branch refetches | same | source guard | PASS |
| 17 | The movement is recorded against the shelf on screen | same | source guard | PASS |

## Coverage and known gaps

```
npm --prefix webnegosyo-app test -- inventory
Test Suites: 5 passed, 5 total
Tests:       90 passed, 90 total

npx tsc --noEmit -p webnegosyo-app/tsconfig.json  → no errors in the changed files
npx eslint <5 changed files> → exit 0
```

Full app suite: **1637 passed, 5 failed**. The 5 are in
`count-session-service.test.ts`, whose source file is **untracked** and whose
test is modified — a concurrent session's in-flight work in the shared tree.
Nothing here touches it.

`npm run lint` at the repo root reports 87 pre-existing errors, all in
`webnegosyo-desktop/` and a bundled file. None are in the files changed here.

Gaps, stated plainly:

- **No merchant has read a branch-scoped shelf on a phone.** Every guarantee
  above is a unit test or a source guard. This has not been run against a real
  branched tenant on a device, and the app has not been rebuilt.
- **The movement write is untested end to end.** The API accepts `outletId` and
  the app now sends it, but no test exercises the pair together, and no real
  delivery has been recorded into a branch from the phone.
- **The three screen guarantees are source guards, not renders.** Jest here only
  runs pure-logic roots, so they assert on the screen source — the same
  arrangement as every other mount guardrail in that directory. A screen that
  satisfied the regex while misbehaving would pass.
- **Stock alerts on the app remain unbuilt**, and correcting the Phase C claim
  does not add them: the app still derives its own levels and reads no
  `stock_alerts` row. It now derives them from the right branch's numbers.
- **C3, the per-branch par level UI, is still not built.**
