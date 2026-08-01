# Branch management redesign (web) — TDD evidence

**Branch:** `feat/platform-supabase-order-parity`
**Date:** 2026-07-30
**Source plan:** none. Journeys were derived during this TDD run from the request
"redesign the branch management on the web, we should also be able to manage the
manager and staffs in there, and it should be visually good ui/ux".

Two scope decisions were taken by the user before any code was written:

1. **Index + branch detail page**, not a single page of expandable cards.
2. **Both** homes for staff: branch-scoped teams live on the branch's own page,
   store-wide accounts live on the index; Settings keeps its card.

## User journeys

1. As an owner, I want to see all my branches at a glance — where they are, how
   they are doing, and who runs them — so I can tell which one needs me.
2. As an owner, I want to open one branch and work on it without losing sight of
   what I was comparing it against.
3. As an owner, I want to add a member of staff to a specific branch without
   being asked which branch, because I am already on that branch's page.
4. As an owner, I want to move someone between branches when I re-staff, without
   deleting and recreating their login.
5. As an owner, I want to know which accounts can act on a branch even though
   they are not posted to it, so I am not surprised by who has access.
6. As an owner of a store whose orders are not on the platform database, I want
   to be told my takings cannot be split by branch, rather than shown zeroes.
7. As a branch manager, I must not reach any of this — the directory names every
   branch's address and takings.

## Task report

### 1. The roster view model (`src/lib/outlets/branch-roster.ts`)

One pure function behind the grid, the summary strip and each branch's Team tab,
so a card cannot claim two staff while the page it opens lists three.

- **RED:** `npx jest --config jest.config.cjs tests/unit/branch-roster.test.ts`
  → `Cannot find module '@/lib/outlets/branch-roster'`, `Tests: 0 total`,
  1 suite failed. Compile-time RED: the test names the module the redesign needs.
- **GREEN:** same command → `Tests: 20 passed, 20 total`.
- Checkpoints: `c787e92` (test), `06f4f9f` (implementation).

Guaranteed: a branch with no orders survives into the roster with `metrics: null`;
the merchant's own `sort_order` is preserved rather than re-ranked; store-wide,
branch and orphaned accounts are separated; per-branch seats never go negative;
the unassigned bucket counts toward store revenue but can never be crowned top
branch; and `hasMetrics: false` is distinct from a store that has sold nothing.

### 2. The redesigned index (`branch-directory` / `branch-card` / `branch-summary-strip`)

- **RED:** `npx jest --config jest.config.cjs tests/unit/branch-directory.test.tsx`
  → `Cannot find module '@/components/admin/branch-directory'`, `Tests: 0 total`.
- **GREEN:** same command → `Tests: 17 passed, 17 total`.
- Checkpoints: `62c1dc5` (test), `c49f4ae` (implementation).

Guaranteed: every branch is named and links to `/{tenant}/admin/outlets/{id}`; a
branch with no takings reads "No orders yet" and renders no `₱0`; a store whose
takings cannot be read shows no revenue tile and no peso figure on any card, and
says why; unattributed takings are disclosed rather than silently absorbed; the
empty store shows no summary figures to misread.

### 3. Branch team management (`branch-team-panel` + `staff/staff-roster`)

- **RED:** `npx jest --config jest.config.cjs tests/unit/branch-team-panel.test.tsx`
  → `Cannot find module '@/components/admin/branch-team-panel'`, `Tests: 0 total`.
- **GREEN (first run):** `Tests: 1 failed, 13 passed`. The failure was an
  imprecise assertion of mine — `getByText(/orders/i)` matched both the `Orders`
  permission badge and the card's own description — not a defect. The test was
  narrowed to the member's row (`within(row).getByText('Orders')`); production
  code was not changed to accommodate it.
- **GREEN:** `Tests: 14 passed, 14 total`. Checkpoint `01b6281`.

Guaranteed: the branch's own team is listed; adding does not ask which branch and
posts to this branch (`createStaffAction(..., { outletId: 'makati' })`); the seat
count is the branch's and a store-wide account does not consume one; the add
control is disabled at the cap; a member can be moved to another branch or
widened to the whole store (`updateStaffBranchAction(..., 'bgc' | null)`); and
store-wide accounts that can also act on the branch are named.

`updateStaffBranchAction` already existed server-side with no caller — this is the
first UI that reaches it.

### 4. Refusal paths (`tests/unit/branch-staff-failures.test.tsx`)

**Not a RED→GREEN cycle.** These 7 tests passed on first run: the behaviour was
already correct, carried over from `OutletsManager` and written into `StaffRoster`
alongside the happy paths. They are regression tests, added because coverage
showed the refusal branches unexercised and because a silent failure here is the
dangerous class — an owner told "moved" when the server refused believes someone
has access they do not have.

- `npx jest --config jest.config.cjs tests/unit/branch-staff-failures.test.tsx`
  → `Tests: 7 passed, 7 total`.

Guaranteed: a refused move, add or removal surfaces the server's own message and
never a success toast; the move dialog stays open and typed input survives; a
failed reorder restores the saved order on screen; a failed hide leaves the
branch showing as visible; and a no-op reorder at the ends does not round-trip.

### 5. Consolidation

`staff-management-card.tsx` (492 lines) now delegates to the shared `StaffRoster`
(66 lines). Its existing suite `tests/unit/staff-branch-picker.test.tsx` was not
modified and still passes — the refactor is behaviour-preserving by that evidence.

Deleted as unreachable after the redesign: `outlets-manager.tsx` (replaced by
`branch-directory`), `branch-comparison-table.tsx` and its test (the per-branch
cards now carry the same figures; the arithmetic it tested remains covered by
`tests/unit/branch-analytics.test.ts`).

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | A branch that has never sold anything still appears, with no metrics | `branch-roster.test.ts:keeps a branch that has never taken an order` | unit | PASS |
| 2 | The grid follows the merchant's own branch order, not revenue | `branch-roster.test.ts:preserves the order the branches were given in` | unit | PASS |
| 3 | An account whose branch was deleted is surfaced, not dropped | `branch-roster.test.ts:keeps a member whose branch no longer exists` | unit | PASS |
| 4 | Per-branch seats never read negative | `branch-roster.test.ts:never reports negative seats` | unit | PASS |
| 5 | The unassigned bucket is never named top branch | `branch-roster.test.ts:never crowns the unassigned bucket` | unit | PASS |
| 6 | Unattributed takings count in store revenue and are reported separately | `branch-roster.test.ts:counts unattributed takings in store revenue` | unit | PASS |
| 7 | Unreadable takings are distinct from zero takings | `branch-roster.test.ts:reports no metrics anywhere when the order list could not be read` | unit | PASS |
| 8 | Each branch card opens that branch's page | `branch-directory.test.tsx:opens a branch on its own page` | component | PASS |
| 9 | A branch with no takings says so instead of showing ₱0 | `branch-directory.test.tsx:says a branch has sold nothing` | component | PASS |
| 10 | A store with an unreadable backend shows no peso figures at all | `branch-directory.test.tsx:still lets the merchant manage the branch` | component | PASS |
| 11 | Adding on a branch page does not ask which branch | `branch-team-panel.test.tsx:does not ask which branch` | component | PASS |
| 12 | A new account is posted to the branch whose page it was added from | `branch-team-panel.test.tsx:posts the new account to this branch` | component | PASS |
| 13 | A store-wide account does not consume a branch seat | `branch-team-panel.test.tsx:does not count a store-wide account against the branch cap` | component | PASS |
| 14 | Adding is blocked at the per-branch cap | `branch-team-panel.test.tsx:stops the owner adding past the cap` | component | PASS |
| 15 | A member can be reassigned to another branch | `branch-team-panel.test.tsx:reassigns them to the branch chosen` | component | PASS |
| 16 | A member can be widened to the whole store | `branch-team-panel.test.tsx:widens them to the whole store` | component | PASS |
| 17 | Store-wide accounts reaching this branch are named | `branch-team-panel.test.tsx:names the store-wide accounts` | component | PASS |
| 18 | A refused move never reports success | `branch-staff-failures.test.tsx:reports why a move failed` | component | PASS |
| 19 | A failed reorder restores the saved order | `branch-staff-failures.test.tsx:puts the branches back in their saved order` | component | PASS |
| 20 | A failed hide does not show the branch as hidden | `branch-staff-failures.test.tsx:reports a refused hide` | component | PASS |

## Coverage

`npx jest --config jest.config.cjs --coverage` over the five relevant suites:

```
 components/admin          |   94.01 |    84.78 |   66.66 |   94.01
  branch-card.tsx          |     100 |    92.85 |      60 |     100
  branch-directory.tsx     |      82 |    78.94 |   57.14 |      82
  branch-summary-strip.tsx |     100 |      100 |     100 |     100
  branch-team-panel.tsx    |     100 |       50 |     100 |     100
 components/admin/staff    |   92.07 |    82.53 |   51.51 |   92.07
  staff-fields.tsx         |   98.23 |     100 |   66.66 |   98.23
  staff-roster.tsx         |   90.69 |    77.08 |   48.14 |   90.69
 lib/outlets               |     100 |    97.87 |     100 |     100
  branch-format.ts         |     100 |     100 |     100 |     100
  branch-roster.ts         |     100 |    97.43 |     100 |     100
```

Statement coverage is above the 80% bar throughout; the pure logic is at 100%.
Function coverage is low by this measure because it counts every inline JSX arrow
(`onClick={() => ...}`) as an uncovered function; the behaviours behind them are
asserted through the action mocks.

Whole suite after the change:
`npx jest --config jest.config.cjs` → `Test Suites: 1 skipped, 302 passed`,
`Tests: 8 skipped, 3691 passed, 3699 total`.
`npx tsc --noEmit` → no errors under `src/`.
`npm run lint` → no new problems in `src/` (the 87 pre-existing errors are all in
`webnegosyo-app/` and `webnegosyo-desktop/`).

## Known gaps

- **Nothing has been exercised against a live tenant.** Per
  `branch-scoped-order-reads`, production has **0 branch-attributed orders** and
  **0 branch-scoped accounts**, so on real data today every card would show "No
  orders yet" and every account would land in the store-wide list. The screens
  are correct for that state, but the populated state is unverified outside tests.
- **No E2E.** The Playwright suite does not cover the admin branch flows; the
  guarantees above are unit and component level.
- **The authorization boundary is unchanged and untested here.** The redesign
  adds no new server action — every write goes through the existing
  `createStaffAction` / `updateStaffBranchAction` / `removeStaffAction`, which
  re-check the caller via `staffManagerContext`. `canViewBranchDirectory` gates
  both pages, and `isStoreWideAdminPath` already covers `/outlets/<id>` at the
  section level (pinned by `tests/unit/branch-manager-branch-surfaces.test.ts`).
  Nothing new was granted; no new test was written for that boundary.
- **The visual design is unverified in a browser.** No screenshots were taken and
  the app was not run.
