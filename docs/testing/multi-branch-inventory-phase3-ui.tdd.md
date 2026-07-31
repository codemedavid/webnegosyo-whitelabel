# Multi-branch inventory, Phase 3 — the transfer screens

**Source plan** — the multi-branch inventory plan agreed on 2026-07-31. This is
the second half of Phase 3: the backend shipped in
[`multi-branch-inventory-phase3.tdd.md`](./multi-branch-inventory-phase3.tdd.md)
and closed with one gap stated plainly — *"There is no user interface."*

**Branch** `feat/platform-supabase-order-parity`.

## The gap this closes

Phase 3 left a service nothing could call. `stock-transfers-service.ts` could
draft, send, receive and cancel a transfer; no route, action, or screen ever
did. The owner's `BranchStockPanel` still named a direction — *North → South* —
that nobody could act on.

## User journeys

1. As an owner, I want to draft a transfer and send it, so a shop that has run
   out can trade today without an emergency purchase.
2. As a receiving manager, I want to count in what actually turned up, so a
   shortfall is somebody's question rather than my missing stock.
3. As anyone, I want to see what is in transit right now, so stock that is on
   nobody's shelf is not simply forgotten.
4. As a branch manager, I want to be shown only what I may do, so I do not
   compose a transfer I will be refused at the end of.

## Task report

### 1. Presenting a transfer — `transfers-view.ts`

RED `8b5ef1f` → GREEN `43c60fe`.

```
npx jest --testPathPatterns="inventory-transfers-view"
RED:   Cannot find module '@/lib/inventory/transfers-view' — 0 of 21 run
GREEN: Test Suites: 1 passed  Tests: 21 passed
```

**The offered actions run through the service's own predicates** —
`canSendTransfer`, `canReceiveTransfer`, `canTransitionTransfer` — rather than a
parallel set of conditionals. A screen that offers a button the service then
refuses teaches the merchant its rules by rejecting them, which is how a manager
concludes the system is broken while it is working exactly as designed.

Sending and cancelling both belong to the **source**: each acts on stock still
on the sender's shelf. Receiving belongs to the **destination** alone, which is
the single rule that keeps a shortfall findable.

A branch that has since been removed reads as *Former branch* rather than a raw
id or a blank — the document is fine, and it should not look corrupt.

### 2. Reading them — `transfers-read.ts`

RED `24b623a` → GREEN `f53b2dc`.

```
npx jest --testPathPatterns="inventory-transfers-read"
RED:   Cannot find module '@/lib/inventory/transfers-read' — 0 of 6 run
GREEN: Test Suites: 1 passed  Tests: 6 passed
```

Through the RLS server client, so the `stock_transfers` policy is what limits
the rows — **either end** may see a transfer, because hiding it from one branch
makes a shortfall unexplainable.

Two shape rules the tests pin. Ingredient names are joined in, because a
transfer listing raw item ids cannot be checked against a physical box — the
only thing a transfer is ever checked against. And `NUMERIC` is coerced at the
boundary: comparing a string sent quantity against a numeric received one would
report every clean transfer as short.

An uncounted line stays `null`, never `0`. Zero would read as *nothing arrived*
on a delivery nobody has looked at.

**Correction made during this cycle**: the reproducer's row shape was wrong —
the unit lives on `inventory_units` via `stock_unit_id`, not as a column on
`inventory_items`. Fixed before implementing.

### 3. The server actions — `inventory-transfers.ts`

RED `168db43` → GREEN `d7f9a61`.

```
npx jest --testPathPatterns="inventory-transfer-actions"
RED:   Cannot find module '@/app/actions/inventory-transfers' — 0 of 12 run
GREEN: Test Suites: 1 passed  Tests: 12 passed
```

A separate module from `inventory.ts` on purpose: that file is the stock
ledger's surface, and a transfer is a document with a lifecycle. Folding four
more actions in would bury the one seam where a branch acts on another branch's
stock.

The two validation rules differ deliberately:

- **Draft quantities must be positive.** A zero-quantity line writes a ledger
  leg that moves nothing while claiming a transfer happened.
- **Receipt counts must be non-negative.** Zero is how a lost load is closed —
  and the only way, since `sent → cancelled` is impossible.

A branch id is **nullable, not optional**: `null` is the store pool, a real
place, and an absent field would be indistinguishable from a form that failed to
send one.

### 4. The panel — `stock-transfers-panel.tsx`

RED `e1515dc` → GREEN `a43bdf0`.

```
npx jest --testPathPatterns="inventory-transfers-panel"
RED:   Cannot find module '@/components/admin/stock-transfers-panel' — 0 of 14 run
GREEN: Test Suites: 1 passed  Tests: 14 passed
```

Receiving expands **inline rather than in a dialog**. Counting a delivery in
means standing at a bench reading lines off a box; a modal that hides the
transfer behind the form makes the merchant remember what they are checking
instead of looking at it.

**Each count field starts at what was sent.** The common case is an intact load,
and starting blank would make the honest path the laborious one — which is how a
merchant learns to skip the step the document exists for. Changing a figure is
then a deliberate act, which is what recording a shortfall should be.

A shortfall is named *before* it is committed, because it books shrinkage
against the sending branch — not something to discover afterwards.

The direction arrow is decorative with an `sr-only` "to". An `aria-hidden` icon
between two branch names announces as "North South" — the reading that sends
stock the wrong way. The same fault `BranchStockPanel` already fixed.

**A duplication the RED run exposed**: the group heading and each row both said
"In transit". The row label now appears only in the mixed "Completed" group,
where it actually discriminates.

### 5. The workbench and the route

RED `ac7d3d9` → GREEN `050b59c`.

```
npx jest --testPathPatterns="inventory-transfers-workbench"
RED:   Cannot find module '@/components/admin/transfers-workbench' — 0 of 8 run
GREEN: Test Suites: 1 passed  Tests: 8 passed
```

**A route of its own** (`/[tenant]/admin/inventory/transfers`) rather than a tab
on the inventory page. Counting a delivery in happens at a receiving bench on a
phone, minutes after a van arrives — a URL that opens directly is worth more
there than one more tab behind a screen built for a desk.

It also avoids editing `inventory-manager.tsx` and `inventory/page.tsx`, both of
which a concurrent session has uncommitted work in. See the hazard note below.

A branch manager's source select is **fixed to their own branch**. That is a
courtesy, not a boundary — `stock-transfers-service.ts` re-checks against
`app_users`, and that is the check that protects the stock. It stops a manager
composing a transfer they would only be refused at the end of.

### 6. Where the entry appears

RED `1d42a79` → GREEN `936e7f0`.

```
npx jest --testPathPatterns="admin-sidebar-visibility"
RED:   1 failed / 18 passed — single-branch store was offered Transfers
GREEN: Test Suites: 1 passed  Tests: 19 passed
```

Hidden unless the store has **both** inventory and more than one branch. A
single shop cannot transfer to itself, and the entry could only lead to a screen
explaining why it is empty.

Deliberately **not** gated on `isBranchScopedAccount`, unlike `/outlets`. That
section is a store-wide list of every branch and not a manager's to read; this
is the manager's own receiving bench, and hiding it would leave a delivery with
nobody able to record it.

The regression lock in that suite gained `/inventory/transfers`. That is
strictly *more* hiding — no tenant gained a section — so it still guarantees
what it was written to guarantee.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A transfer names both ends the way the merchant knows them | `inventory-transfers-view.test.ts` | unit | PASS |
| 2 | The unbranched pool is named, not left blank | same | unit | PASS |
| 3 | A removed branch reads neutrally, not as a raw id | same | unit | PASS |
| 4 | Only a draft offers send and cancel | same | unit | PASS |
| 5 | Only the destination is offered receive | same | unit | PASS |
| 6 | A branch is never offered a way to send the store pool | same | unit | PASS |
| 7 | Stock on neither shelf is flagged as in transit | same | unit | PASS |
| 8 | A shortfall is counted only once a delivery was counted in | same | unit | PASS |
| 9 | Newest first, and the caller's list is not mutated | same | unit | PASS |
| 10 | Lines arrive with ingredient names on them | `inventory-transfers-read.test.ts` | unit | PASS |
| 11 | NUMERIC quantities are read as numbers | same | unit | PASS |
| 12 | An uncounted line stays uncounted, not zero | same | unit | PASS |
| 13 | A failed read yields an empty list, not a crashed page | same | unit | PASS |
| 14 | A draft line must have a positive quantity | `inventory-transfer-actions.test.ts` | unit | PASS |
| 15 | A receipt count of zero is accepted — a lost load | same | unit | PASS |
| 16 | A negative count is refused before reaching the ledger | same | unit | PASS |
| 17 | Every refusal returns as a readable message, never a throw | same | unit | PASS |
| 18 | The panel renders nothing for a single-shop store | `inventory-transfers-panel.test.tsx` | unit | PASS |
| 19 | The transfer's contents are on screen, checkable against a box | same | unit | PASS |
| 20 | The receive count starts at what was sent | same | unit | PASS |
| 21 | A shortfall is warned about before it is committed | same | unit | PASS |
| 22 | Counting in more than was sent is impossible | same | unit | PASS |
| 23 | Drafting and sending reach the server actions | `inventory-transfers-workbench.test.tsx` | unit | PASS |
| 24 | A transfer to the same branch cannot be created | same | unit | PASS |
| 25 | A branch manager's source is fixed to their own branch | same | unit | PASS |
| 26 | A server refusal is surfaced, not silently swallowed | same | unit | PASS |
| 27 | Transfers is hidden from single-shop stores | `admin-sidebar-visibility.test.ts` | unit | PASS |
| 28 | Transfers stays available to a branch manager | same | unit | PASS |

## Coverage and known gaps

```
npx jest --testPathPatterns="inventory|sidebar|transfer"
Test Suites: 1 skipped, 80 passed, 80 of 81 total
Tests:       8 skipped, 909 passed, 917 total

npx tsc --noEmit          → no errors in any src/ file
npx eslint <6 changed files> → exit 0
```

Gaps, stated plainly:

- **Still never run against a real tenant.** Production has no tenant with both
  branches and inventory, so the whole path is proven by unit tests plus the
  earlier synthetic probe — not by a merchant moving a sack of flour. This is
  now the single largest untested risk in the feature.
- **No E2E test.** The route composes six modules that are each unit-tested;
  nothing exercises them together in a browser.
- **The merchant app and POS still cannot transfer.** This is web admin only.
  A manager standing at a bench with the phone app has no way in.
- **Nothing links from the inventory page itself.** The sidebar entry and a
  direct URL are the only routes in; the owner's `BranchStockPanel` still names
  a direction without linking to the screen that performs it. Wiring that would
  mean editing files a concurrent session holds uncommitted.
- **No draft-time stock check.** A merchant can draft a transfer for more than
  the source branch holds; it is refused only when sent, by
  `apply_stock_movement()`. The refusal is correct but late.
- **The ingredient picker is unfiltered.** It lists every ingredient, including
  ones the source branch holds none of.
- **`stock-service.ts` still carries its own copy of `resolveActingBranchScope`**
  — unchanged from the backend report, and still deliberate.

## Hazard note

`inventory-manager.tsx`, `inventory/page.tsx` and `stock-service.ts` all carry a
concurrent session's uncommitted work. Every file added here is new, and the two
existing files touched (`sidebar.tsx`, `admin-sidebar-visibility.ts`) were clean
in `git status` before editing, so no other session's work was staged. This
followed the incident recorded in the backend report, where a refactor of
`stock-service.ts` destroyed another session's uncommitted function.
