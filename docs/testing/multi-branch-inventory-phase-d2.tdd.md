# Multi-branch inventory, D2 — transfers on the merchant app

**Source plan** — the remaining-tasks plan agreed on 2026-08-01. D2 was the last
unbuilt item; phase E is recorded in `multi-branch-inventory-phase-e.tdd.md`.

**Branch** `feat/platform-supabase-order-parity`.

## The gap this closes

Transfers have existed since phase 3, on the web admin only. So the person who
composes a transfer — sitting at a desk with a browser already open — could do
it, and the person who **counts one in** — standing at a bench with a box open,
nowhere near a laptop — could not. That is backwards. Receiving is the step that
most wants a phone, and it is the step the whole document exists for: a transfer
that is assumed to arrive intact is a swap with extra clicks.

## User journeys

1. As a branch manager, I want to count a delivery in from my phone, so the
   count happens at the bench instead of being remembered later.
2. As a branch manager, I want to be told when I am not allowed to move
   somebody else's stock, rather than seeing a generic failure.
3. As a merchant, I want a shortfall I count to be charged to the branch that
   loaded the van, not to mine.

## Task report

### D2a. The route — `POST /api/inventory/transfers`

RED `88a50b8` → GREEN `ce9b1a7`.

```
npx jest --testPathPatterns="inventory-transfers-route"
RED:   Cannot find module '@/app/api/inventory/transfers/route' — 0 of 11 run
GREEN: Tests: 11 passed, 11 total
```

**The service needed a seam, and finding out why was the substance of this
task.** `createTransfer` and its three siblings each built their own client via
`@/lib/supabase/server`, which reads **cookies**. The merchant app authenticates
with a **Bearer token**. Handed a cookie client, the app's request would resolve
no session at all — and `resolveActingBranchScope` would then be deciding branch
authority for nobody, which is precisely the check that stops one shop emptying
another's shelf.

So each function gained a `...With(supabase, ...)` variant taking the caller's
own client, with the original delegating. This is not a new pattern: it is
exactly the `recordStockMovementWith` split the movement route already uses, and
every internal helper in the file already took a `StockActorClient`, so the four
public functions were the only things standing in the way.

**The route decides who may reach transfers; it does not decide authority.**
The services re-resolve the acting account's scope from `app_users` using the
caller's token and run `canSendTransfer` / `canReceiveTransfer` themselves, so a
manager naming another shop is refused by the same code the web admin goes
through. Adding a second authority check here would be a second rule to keep in
agreement forever.

Reach is gated on the `menu` permission, not on role. Every staff member in this
codebase is `role='admin'` — the deliberate choice recorded in the staff work —
so role alone is not a boundary, and a cashier holding only `pos` could
otherwise have sent a transfer and emptied their own shop's shelf onto another's
book. Locked by a test.

### D2b. The app's pure rules and service

RED `dc476b3`/`548f3a4` → GREEN `7378911`.

```
npx jest inventory-transfers          RED: Cannot find module './inventory-transfers'
npx jest inventory-transfer-service   RED: no exported member 'loadTransferLines'
GREEN (whole app suite): 101 suites, 1696 passed
```

**The write goes through the platform; the read goes straight to Supabase.**
That asymmetry is deliberate. A transfer write is two ledger legs that must
agree, a status transition that stops a stale screen sending twice, and a source
unit cost frozen at send time — none of which a client can compose and none of
which RLS can check. A read is only rows the merchant's own RLS already decides
they may see, so routing it through the server would add a hop that protects
nothing.

Rules worth keeping:

- **Both reads fail to empty rather than throwing.** They share a screen with
  the shelf; a crash in the transfer list would take the merchant's stock
  figures down with it. The write is the opposite and surfaces everything —
  somebody is standing at a bench waiting to be told the count landed.
- **The store pool is named "Store", not left blank.** A dangling arrow with
  nothing on one side reads as a bug rather than as the store.
- **An unnameable branch degrades to "Another branch".** Losing the name must
  never lose the direction, because the direction is what decides where somebody
  carries a box.
- **Lines are fetched for every transfer at once**, not per tap, so expanding a
  consignment is synchronous. Fetching on tap leaves an empty box on the screen
  of somebody standing in a stockroom with two bars of signal — which is exactly
  where this is used.

### D2c. The bench panel

Guardrails `51d499b` → GREEN `576978c`.

```
npx jest inventory-transfers-mount
RED:   ENOENT components/TransferBenchPanel.tsx
GREEN: whole app suite 1696 passed
```

**Transfers are not a new tab, and one test exists solely to keep them from
becoming one.** `workspaces.ts` warns that a tab registered with no matching
route file breaks the tab bar for *every* account. Beyond that risk, transfers
are a rare action and have not earned a permanent slot beside the daily shelf.
The panel sits above the shelf on the existing inventory tab — above, because a
box waiting to be counted is a job with somebody standing over it, while the
shelf below is a reference — and renders nothing at all when no stock has ever
moved between shops, which is most stores.

- **Every count field starts at what was sent.** Blank would make the honest
  path the laborious one, and that is how the step stops being done. Same rule
  as the web workbench.
- **A blank or nonsense box is refused, never sent as zero.** Zero is how a load
  that never turned up is written off entirely; typing it by accident would post
  a whole consignment as the sender's shrinkage.
- **Counting in expands inline, not into a modal** — it happens while reading
  lines off a box, and a modal hides the thing being checked against.
- Received and cancelled consignments stay listed, greyed. A list showing only
  live work leaves a merchant unable to confirm they already counted something
  in, and "did I do this?" is the question that gets a load counted twice.
- The screen refetches the shelf after a receipt rather than patching it: a
  receipt can cross a reorder line and 86 a dish, which is not knowable from the
  quantity alone.

### D2e. Validating the draft at the app's door

RED `95f0e9c` → GREEN `a4f9885`. **A gap this phase introduced, found and closed
after the fact.**

```
npx jest --testPathPatterns="inventory-transfers-route"
RED:   Tests: 6 failed, 13 passed, 19 total
GREEN: Tests: 19 passed, 19 total
```

The route passed `lines`, `note` and `counts` straight through to the service,
while the web action parsed the same document with Zod first. **One boundary
trusted its caller and the other did not — for the same document, reached with
the same credentials.** The rule this breaks is explicit: validate at system
boundaries, with a schema where one exists.

`validateTransferDraft` does check the semantics underneath — empty lines, same
branch, duplicates — which is why this was invisible. What it cannot check is
**shape**: a quantity of `"20"` is not greater than zero, so it slips past every
numeric comparison and lands in a database insert, where the error stops being
about the transfer at all and starts being about a uuid cast. A `counts` value
of `"twelve"` is worse: the shortfall is sent minus counted, so a string makes
that arithmetic `NaN`, and a `NaN` delta is a ledger row that means nothing.

Both schemas moved to `src/lib/inventory/schemas.ts` — which already exists for
exactly this, with exactly this rationale — rather than being copied. Two copies
drift, and the copy that drifts is whichever one nobody is looking at.

Two tests exist to stop the guard overreaching: a well-formed draft still gets
through, and **a count of zero is still accepted**. Zero is the only way to
close a consignment that never turned up, since a sent transfer cannot be
cancelled, so a schema demanding a positive count would make a lost load
impossible to close.

### D2d. Permissions

No change. `staff-permissions.ts` already maps `inventory: "menu"`, and
transfers ride the inventory tab, so the route's `menu` check and the tab the
merchant taps are gated by one key. The three synced copies of the registry were
not touched.

## Live checks

Run against the real database (read-only):

| Question | Answer |
|---|---|
| Can a branch manager see a transfer aimed at them? | **Yes** — `stock_transfers_manage_branch` is `may_reach(from) OR may_reach(to)`, so either end qualifies |
| Do the lines inherit that? | **Yes** — `stock_transfer_lines_manage_branch` joins back to the parent transfer |
| Is the embedded select valid? | **Yes** — FKs exist for `stock_transfer_lines → inventory_items → inventory_units` |

The `OR` in that policy is what makes receiving on the phone possible at all: a
destination manager can reach a document whose source branch they cannot see.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Each of the four steps reaches its service | `inventory-transfers-route.test.ts` | integration | PASS |
| 2 | Counted quantities reach the receive step | same | integration | PASS |
| 3 | A tokenless caller is refused | same | integration | PASS |
| 4 | A cashier with only `pos` is refused | same | integration | PASS |
| 5 | A member of another store is refused | same | integration | PASS |
| 6 | A store without inventory on is refused | same | integration | PASS |
| 7 | An unknown action is refused | same | integration | PASS |
| 8 | A step naming no transfer is refused | same | integration | PASS |
| 9 | The service's own refusal reaches the merchant | same | integration | PASS |
| 10 | The direction reads source → destination | `inventory-transfers.test.ts` | unit | PASS |
| 11 | The store pool is named, not blank | same | unit | PASS |
| 12 | An unnameable branch keeps the direction | same | unit | PASS |
| 13 | Only a sent transfer awaits a count | same | unit | PASS |
| 14 | The bench sees what needs counting first | same | unit | PASS |
| 15 | The longest-waiting consignment is first | same | unit | PASS |
| 16 | Sorting does not disturb the caller's array | same | unit | PASS |
| 17 | A sent transfer is worded "In transit" | same | unit | PASS |
| 18 | The step posts with the merchant's own token | `inventory-transfer-service.test.ts` | unit | PASS |
| 19 | The server's reason surfaces, not a generic error | same | unit | PASS |
| 20 | An expired session is caught before the request | same | unit | PASS |
| 21 | A network failure is not swallowed | same | unit | PASS |
| 22 | A failed read yields an empty list, not a crash | same | unit | PASS |
| 23 | Lines are grouped under their transfer | same | unit | PASS |
| 24 | A line without a unit keeps its name | same | unit | PASS |
| 25 | The panel defers ordering and naming to the pure rules | `inventory-transfers-mount.test.ts` | source guard | PASS |
| 26 | Count fields start at what was sent | same | source guard | PASS |
| 27 | The screen reads through the service, not inline SQL | same | source guard | PASS |
| 28 | Transfers are NOT registered as a tab | same | source guard | PASS (lock) |
| 29 | A manager may reach a transfer at either end | live RLS read | manual | PASS |
| 30 | A non-numeric quantity is refused at the door | `inventory-transfers-route.test.ts` | integration | PASS |
| 31 | A line with no ingredient is refused | same | integration | PASS |
| 32 | An over-long note is refused | same | integration | PASS |
| 33 | The refusal is worded for the merchant | same | integration | PASS |
| 34 | A well-formed draft still gets through | same | integration | PASS (lock) |
| 35 | Non-numeric counts are refused | same | integration | PASS |
| 36 | A negative count is refused | same | integration | PASS |
| 37 | A count of zero is still accepted | same | integration | PASS (lock) |

## Coverage and known gaps

```
npx jest --testPathPatterns="inventory"   (web)
Test Suites: 1 skipped, 93 passed, 93 of 94 total
Tests:       8 skipped, 1083 passed, 1091 total

npx jest    (webnegosyo-app)
Test Suites: 101 passed, 101 total
Tests:       1696 passed, 1696 total

npx tsc --noEmit  → clean in both projects for every file touched
npx eslint <changed web files> → exit 0
```

Gaps, stated plainly:

- **The app can receive and cancel, but cannot compose or send.** The route
  accepts all four actions and is tested for all four; the *screen* only offers
  counting in. That was the deliberate scope — receiving is the half that needs
  a phone — but a merchant cannot start a transfer from the app, and the panel
  does not say so.
- **Nothing has been run on a device.** The app has not been rebuilt. Screen
  guarantees are source guards, not renders, because the app's Jest only picks
  up `lib/` and `theme/`.
- **The route was never called by a real phone.** Its tests mock both Supabase
  and the services; the RLS facts above were read from `pg_policies`, not
  exercised as a branch manager.
- **No merchant has moved real stock between branches** — still true after this
  phase, as after every previous one.
- The `...With` refactor is covered only by the existing transfer service suite
  (157 tests across 10 suites, all passing) plus the new route tests. No test
  asserts that `createTransfer` and `createTransferWith` stay in agreement; they
  do so by delegation rather than by a guard.
