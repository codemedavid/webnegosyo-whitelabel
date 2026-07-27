# TDD evidence — inventory observability (Phase B)

**Source plan** — no `*.plan.md`. Journeys derived from the user's report: *"we dont have
enough clarty as well on waht's happening"*, sequenced as Phase B of A → B → C.

## User journeys

1. As a merchant, I want to know **which ingredient** took a dish off my menu, so I can restock
   the one thing that brings it back instead of auditing every recipe by hand.
2. As a merchant, I want to know **why nothing is happening**, so I can tell an inert setup apart
   from a working one on a quiet day.
3. As a merchant, I want to see **what inventory has been doing**, in one place and in order,
   rather than opening every ingredient and merging its history in my head.

## The problem this closes

Inventory could be switched on and be completely inert, and it looked identical to working. The
live proof is `brewdazeexpress` — the only tenant with `inventory_enabled` — whose real state had
to be discovered by hand-querying Postgres during this session:

| | value |
|---|---|
| ingredients | 1 |
| ingredients with a reorder level | 0 |
| base recipes | 0 |
| dishes on the menu | 51 |
| stock movements ever | 1 |

Nothing in the product said any of this. After this change the Overview tab states it directly:
**"No dish has a recipe"** and **"No reorder levels set"**, each with what to do about it.

## Task report

### 1. `auto-86-blame.ts` — which ingredient hid this dish

The exact inverse of `auto-86.ts`. It borrows that module's two rules rather than inventing looser
ones: only a **base** recipe may be blamed (an addon's ingredient never held the dish down), and
only a dish carrying the `auto_disabled_at` ownership marker counts (without it a person made the
choice, and crediting the system would be a lie about their own menu).

A dish hidden with *nothing* blocking it is reported as such — the recovery path should have put it
back, and that it did not is a stuck state a merchant otherwise cannot see at all.

- RED: `Cannot find module '../../src/lib/inventory/auto-86-blame'`
- GREEN: `npx jest tests/unit/inventory-auto-86-blame.test.ts` — 9 passed

### 2. `inventory-health.ts` — why nothing is happening

A gap is deliberately **not** a warning about the future; it is a statement that some part of the
system *currently cannot fire*, plus the reason. Five: `no-ingredients`, `no-recipes`,
`no-reorder-levels`, `alerts-off`, `auto-86-off`. An empty shelf suppresses the rest rather than
listing beside them — with nothing to deduct, no recipe or threshold can matter yet, and listing
them would bury the one thing to do first.

- RED: `Cannot find module '../../src/lib/inventory/inventory-health'`
- GREEN: `npx jest tests/unit/inventory-health.test.ts` — 11 passed

### 3. `activity-feed.ts` — what has been happening

Interleaves every ingredient into one timeline and folds an order's rows into the one sale that
actually happened. Grouped by order **and reason**, never order alone: a cancellation reverses its
sale under the same order id, so grouping by order would net the two to zero and erase the single
most important event on the feed.

Wording is taken from the existing `MOVEMENT_REASON_LABELS`; a second vocabulary would let the feed
and the per-ingredient history call one event by two names.

- RED: `Cannot find module '../../src/lib/inventory/activity-feed'`
- GREEN: `npx jest tests/unit/inventory-activity-feed.test.ts` — 7 passed

### 4. Wiring — Overview tab

`getRecipeCoverage` was widened to return the raw `menu_items` and `recipes` it already reads,
rather than adding a second pass over the same three tables. The one genuinely new read is
`activity-feed-read.ts`, capped at 120 rows.

That read reports its own failure rather than borrowing the meaning of a quiet day — the same
defect fixed in the coverage read earlier this session, where a PostgREST `error` (which is *not* a
thrown exception) rendered as confidently empty.

Timestamps format on the client only. SSR locale formatting is a hydration bug this codebase has
already shipped twice.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A hidden dish names the empty ingredient responsible | `inventory-auto-86-blame.test.ts:names the empty ingredient` | unit | PASS |
| 2 | Every blocking ingredient is named, not just the first | `…:names every empty ingredient` | unit | PASS |
| 3 | In-stock ingredients of the same recipe are not blamed | `…:leaves the in-stock ingredients out` | unit | PASS |
| 4 | A dish hidden with nothing blocking it is still surfaced | `…:blocked by nothing` | unit | PASS |
| 5 | A merchant-hidden dish is never credited to the system | `…:ignores a dish the merchant hid themselves` | unit | PASS |
| 6 | An addon-only ingredient is never blamed | `…:does not blame an ingredient reached only through an addon` | unit | PASS |
| 7 | Ingredients split into ok / low / out, archived excluded | `inventory-health.test.ts:splits ingredients` | unit | PASS |
| 8 | "No dish has a recipe" is reported when nothing will deduct | `…:no dish has a recipe` | unit | PASS |
| 9 | "No reorder levels" is reported when low can never fire | `…:no ingredient has a reorder level` | unit | PASS |
| 10 | Both feature flags being off are each reported | `…:alerts being switched off`, `…:auto-86 being switched off` | unit | PASS |
| 11 | An empty shelf suppresses the other gaps | `…:blocks everything else` | unit | PASS |
| 12 | One order's rows collapse into a single sale | `inventory-activity-feed.test.ts:collapses the ingredients of one order` | unit | PASS |
| 13 | A cancellation does not net out the sale it reverses | `…:does not merge a cancellation` | unit | PASS |
| 14 | A grouped sale is dated by its earliest row | `…:dates a grouped sale by its earliest row` | unit | PASS |
| 15 | An unnameable ingredient costs a name, not the entry | `…:survives an ingredient it cannot name` | unit | PASS |

## Coverage and known gaps

Full suite: **244 suites, 2833 passed, 8 skipped**. `tsc --noEmit` clean; eslint clean on all eight
changed files.

Two expectations of mine were corrected during GREEN rather than the implementation bent to fit
them, both recorded here because the distinction matters:

- I asserted `'Waste'` / `'Order cancelled'`. The product's existing shared label map says
  `'Wasted'` / `'Order voided'`. Aligning to the established vocabulary is right; a second one
  would let two screens disagree about the same event.
- I asserted an order between two entries sharing a timestamp. That tests the sort's incidental
  stability, not behaviour. Narrowed to what matters: the two must not merge.

**Not covered.** The Overview component itself has no rendering test — every rule behind it is
pure and tested, but the composition is not. The live check was read-only (`brewdazeexpress`, table
above); no end-to-end proof that the tab renders that state in a browser.

**Not deployed.** This branch is 240+ commits ahead of `origin/main` with no upstream. Nothing here
is on any deployed site.
