# TDD evidence — moving stock when an order is edited

**Source plan**: journeys derived during this TDD run (follows on from `order-editing-in-register.tdd.md`, which left this as a known gap).
**Branch**: `feat/platform-supabase-order-parity`

## What was asked

> "lets fix the order stock we want to be able to fix that as well"

Editing an order rewrote the bill but never touched inventory. The blocker recorded in the previous evidence doc — the concurrent session's `order-stock-claim.ts` — has since landed, so this closes it.

## User journeys

- As a merchant, I want an edit that adds an item to spend that item's ingredients, so my stock counts stay true.
- As a merchant, I want an edit that removes an item to put its ingredients back.
- As a merchant, I want a retried save to move stock once, not twice.
- As a merchant, I want a *second* edit to still move stock — the first one must not lock inventory for the rest of the order's life.
- As a merchant, I want cancelling an edited order to return only what it actually spent.

## Task report

### Task 1 — the difference an edit moves

`lib/order-stock-delta.ts` already existed but groups by **menu item only**. That is right for counting units sold and wrong for stock: a Small Latte and a Large Latte are one menu item but different quantities of milk, so it nets a size swap to zero and leaves the ledger short by the difference. It also carries no option ids, which depletion needs to find a modifier's recipe.

New `webnegosyo-app/lib/pos-stock-revision.ts` keys on the menu item **plus its sorted option ids**.

- **RED** — `npx jest lib/pos-stock-revision.test.ts` → `TS2307: Cannot find module './pos-stock-revision'`. Commit `b4de07a`.
- **GREEN** — 13/13. Commit `f31b7ff`.

### Task 2 — over-restoring a cancelled order that was edited

Found while designing Task 1, and a genuine correctness bug that editing *creates*. `reverseOrderStockMovements` read `reason = 'sale'` rows and negated them one for one. Correct while a sale was the only thing an order could record — but an edit that removes an item writes a `void` correction while the order is still live, so a later cancellation returned ingredients that were already returned.

- **RED** — `npx jest tests/unit/inventory-reverse-edited-order.test.ts`:
  ```
  ● returns only what the order actually spent
    Expected: 400
    Received: 600
  ```
  An order that sold 600 g and gave 200 g back put 600 g on the shelf, inventing 200 g of flour that never existed — which auto-86 would then un-hide dishes on. Commit `06809f3`.
- **GREEN** — 27/27 across all six order-stock suites. Commit `8aad9d9`.

The reversal now nets **every** movement the order recorded, grouped per ingredient *and* entered unit. Grouping on the unit too keeps the audit value coherent: the same ingredient can be recorded in grams by a base recipe and kilograms by an addon. `entered_quantity` is stored unsigned, so it is signed by its own movement before netting — summing raw magnitudes reported 800 g entered for a 400 g net.

The existing reverse suite's stub returns its rows whatever is asked for, so it could not distinguish a query that filters by reason from one that does not. The new suite's stub honours `.eq('reason', …)`, which is exactly the difference under test.

### Task 3 — a claim that does not lock inventory after the first edit

`order_stock_applications` keys its claim on `(tenant, order, reason)`. Every saved revision may spend or return ingredients on an order that already holds both claims, so the second edit was refused as a duplicate and its stock silently never moved.

- **RED** — `npx jest tests/unit/inventory-order-stock-claim-revision.test.ts`, insert omits `revision`. Commit `776a479`.
- **GREEN** — 11/11 across both claim suites. Commit `0ab2b12`.

Migration `20260806120000_order_stock_application_revision.sql` adds `revision INTEGER NOT NULL DEFAULT 0` and moves the unique index onto it. The revision number is the right key: minted by the order's optimistic lock, monotonic per order, and unusable twice without the save itself being refused. The old index is **DROPped** rather than supplemented — leaving it would keep refusing the second edit and make the migration a no-op.

### Task 4 — capturing the "before", and the wiring

- **RED** — `TS2551: Property 'originalStockItems' does not exist on type 'OrderEditContext'`. Commit `b6213aa`.
- **GREEN** — 27/27. Commit `c7d66e5`.

`originalItems` could not serve: it is `RevisedOrderItem[]`, which names its modifiers but carries no option ids. Once the edit begins the before state is gone, so the stock shape is captured on load.

Wiring: a `revise` action on `/api/inventory/order-stock` and `applyOrderRevisionStockBestEffort`, called from `pos-tender.tsx` after the revise and payment land. **Restore is applied before deplete** — for a swap between two dishes sharing an ingredient, taking out before putting back would dip the running total through a floor it never really crossed and auto-86 a dish for the width of one transaction.

The route rejects a revision below 1 rather than defaulting to 0: revision 0 is the original sale's claim, so an edit arriving without one would collide with it and be *silently* refused as a duplicate.

## Test specification

| # | What is guaranteed | Test | Result |
|---|---|---|---|
| 1 | An unchanged order moves no stock | `pos-stock-revision.test.ts:moves nothing when the order did not change` | PASS |
| 2 | Only the added units are spent, not the whole order | `:spends only the added units, not the whole order` | PASS |
| 3 | Removed units go back on the shelf | `:returns the removed units to the shelf` | PASS |
| 4 | A size swap moves stock instead of netting to zero | `:treats a size swap as a real movement, not a no-op` | PASS |
| 5 | Option order does not split one drink into two | `:does not split a line because its options were chosen in a different order` | PASS |
| 6 | Duplicate lines of one configuration net together | `:nets duplicate lines of the same configuration together` | PASS |
| 7 | Both directions are reported when one item grew and another shrank | `:reports both directions when one item grew and another shrank` | PASS |
| 8 | Option ids survive so modifier recipes resolve | `:carries the option ids through so modifier recipes still resolve` | PASS |
| 9 | A deleted menu item moves no stock | `:ignores a line with no menu item rather than moving stock against nothing` | PASS |
| 10 | Cancelling an edited order returns only what it spent | `inventory-reverse-edited-order.test.ts:returns only what the order actually spent` | PASS |
| 11 | One netted reversal row per ingredient | `:writes one netted row per ingredient rather than one per movement` | PASS |
| 12 | An unedited order still reverses exactly | `:still reverses an unedited order exactly` | PASS |
| 13 | A fully-returned ingredient writes no reversal row | `:writes nothing for an ingredient an edit already fully returned` | PASS |
| 14 | The claim records its revision | `inventory-order-stock-claim-revision.test.ts:records the revision the claim belongs to` | PASS |
| 15 | An unrevised claim is revision zero | `:treats an unrevised claim as revision zero` | PASS |
| 16 | A retried save of one revision is still refused | `:still refuses a duplicate claim for the same revision` | PASS |
| 17 | A non-duplicate database error still throws | `:still throws on a database error that is not a duplicate` | PASS |
| 18 | The edit's before-state carries option ids | `pos-edit-mode.test.ts:captures the order's stock items, option ids and all` | PASS |

## Coverage and verification

Merchant app: `npx jest` → **86 suites, 1421 tests, all passing**. `npx tsc --noEmit` → exit 0. `npx expo lint` → **0 errors**.

Web: the eight order-stock suites → **45/45**. `tsc` reports errors only in pre-existing test files (loose test typing; `next build` typechecks `src` only) — none in `src/`, and none introduced here.

## Known gaps

| Gap | Why it is still open |
|---|---|
| **Migration `20260806120000` is not applied** | Until it is, `revision` does not exist and every edit's stock write fails on insert. Best-effort, so the save still succeeds — but no stock moves. **User action.** |
| **Convex v17 still bundled, not deployed** | Unchanged from the previous cycle. |
| Stock movement is best-effort | Deliberate, and consistent with every other order-driven stock write: by the time it runs the bill is rewritten and the money settled. A drifting ledger is reconcilable by stocktake; a save that fails after the customer paid the difference is not. |
| `order-stock-delta.ts` is now redundant for ledger work | Left in place — it is still correct for the unit-level view and has its own tests. Anything touching the ledger should use `pos-stock-revision.ts`; the header of each says so. |
| The revision write is not transactional with the revise | Two directions can partially apply (restore lands, deplete fails). Each is separately claimed, so a manual retry completes the missing half rather than double-applying the done one. |
| Web-side order editing does not move stock | Only the merchant app can edit orders today, so there is no second caller yet. |

## Merge evidence

| Commit | Stage |
|---|---|
| `b4de07a` | RED — `pos-stock-revision` absent |
| `f31b7ff` | GREEN — 13/13 |
| `06809f3` | RED — over-restore, expected 400 received 600 |
| `8aad9d9` | GREEN — 27/27 |
| `776a479` | RED — claim carries no revision |
| `0ab2b12` | GREEN — 11/11, plus migration 20260806120000 |
| `b6213aa` | RED — `originalStockItems` absent |
| `c7d66e5` | GREEN — 27/27, route + service + mobile wiring |
