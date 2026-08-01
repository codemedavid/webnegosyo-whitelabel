# TDD evidence — Multi-branch Phase 6b: a storefront that cannot load its branches

**Branch**: `feat/platform-supabase-order-parity`
**Source plan**: none on disk. Identified during the `/ecc:plan` audit in this session as a drift between two shipped decisions, and taken next because it de-risks the Phase 9 pilot.

## The conflict this resolves

Two earlier decisions, both correct, contradicted each other in code.

**Phase 1, Decision E** — recorded in `multi-branch-outlets-phase-1.tdd.md`:

> Outlet read failures **fail loudly**. Degrading to "no branches" renders the single-outlet flow for a multi-branch merchant and sends the order to the wrong kitchen.

**Phase 3** then shipped the opposite. `menu-server.tsx` logged a warning and fell back to `[]`, for a reason just as real: a throw there blanks the entire menu, which is the regression commit `38b4ede` had already fixed once for the dish query.

Nothing recorded the reversal, so the codebase silently held the losing side of Decision E: a multi-branch merchant whose outlet query failed got today's single-location storefront, and any order placed during that window would be cooked at whichever branch happened to read the ticket.

## The resolution

Stop treating "show the menu" and "accept an order" as one question.

The menu still renders — Phase 3's concern is untouched, and nothing throws. What stops is **ordering**. Expressing that as a value rather than an exception is what lets the server component and the client read the same decision without either of them catching anything.

`resolveOutletAvailability` **fails open** by design: only a confirmed failure at an opted-in tenant blocks. A tenant that never enabled branches never issued the query, so it can never be blocked by that query failing — verified by an explicit test for the impossible-but-stale combination.

One judgement call worth flagging: an opted-in tenant with **zero branches configured** is allowed to take orders. Blocking there would close a merchant's shop the moment they ticked the feature box, and there is no wrong kitchen to protect — there is only one.

## User journeys

1. As a customer of a multi-branch restaurant, I want to be told when the branch list cannot load, rather than unknowingly ordering from the wrong kitchen.
2. As a multi-branch merchant, I want a branch outage to stop orders rather than misroute them, because a lost order costs less than one cooked in the wrong city.
3. As a single-location merchant, I want branch logic to be incapable of closing my shop.
4. As a merchant who just enabled the feature, I want my storefront to keep working before I have created my first branch.
5. As any customer, I want the menu to keep rendering even when branches fail — a blank restaurant page helps nobody.

## Task report

### Task 1 — own the decision in one pure place

`src/lib/outlets/outlet-availability.ts`. No database, no throw, no React.

- **RED**: `npx jest --testPathPatterns="outlets-availability"` → `Cannot find module '../../src/lib/outlets/outlet-availability'`, `Test Suites: 1 failed`, `Tests: 0 total`. Committed as `7422c9b`.
- **GREEN**: same command → `Tests: 12 passed, 12 total`.

The customer-facing string is asserted to contain none of "error", "failed", "exception" or "query" — a customer can act on none of that, and a storefront should not read like a stack trace.

### Task 2 — carry the failure instead of swallowing it

`menu-server.tsx` keeps its `console.warn` and its `?? []` fallback, so the menu renders exactly as before. What changed is that the failure is now also **returned** as `outletsFailed`, threaded through `page.tsx` into `MenuClient`.

The two early-return paths report `outletsFailed: false` deliberately: both already render an error state for a tenant that could not be loaded at all, and a branch warning on top of "Restaurant not found" would be noise.

### Task 3 — block ordering, not rendering

`MenuClient` resolves availability once and guards `handleItemSelect` — the same function that already refuses to add an item when the shop is outside its operating hours. Mirroring that guard means the block lands on the one path every add-to-cart flows through, with the toast treatment customers already see for a closed shop.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A single-location tenant can always order | `outlets-availability.test.ts:lets a single-location tenant order` | unit | PASS |
| 2 | A stale failure flag cannot close a shop that never had branches | `…:is unaffected by a failure flag it could not have produced` | unit | PASS |
| 3 | Branches that loaded let customers order | `…:lets customers order when the branches loaded` | unit | PASS |
| 4 | A merchant with one branch can order | `…:lets customers order at a merchant with a single branch` | unit | PASS |
| 5 | Enabling the flag before creating a branch does not close the shop | `…:still lets customers order when the merchant configured no branches yet` | unit | PASS |
| 6 | A failed branch load stops ordering | `…:stops ordering rather than guessing the branch` | unit | PASS |
| 7 | The customer is told why | `…:explains itself to the customer` | unit | PASS |
| 8 | A partial branch list still stops ordering | `…:stops ordering even if a partial list came back` | unit | PASS |
| 9 | The message leaks no diagnostic vocabulary | `…:says nothing about branches the customer cannot act on` | unit | PASS |
| 10 | A missing outlet count does not block | `…:treats a missing outlet count as no branches` | unit | PASS |
| 11 | Undefined input never throws | `…:never throws on a fully undefined input` | unit | PASS |
| 12 | Unknown input fails open | `…:defaults an unknown input to letting the customer order` | unit | PASS |

## Regression evidence

```
npm run test     → Test Suites: 1 skipped, 259 passed, 259 of 260 total
                   Tests:       8 skipped, 3176 passed, 3184 total
npx tsc --noEmit → 24 errors, all pre-existing and all in unrelated test files.
                   Zero in menu-server.tsx, menu-client.tsx, page.tsx or
                   outlet-availability.ts — verified by grepping the output per path.
npm run lint     → 87 pre-existing errors / 711 warnings repo-wide.
                   Zero on any file changed by this phase, same verification.
```

The full suite rose from 3164 to 3176 passing tests — the 12 new ones, with nothing displaced.

## Known gaps / remaining work

- **The block is on the menu page only.** A customer who already has items in their cart can still reach checkout during a branch outage. The narrow window that matters — picking a branch and adding an item — is closed, but `useCheckout` does not yet consult `resolveOutletAvailability`. Closing it needs the flag carried into the cart/checkout route, which do not currently receive it.
- **Not observed against real data.** `outlets` still holds 0 rows and no tenant has the flag on, so this path has never run against a real failing query. The decision logic is fully covered; the wiring is not.
- **No component test** renders the toast or asserts that the menu still paints while ordering is blocked.
- The server does not enforce this. `createOrderAction` will still accept an order that reaches it — consistent with how operating-hours enforcement works today (also client-side only), but it means the guard is a UX block, not a security boundary. Recorded rather than fixed, because changing it would diverge branch handling from the hours pattern beside it.

## Merge evidence (for squash)

```
7422c9b test: add reproducer for a storefront that cannot load its branches  (RED — module not found, 0 tests ran)
60a04d6 fix: stop a storefront that lost its branches from taking orders anyway  (GREEN — 12 passed;
                                                                                  full suite 3176 passed)
```
