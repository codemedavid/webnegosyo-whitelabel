# Phase D3 — composing and sending transfers from the merchant app

**Date**: 2026-08-01
**Branch**: `feat/platform-supabase-order-parity`
**Source plan**: written inline this session (no `*.plan.md` artifact), confirmed
by the user with two decisions taken as recommended — one-tap Send rather than
draft-and-review, and the live route probe left as a standing gap.

Closes the gap Phase D2 recorded: *"app can RECEIVE + cancel only — cannot
compose or send (route supports all 4; the screen deliberately doesn't, and
doesn't say so)."*

## User journeys

1. As a **branch manager** standing in a shop with spare stock, I want to send
   some of it to another branch from my phone, so that the shop about to run out
   gets it without anyone opening a laptop.
2. As an **owner**, I want to move stock out of any branch or out of the store
   pool, so that I can rebalance the chain from wherever I am.
3. As **either**, I want to be told what my own shelf is holding while I compose,
   so that I do not draft a load that the ledger will refuse at send time.
4. As **either**, I want a transfer whose send failed to be finishable, so that a
   dropped connection does not leave work only the web admin can clear up.

## What this phase did NOT need

`POST /api/inventory/transfers` already accepted all four actions with Zod
validation and re-resolved authority in the `...With` services, and
`submitTransferStep` already typed `create`/`send`/`cancel`. **No server change,
no migration, no new authority path.** The work was entirely app-side.

## Task report

### 1. What a branch may put on a van (`lib/transfer-draft.ts`)

RED `2a60e66` → GREEN `9fd0c3e`.

```
$ npx jest lib/transfer-draft.test.ts        # RED
error TS2307: Cannot find module './transfer-draft' or its corresponding type declarations.
Test Suites: 1 failed, 1 total

$ npx jest lib/transfer-draft.test.ts        # GREEN
Tests:       22 passed, 22 total
```

Compile-time RED, caused by the missing implementation itself — the intended
signal, not unrelated breakage.

**Guaranteed**: availability is computed from the SOURCE BRANCH's shelf; an
ingredient the branch holds none of (or shows negative, or shows sub-epsilon
dust) is dropped rather than offered at zero; the picker is alphabetical, not
worst-first; a branch account cannot send from another branch or from the store
pool; a blank/nonsense/zero/negative quantity is `null`, never coerced to zero;
and every refusal is worded exactly as `validateTransferDraft` words it.

### 2. Drafts and dispatch on the bench (`lib/inventory-transfers.ts`)

RED `a8d5a51` → GREEN `b0ca1e7`.

```
$ npx jest lib/inventory-transfers            # RED
error TS2305: Module '"./inventory-transfers"' has no exported member 'isAwaitingDispatch'.
ENOENT: no such file or directory, open '.../components/TransferComposeSheet.tsx'
Test Suites: 2 failed, 2 total
```

**Guaranteed**: `isAwaitingDispatch` is `draft` and nothing else; the bench sort
became three-tiered, so a stranded draft ranks below a box awaiting a count but
above received history rather than sinking under a week of it.

### 3. The compose sheet and the wiring

GREEN `b0ca1e7`.

```
$ npx tsc --noEmit                            # clean
$ npm test                                    # webnegosyo-app
Test Suites: 102 passed, 102 total
Tests:       1731 passed, 1731 total          # was 1696 before this phase
```

Three decisions the source guards lock:

- **The source shelf is re-read, never inherited.** The shelf already on screen
  is `inventory_items.current_qty` — the chain roll-up — whenever an owner is
  looking at the whole store. Composing from it would offer a chain's 700 g of
  flour as sendable out of a shop holding 40. `TransferComposeSheet` calls
  `loadInventoryStock(tenantId, sourceOutletId)` and refetches on every source
  change; a failed read leaves the picker EMPTY, deliberately, for the same
  reason the shelf screen shows zeros rather than the roll-up.
- **The compose entry sits OUTSIDE `TransferBenchPanel`.** That panel returns
  `null` until something has moved, so an entry inside it would leave a store
  that has never transferred permanently unable to start one. Gated on
  `outlets.length > 1` instead.
- **The sheet is handed the ACCOUNT's scope, not the viewed one.** An owner
  drilled into North is still an owner; the drill-down narrows a view, it does
  not demote the account.

### 4. Finishing a stranded draft

GREEN `b0ca1e7`. Send is create-then-send, two route calls, so a failed second
call leaves a real draft behind. The bench row now offers **Send** and **Cancel**
for `draft` only — once stock is in transit the sole way to close a load is to
receive what turned up, so the reversal keeps exactly one path rather than two
that must agree. The screen reloads the shelf and the list even when the send
half throws, because the draft is real and must appear or the merchant composes
it twice.

### 5. The two doors onto the transfer service

`371b451`. **Passed 9/9 on first run — no RED, and that is correct**: a
characterization test closing a composition gap, not a bug fix. Proven
non-vacuous by MUTATION rather than a manufactured RED:

```
# added `if (input.lines.length > 50) throw ...` to createTransfer only
✕ createTransfer does nothing the app would miss
Tests:       1 failed, 8 passed, 9 total
# service file restored; git diff --stat clean
```

**Guaranteed**: every step has a `...With` variant the app's bearer token can
reach, and each cookie variant is a single delegating statement — a rule added
to the web door alone now fails the build instead of silently applying to the
browser and not to the phone.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Availability is the source branch's shelf, never the chain roll-up | `lib/transfer-draft.test.ts:offers what the shelf in front of the merchant holds` | unit | PASS |
| 2 | A shelf holding none of an ingredient drops it instead of offering zero | `…:drops an ingredient the branch holds none of` | unit | PASS |
| 3 | Negative and sub-epsilon on-hand are not sendable stock | `…:drops an ingredient the branch is showing negative`, `…:treats round-trip dust as nothing` | unit | PASS |
| 4 | The send picker reads alphabetically, not worst-first | `…:lists the picker alphabetically rather than worst-first` | unit | PASS |
| 5 | An over-drafted line is named, not merely counted | `…:names the line that is too big rather than answering yes or no` | unit | PASS |
| 6 | An ingredient absent from the shelf is over-drafted at any quantity | `…:counts an ingredient missing from the shelf as over-drafted` | unit | PASS |
| 7 | A branch account cannot send from another branch or the store pool | `…:confines a branch account to its own branch`, `…:refuses a branch account the store pool` | unit | PASS |
| 8 | A blank or nonsense quantity is refused, never read as zero | `…:refuses a blank box`, `…:refuses something that is not a number` | unit | PASS |
| 9 | Draft refusals are worded exactly as the server words them | `…:refuses … in the server's words` (×4) | unit | PASS |
| 10 | The store pool is a place, so pool→pool is same-branch | `…:treats the store pool as a place, not as an absent branch` | unit | PASS |
| 11 | Only a draft is awaiting dispatch; a sent load is not | `lib/inventory-transfers.test.ts:a draft nobody has loaded yet` | unit | PASS |
| 12 | A stranded draft outranks history but not a box being counted | `…:puts a draft above finished work but below a box waiting to be counted` | unit | PASS |
| 13 | The sheet judges through the shared pure rules, not beside the JSX | `lib/inventory-transfers-mount.test.ts:judges the draft through the shared rules…` | source guard | PASS |
| 14 | The sheet reads the source branch's own shelf | `…:reads the source branch's own shelf rather than reusing the one on screen` | source guard | PASS |
| 15 | Composing is reachable when no transfer has ever been made | `…:can start a transfer even when none has ever been made` | source guard | PASS |
| 16 | Composing is offered only to a multi-branch store | `…:offers composing only to a store with more than one branch` | source guard | PASS |
| 17 | A draft can be sent or cancelled from the phone | `…:offers a draft its own actions` | source guard | PASS |
| 18 | Transfers are still not a tab | `…:registers no transfers tab in any workspace` | source guard | PASS |
| 19 | Both client doors onto the transfer service stay in agreement | `tests/unit/inventory-transfer-client-parity.test.ts` | source guard | PASS (mutation-proven) |

## Coverage

```
$ npx jest lib/transfer-draft.test.ts lib/inventory-transfers.test.ts --coverage \
    --collectCoverageFrom='lib/transfer-draft.ts' --collectCoverageFrom='lib/inventory-transfers.ts'
File                    | % Stmts | % Branch | % Funcs | % Lines
 inventory-transfers.ts |     100 |      100 |     100 |     100
 transfer-draft.ts      |     100 |      100 |     100 |     100
```

Full suites: app **1731 passed / 102 suites**; web **4643 passed, 8 skipped /
375 suites**. `npx tsc --noEmit` clean in `webnegosyo-app`. `npm run lint`
reports nothing on any file this phase touched (the repo's 87 pre-existing
errors are all in `webnegosyo-desktop/` and bundled output).

## Known gaps

- **Still nothing run on a device, and no rebuild.** The route has never been
  called by a real phone. Every screen-level guarantee above is a SOURCE guard,
  because the app's Jest only picks up `lib/` and `theme/`.
- **No live probe of this path.** Left deliberately: a probe would have to seed
  a real inventory item on a live 2-outlet tenant (neither multi-outlet tenant
  has any) and, unlike the raw-SQL probes of phases 1–E, an HTTP round trip
  cannot be rolled back. `tests/integration/inventory-live-e2e.test.ts` remains
  the natural harness and still belongs to a concurrent session.
- **The compose sheet cannot save a draft for later** — Send is the only action.
  A merchant who wants to review before dispatch still uses the web admin.
- The `unique_violation` retry path in the stock trigger is still unprobed
  (needs two concurrent sessions), unchanged from phase 1.

## Merge evidence

RED `2a60e66` (transfer-draft missing) → GREEN `9fd0c3e` (22/22).
RED `a8d5a51` (`isAwaitingDispatch` + `TransferComposeSheet` missing) → GREEN
`b0ca1e7` (app 1731/1731, tsc clean). Characterization guard `371b451`, 9/9,
mutation-proven. No refactor commit — the one refactor (folding the panel's
receive path into a shared `step` helper) landed inside `b0ca1e7` with the
suite green.
