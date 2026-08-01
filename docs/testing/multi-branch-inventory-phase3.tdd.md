# Multi-branch inventory, Phase 3 — transfers

**Source plan** — the multi-branch inventory plan agreed on 2026-07-31 (Phase 3:
`stock_transfers` + lines, `draft → sent → received`, shortfall on receipt posts
as shrinkage against the sending branch, transfer at source cost).

**Branch** `feat/platform-supabase-order-parity`.

## The gap this closes

Phase 2 ended with an owner's panel that says "North → South" and nothing that
performs it. Until now the only way to correct an imbalance was to waste stock
at one branch and receive it at the other — which lies twice in the ledger and
destroys the one figure shrinkage reporting depends on.

## User journeys

1. As an owner, I want to move stock from a branch that has too much to one that
   has run out, so a shop can trade today without an emergency purchase.
2. As a branch manager, I want to send stock to another branch, so I am not
   waiting on head office to move a sack of flour.
3. As a receiving manager, I want to record what actually turned up, so a
   shortfall is somebody's question rather than my missing stock.
4. As an owner, I want the chain's total to be unchanged by a transfer, so
   moving stock never looks like buying or losing it.

## Task report

### 1. The pure core — state machine and ledger arithmetic

RED `c305b41` → GREEN `1abf4a0`.

```
npx jest --testPathPatterns="inventory-stock-transfer"
RED:   Cannot find module '@/lib/inventory/stock-transfer' — 0 of 22 run
GREEN: Test Suites: 1 passed  Tests: 23 passed
```

Decisions the tests pin, with the reason each is not the obvious alternative:

- **Every leg is a real ledger movement**, never a swap between `inventory_stock`
  rows. A swap moves the number with nothing recording who moved it. It also
  keeps the roll-up invariant for free: the two legs net to zero, so
  `inventory_items.current_qty` correctly does not move — the store still owns
  the same flour.
- **Send writes one leg.** Stock in transit is on neither shelf; crediting the
  destination early would let it sell goods that are still on a van.
- **A shortfall posts as `waste` against the SENDING branch.** It is not the
  receiver's loss (it never reached them) and not still at the sender (their
  `transfer_out` already took it off).
- **Only when something is missing.** A zero-quantity waste row on every clean
  transfer would drown the real ones.
- **Receiving more than was sent is refused**, not honoured — honouring it
  creates stock from nothing.
- **`sent → cancelled` is impossible.** A status flip does not put the stock
  back. A lost load is closed by receiving zero, so there is one reversal path
  rather than two that must agree forever.

### 2. Schema — APPLIED and probed

Commit `44eb692`. Migration `supabase/migrations/20260811120000_stock_transfers.sql`,
applied to production and probed in a rolled-back transaction against
`gungjeon-unlimited`'s real outlets.

```
sender balance (expect 390)                   390.0000
receiver balance (expect 90)                   90.0000
roll-up (expect 480 = 500 - 10 short)         480.0000
branch sum equals roll-up                     OK
ledger legs linked to the document (expect 3) 3
same-branch transfer                          rejected
receive more than sent                        rejected
duplicate ingredient line                     rejected
unknown status                                rejected
cross-tenant destination branch               ACCEPTED — no schema guard
```

**The probe found a real hole.** A foreign key proves an outlet exists, not that
it is *this store's*, so a transfer could name another tenant's branch as its
destination. No stock could have moved — `apply_stock_movement()` already
rejects a cross-tenant branch — which makes it a paper hole rather than a stock
one, but the paper is what a person acts on. Closed with a trigger (a `CHECK`
may not read another table) and re-probed:

```
cross-tenant destination                  rejected: Transfer destination branch belongs to a different store
cross-tenant source                       rejected: Transfer source branch belongs to a different store
own two branches                          accepted
redirect to another store after the fact  rejected
store pool as the source                  accepted
```

### 3. Authority and receipt counting

RED `19a197e` → GREEN `109681b`.

```
RED:   9 failed / 23 passed — canSendTransfer is not a function
GREEN: Test Suites: 1 passed  Tests: 32 passed
```

The two ends are not interchangeable. A branch may send only its own stock and
never the unbranched pool — pool stock belongs to the store, which is what the
RLS predicate already says about reading it. Only the destination may count a
delivery in: a sender declaring their own delivery received makes every
shortfall unfindable, which is the one thing the document exists for.

`resolveReceiptLines` refuses an uncounted line rather than defaulting it.
Defaulting to the amount sent assumes the load was intact — the assumption the
receive step exists to stop — and defaulting to zero accuses the sender of
losing stock nobody looked for.

### 4. The service

RED `bf16d8b` → GREEN `4a490f7`.

```
npx jest --testPathPatterns="stock-transfer"
GREEN: Test Suites: 2 passed  Tests: 47 passed
npx tsc --noEmit   → no errors in any file changed here
npx eslint <changed files> → exit 0
```

**A fault the test found.** The service stub has no `auth`, which surfaced that
attribution ran *after* the ledger legs were written — so a failed identity
lookup would have left the stock moved and the document still saying it had not
been. Attribution now never throws.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A transfer walks draft → sent → received | `inventory-stock-transfer.test.ts` | unit | PASS |
| 2 | A transfer cannot be received before it is sent | same | unit | PASS |
| 3 | A sent transfer cannot be sent again or cancelled | same | unit | PASS |
| 4 | A transfer to the same branch is refused | same | unit | PASS |
| 5 | A line needs a positive quantity and may appear once | same | unit | PASS |
| 6 | Sending deducts from the source and credits nothing | same | unit | PASS |
| 7 | Receiving credits the destination with what arrived | same | unit | PASS |
| 8 | A shortfall posts as waste against the sending branch | same | unit | PASS |
| 9 | A clean transfer writes no waste row | same | unit | PASS |
| 10 | Receiving more than was sent is refused | same | unit | PASS |
| 11 | A load that never arrived posts entirely as shrinkage | same | unit | PASS |
| 12 | Arriving stock is valued at the source branch cost | same | unit | PASS |
| 13 | A branch may send only its own stock, never the pool | same | unit | PASS |
| 14 | Only the destination may count a delivery in | same | unit | PASS |
| 15 | An uncounted line is refused, not assumed intact | same | unit | PASS |
| 16 | A draft writes no stock movement | `inventory-stock-transfers-service.test.ts` | unit | PASS |
| 17 | The legs reach `stock_movements`, not `inventory_stock` | same | unit | PASS |
| 18 | Every refusal writes nothing at all | same | unit | PASS |
| 19 | The counted quantity is recorded against the line | same | unit | PASS |
| 20 | Branch totals and the roll-up agree after a transfer | live probe, `20260811120000` | integration | PASS |
| 21 | A transfer cannot name another store's branch | live probe, re-probe | integration | PASS |

## Coverage and known gaps

`npx jest --testPathPatterns="inventory"` → 809 passed, 8 skipped, 4 failed.
The 4 failures are in `tests/unit/inventory-branch-stocktake.test.ts`, which is
**untracked work belonging to a concurrent session** on this tree, not part of
this change. Every suite touched here passes.

Gaps, stated plainly:

- **There is no user interface.** Nothing in the web admin or the merchant app
  can draft, send, or receive a transfer. The service is reachable only from
  code, so the owner's panel still names a direction nobody can act on.
- **No server actions and no route.** The service is written to be called from
  one; that call site does not exist yet.
- **Never run against a real recipe or a real tenant's inventory.** Production
  still has no tenant with both branches and inventory, so the whole path is
  proven by unit tests plus a synthetic probe, not by a merchant moving a sack
  of flour.
- **Transfers are not on any report.** The daily report already buckets
  `transfer_out`/`transfer_in` separately (commit `449e780`), but nothing lists
  transfers as documents, so "what is in transit right now?" has no answer.
- **The transfer's own `waste` leg is indistinguishable from ordinary waste** on
  the movement history beyond its note. Shrinkage reporting will count it, which
  is intended, but nothing separates "lost on a transfer" from "dropped in the
  kitchen".
- **`stock-service.ts` still carries its own copy of `resolveActingBranchScope`.**
  The shared module exists and the transfer service uses it; deduplicating the
  original was reverted because another session is actively editing that file
  and the refactor destroyed its uncommitted work once.
