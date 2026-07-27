# TDD evidence — making auto-86 visible, and making its marker sound

**Source plan:** the top known gap carried forward from Phase 5C and Phase 7 —
"no screen reads `auto_disabled_at`". Journeys derived during this run.

## Why this was the next thing

`menu_items.auto_disabled_at` has been written since Phase 5C and read by
nothing. Three of Phase 7's bugs were variations on one failure — a dish
silently off the menu — and the column that would explain it was invisible.

Investigating the read side turned up a **second, worse** problem: the marker
was never released. Both are fixed here.

## User journeys

- As a merchant scanning my menu, I want to see which dishes the system pulled
  for stock, so I can tell a missing bestseller from one I hid on purpose.
- As a merchant, when I hide a dish myself, I want it to stay hidden — a
  delivery must never put it back on sale against my decision.
- As a merchant, I want the phone and the browser to say the same thing about
  the same dish.

## Part 1 — the marker outlived its meaning (defect)

Auto-86 recovery re-enables only items still carrying `auto_disabled_at`. That
is what makes it safe. But **no manual toggle ever cleared the marker**, on
either the web admin or the merchant app, so the safety inverted into the exact
failure it was added to prevent:

1. stock runs out — auto-86 hides the dish, stamps the marker
2. merchant re-enables it — marker still set
3. merchant deliberately hides it — marker **still set**, on a dish they chose
4. delivery arrives — recovery puts it back on sale, overruling them

Fixed on both surfaces: any manual toggle, in either direction, hands ownership
back. Hiding by hand clears the marker too — that is the case that matters,
because it is the one where the merchant's decision was being reversed.

The merchant app's `toggleProductAvailability` test asserted
`toHaveBeenCalledWith({ is_available: false })` — literally *"updates only
is_available"*. That was the correct spec before the marker existed, so it was
**rewritten, not deleted**, the same treatment the superseded 5B test got.

## Part 2 — nothing showed it (the gap)

`describeMenuAvailability` is pure, like `low-stock.ts`, because the web admin
and the merchant app render it differently and must not form separate opinions
about what the state is called.

The label is **"Out of stock"**, not "Auto-disabled": the first names the cause
a merchant can act on, the second describes what the software did.

Two deliberate defensive rules:

- An item whose query omitted the column reads as merchant-hidden, never as
  auto-hidden — a projection gap must degrade to the old behaviour, not invent
  a false claim about the system. (`menu-item-select.ts` documents what that
  class of bug already cost this codebase once.)
- `is_available = true` wins over a surviving marker. Recovery clears the marker
  as it re-enables so it should not occur, but if it did, what a customer can
  actually order is the truth worth showing.

The badge appears **only** on auto-hidden dishes. Badging merchant-hidden ones
too would restore exactly the ambiguity being removed.

## Task report

| Task | Command | Result |
|---|---|---|
| Web toggle releases the marker | `npx jest tests/unit/menu-availability-ownership.test.ts` | RED (2 failed) → GREEN |
| App toggle releases the marker | `cd webnegosyo-app && npx jest lib/products.test.ts` | RED (2 failed) → GREEN |
| Pure availability rule | `npx jest tests/unit/menu-availability-badge.test.ts` | RED (no module) → GREEN |
| Web menu grid badge | `npx jest tests/unit/menu-items-list-auto-hidden.test.tsx` | RED (2 failed) → GREEN |
| App mirror + screen guardrail | `cd webnegosyo-app && npx jest lib/menu-availability.test.ts` | RED (no module) → GREEN |
| Marker semantics against the live DB | `mcp__supabase__execute_sql`, `BEGIN … ROLLBACK` | 4/4 PASS |

### RED / GREEN evidence

```
npx jest tests/unit/menu-availability-ownership.test.ts
● a merchant toggling availability by hand › releases the auto-86 marker when taking an item off sale
  - "auto_disabled_at": null
    "is_available": false
Tests: 2 failed, 2 total                     → 2 passed, 2 total

cd webnegosyo-app && npx jest lib/products.test.ts
● toggleProductAvailability › releases the auto-86 marker when putting a product back on sale
  - "auto_disabled_at": null
Tests: 2 failed, 34 passed, 36 total         → 36 passed, 36 total

npx jest tests/unit/menu-availability-badge.test.ts
  Cannot find module '@/lib/inventory/menu-availability'
Tests: 0 total (suite failed to run)         → 9 passed

npx jest tests/unit/menu-items-list-auto-hidden.test.tsx
Tests: 2 failed, 2 passed, 4 total           → 4 passed, 4 total
```

Full suites after GREEN:

```
npx jest                          → Test Suites: 237 passed   Tests: 2766 passed
cd webnegosyo-app && npx jest     → Test Suites:  48 passed   Tests:  778 passed
npx tsc --noEmit                  → 0 errors in src/ ; merchant app clean
eslint (all changed files)        → clean
```

Commits, all on `feat/platform-supabase-order-parity`:

| Stage | Commit |
|---|---|
| RED | `d9a72aa test: add reproducer for a manual toggle never releasing the auto-86 marker` |
| RED | `0d8c77c test: rewrite the merchant-app toggle spec to release the auto-86 marker` |
| GREEN | `96dff55 fix: release the auto-86 marker when a merchant toggles availability` |
| RED | `eb46993 test: add reproducer for auto-hidden dishes being indistinguishable` |
| GREEN | `5b07941 feat: show which dishes auto-86 took off the menu` |
| RED | `68bce3c test: add reproducer for the merchant app not showing auto-hidden dishes` |
| GREEN | `f7013f1 feat: show auto-hidden dishes in the merchant app too` |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Putting an item back on sale by hand releases the marker | `menu-availability-ownership.test.ts:releases the auto-86 marker when putting an item back on sale` | unit | PASS |
| 2 | Hiding an item by hand releases the marker, so no delivery reverses it | `…:releases the auto-86 marker when taking an item off sale` | unit | PASS |
| 3 | The merchant app hides a product without leaving the marker set | `webnegosyo-app/lib/products.test.ts:releases the auto-86 marker when hiding a product` | unit | PASS |
| 4 | The merchant app un-hides without leaving the marker set | `…:releases the auto-86 marker when putting a product back on sale` | unit | PASS |
| 5 | An item on sale reads as available | `menu-availability-badge.test.ts:reports an item on sale as available` | unit | PASS |
| 6 | An item the merchant hid reads as hidden | `…:reports an item the merchant hid as hidden` | unit | PASS |
| 7 | An item auto-86 hid reads as auto-hidden | `…:reports an item auto-86 hid as auto-hidden` | unit | PASS |
| 8 | A query that omitted the column degrades to merchant-hidden | `…:treats a missing marker column as the merchant hiding it` | unit | PASS |
| 9 | An on-sale item with a stale marker still reads as available | `…:reports an item on sale as available even if a stale marker survives` | unit | PASS |
| 10 | The auto-hidden label names the cause, not the mechanism | `…:names the auto-hidden state after the reason, not the mechanism` | unit | PASS |
| 11 | The two hidden states are worded differently | `…:keeps the merchant-hidden wording distinct from the automatic one` | unit | PASS |
| 12 | The grid says "Out of stock" for an auto-hidden dish | `menu-items-list-auto-hidden.test.tsx:says it is out of stock, not merely hidden` | unit | PASS |
| 13 | The grid leaves a merchant-hidden dish unbadged | `…:leaves a dish the merchant hid unlabelled, so the two are distinguishable` | unit | PASS |
| 14 | The grid says nothing about stock for a dish on sale | `…:says nothing about stock for a dish that is on sale` | unit | PASS |
| 15 | With both kinds listed, only the system's are badged | `…:labels only the dishes the system pulled when both kinds are listed` | unit | PASS |
| 16 | The app's copy of the rule agrees on all five cases | `webnegosyo-app/lib/menu-availability.test.ts` (5 cases) | unit | PASS |
| 17 | The two copies' wording cannot drift apart | `…:uses labels the web rule also declares, so the two cannot drift apart` | unit | PASS |
| 18 | The app screen uses the shared rule, not its own check | `…:labels auto-hidden products through the shared rule, not its own check` | unit | PASS |
| 19 | Marker semantics hold in the real database | live probe | integration | PASS |

## Live probe — `brewdazeexpress`

The tenant that is actually live on inventory. Run through
`mcp__supabase__execute_sql` inside `BEGIN … ROLLBACK`, as separate statements
rather than CTEs — Postgres applies only one UPDATE per row per statement, and
a first attempt written as chained CTEs reported a false `0` for that reason.

| # | Step | Expected | Actual | Verdict |
|---|---|---|---|---|
| 1 | Auto-86 stamps the marker | marked | marked | PASS |
| 2 | The exact payload the fixed toggle sends releases it | unmarked | unmarked | PASS |
| 3 | Recovery cannot reclaim a released dish | 0 rows | 0 rows | PASS |
| 4 | The dish stays hidden as the merchant left it | hidden | hidden | PASS |

Post-rollback verification — nothing leaked:

```
menu_items 51 | available 51 | marked_this_tenant 0 | marked_platform_wide 0
```

## Coverage

```
npx jest --testPathPatterns="menu-availability|menu-items-list-auto-hidden" --coverage \
  --collectCoverageFrom="src/lib/inventory/menu-availability.ts"

File                  | % Stmts | % Branch | % Funcs | % Lines
 menu-availability.ts |     100 |      100 |     100 |     100
```

## Known gaps

- **The badge is a state, not a history.** It says a dish is out of stock, not
  *which* ingredient or *when*. The timestamp is in the column and unused; a
  tooltip naming the ingredient would be the natural next step.
- **No migration was needed** — the column and its partial index shipped in
  `20260729120000` (applied 2026-07-27). Nothing here changes the schema.
- **Still no end-to-end run against real tenant data**, carried over from
  Phase 7. `brewdazeexpress` has an ingredient but no recipes, so nothing yet
  connects a dish to stock and no badge can appear in production.
- The customer-facing storefront is deliberately untouched: a customer should
  see a dish as unavailable, never why.
- Manual alert dismissal and push notification remain open from 5B.
