# TDD evidence — Multi-branch Phase 6: reading the branch back

**Branch**: `feat/platform-supabase-order-parity`
**Source plan**: none on disk. Phase 6 was defined during the `/ecc:plan` audit in this session and approved with "yes start at phase 6". Phases 1–5 are documented in the sibling `multi-branch-outlets-phase-*.tdd.md` files.

## Why this phase exists

Phase 5 wrote the branch onto every order — and nothing ever read it back. A grep for `outlet` across `orders-list.tsx`, `order-card.tsx`, `order-detail-dialog.tsx`, `convex-orders-tab.tsx`, `convex-order-sheet.tsx` and the Messenger formatter returned **zero hits** before this phase. A merchant with three branches saw one undifferentiated queue and could not tell which kitchen a ticket belonged to. Phase 5 gave the data a home; no phase had given it a reader.

## Two facts that shaped the implementation

**The branch is recorded twice, and both must be read.** The platform database has a real `orders.outlet_id` column; Convex and tenant-owned Supabase projects carry the id *and* a name snapshot inside `customer_data`, because their schemas cannot be migrated on demand (the reasoning is recorded in the Phase 5 report). A reader that consults only the column works for 121 platform tenants and silently shows nothing for the 45 on Convex. `getOrderOutletId` reads the column first and falls back to the carrier.

**No SELECT had to change.** `orders-service.ts:66` and `:85` both project `*`, so `outlet_id` and `customer_data` already arrive. This matters: adding a column name to a storefront/admin projection is the exact hazard recorded in `storefront-select-migration-drift`, where a column absent from the live database fails the *whole query*. Phase 6 touches no projection and therefore cannot trigger it.

**The name is a snapshot, never a live lookup.** `getOrderOutletLabel` reads `customer_data.outlet_name` and does not join `outlets`. Renaming a branch next year must not rewrite the tickets it already took — the same rule `payment_method_name` follows.

## User journeys

1. As a merchant with branches, I want each order to show which branch took it, so that I can route the ticket to the right kitchen.
2. As a merchant, I want to filter the order list down to one branch, so that I can work a single outlet's queue.
3. As a merchant whose orders live in Convex or my own Supabase, I want the branch to appear there too, so that my backend choice does not cost me the feature.
4. As a single-location merchant, I want my order list and my Messenger message rendered exactly as they are today — no branch filter, no empty badge, no new line.
5. As a merchant who renamed a branch, I want old orders to keep the name they were placed under.

## Task report

### Task 1 — read the branch off an order

`src/lib/outlets/order-outlet-display.ts` is pure: no database, no throw. It is the read-side mirror of Phase 5's `order-outlet.ts` and imports that module's two carrier-key constants rather than restating the strings.

- **RED**: `npx jest --testPathPatterns="outlets-order-display"` → `Cannot find module '../../src/lib/outlets/order-outlet-display'`, `Test Suites: 1 failed`, `Tests: 0 total`. Committed as `13c25e5`.
- **GREEN**: same command → `Tests: 34 passed, 34 total`.

`customer_data` is untyped JSON arriving from three different databases, so every read is defensive — a string, an array, a number where a name should be, or a whitespace-only value all degrade to "no branch" rather than breaking a merchant's order list.

### Task 2 — show it and filter by it on the web admin

Four surfaces, each mirroring the advance-order treatment already beside it:

| Surface | Change | Mirrors |
|---|---|---|
| `orders-list.tsx` | violet branch badge + "All Branches" filter | the `scheduledLabel` badge and the `orderTypes` filter directly above |
| `order-detail-dialog.tsx` | violet branch banner | the amber "Pre-order · Scheduled for" banner |
| `convex-orders-tab.tsx` | branch badge on each row | its own `scheduledLabel` badge |
| `convex-order-sheet.tsx` | branch banner | its own scheduled banner |

The filter list is derived from the orders on screen — exactly how `orderTypes` is built — so a single-location tenant yields an empty list, the `outlets.length > 0` guard fails, and no branch dropdown renders at all.

Both detail views dump unrecognized `customer_data` keys as raw rows. Left alone, they would have rendered "outlet id: outlet-bgc" and "outlet name: …" beneath the new banner. `outlet_id` and `outlet_name` were added to the existing exclusion lists alongside `scheduled_for_label` and `messenger_psid`, which are excluded for the same reason.

### Task 3 — put it on the Messenger ticket

Messenger is where most merchants actually read their orders; the dashboard is the second place they look. A branch shown only in the dashboard means the person cooking never learns which outlet the order was for.

- **RED**: `npx jest --testPathPatterns="messenger-order-branch"` → `Tests: 2 failed, 5 passed`. The two failures were the tests asserting the branch line; the five negative cases passed already, which is correct — a single-location message was never supposed to change. Committed as `570be42`.
- **GREEN**: same command → `Tests: 7 passed, 7 total`.

`formatOrderMessage` has no generic `customer_data` dump — it picks named keys — so the line had to be added explicitly and the raw id can never leak into the message.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | The branch is read from the column on the platform backend | `outlets-order-display.test.ts:reads the column on the platform backend` | unit | PASS |
| 2 | The branch is read from `customer_data` on Convex / tenant Supabase | `…:falls back to customer_data on backends with no column` | unit | PASS |
| 3 | The column wins when column and carrier disagree | `…:prefers the column when the two disagree` | unit | PASS |
| 4 | A single-location order reports no branch | `…:returns nothing for a single-location order` | unit | PASS |
| 5 | A null or undefined order never throws | `…:survives a null order`, `…:survives an undefined order` | unit | PASS |
| 6 | Malformed `customer_data` (string, array, number, blank) degrades to no branch | `…:ignores customer_data that is not an object` + 4 siblings | unit | PASS |
| 7 | The branch name shown is the one captured at order time | `…:keeps the name the order was placed under after the branch is renamed` | unit | PASS |
| 8 | An id with no recorded name shows no label | `…:shows nothing when only an id was recorded` | unit | PASS |
| 9 | A single-location merchant is offered no branch filter | `…:offers nothing to filter for a single-location merchant` | unit | PASS |
| 10 | Each branch appears once in the filter however many orders it took | `…:lists a branch once however many orders it took` | unit | PASS |
| 11 | The filter is sorted by name so it does not reshuffle between renders | `…:sorts branches by name so the dropdown does not reshuffle` | unit | PASS |
| 12 | A renamed branch is offered under its current name | `…:keeps the most recent name when a branch was renamed mid-history` | unit | PASS |
| 13 | Selecting a branch shows its orders and hides the others | `matchesOutletFilter` block, 6 tests | unit | PASS |
| 14 | An unattributed order is hidden while a branch is selected | `…:hides an unattributed order when a branch is selected` | unit | PASS |
| 15 | The Messenger ticket names the branch, labelled | `messenger-order-branch.test.ts:labels the branch line so it is not mistaken for the store name` | unit | PASS |
| 16 | The Messenger ticket never leaks the raw carrier id | `…:never leaks the raw carrier id into the message` | unit | PASS |
| 17 | A single-location Messenger message is otherwise unchanged | `…:leaves a single-location message otherwise unchanged` | unit | PASS |

## Regression evidence

```
npm run test   → Test Suites: 1 skipped, 258 passed, 258 of 259 total
                 Tests:       8 skipped, 3164 passed, 3172 total
npx tsc --noEmit → 24 pre-existing errors, all in unrelated test files
                   (revalidate-menu, integrations-provisioning, inventory-costing,
                   inventory-stock-alerts, product-detail-theme).
                   Zero in any file changed by this phase — verified by grepping
                   the output for each changed path.
npm run lint   → 87 pre-existing errors / 711 warnings repo-wide.
                 Zero on any file changed by this phase, same verification.
```

## Known gaps / remaining work

- **Not observed against real data.** `outlets` holds 0 rows, 0 tenants have `multi_branch_enabled` on, and 0 orders carry an `outlet_id` — verified by SQL at the start of this session. Every guarantee here is a unit test. The badge, banner, filter and Messenger line have never rendered for a real branch.
- **The merchant app is untouched.** `webnegosyo-app/` still has zero `outlet` references, so the phone app shows no branch and cannot filter by one. That is Phase 8.
- **The branch still governs nothing** — per-branch operating hours and per-branch pickup/delivery support are stored and ignored. That is Phase 7, and it is the phase where a wrong branch starts costing a merchant money rather than clarity.
- **Phase 6b (the Decision E drift) was not done.** `menu-server.tsx:66` still degrades a failed outlet query to `console.warn` + `[]`, which renders the single-location flow for a multi-branch merchant — the wrong-kitchen scenario Phase 1's Decision E was written to prevent. Deliberately left for its own RED/GREEN cycle rather than folded in here.
- No component-level test renders the badge or filter. The logic is fully covered and the wiring is a direct copy of the advance-order treatment beside it, but the JSX itself is unproven.

## Merge evidence (for squash)

RED → GREEN, in three checkpoint commits on `feat/platform-supabase-order-parity`:

```
13c25e5 test: add reproducers for reading an order's branch back      (RED — module not found, 0 tests ran)
570be42 test: add reproducer for the branch on the Messenger ticket   (RED — 2 failed, 5 passed)
a2f8a65 feat: show and filter by the branch that took each order      (GREEN — 41 passed across both targets;
                                                                       full suite 3164 passed)
```
