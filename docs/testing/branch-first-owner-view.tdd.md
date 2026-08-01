# TDD evidence — branch-first owner view (merchant app)

**Source plan**: `.claude/plans/branch-first-owner-view.plan.md` (local, gitignored)
**Branch**: `feat/platform-supabase-order-parity`
**Scope covered here**: P0 (context seam), P1 (portfolio view), P2 (context bar + landing).
P3–P6 (server-side read scoping, write guards, in-app manager accounts, branch push) are
**not started** — see "Known gaps".

## User journeys

1. As the owner of a multi-branch store, I want to open the app on my branches and store
   totals, so I can see how the business is doing before I look at any one shift.
2. As that owner, I want to tap a branch and have the whole app follow it, so I can run one
   branch as if it were the whole store — and then come back and pick another.
3. As a branch manager, I want the app to stay on my branch, so I never have to filter other
   people's orders out of my queue.
4. As a merchant with one location, I want none of this to change anything, so the app I
   learned still opens where it always did.

## Task report

### P0 — the viewing-context seam

Composed the branch a session is *looking at* with the branch its account *may* see, inside
the single hook every order surface already reads.

- RED: `npx jest lib/branch-context.test.ts` →
  `Cannot find module './branch-context'` (compile-time RED; the test references the missing
  implementation). Commit `1eedb7c`.
- GREEN: same command → 11 passed. Full suite `npx jest` → 68/68 suites, 1081 tests.
  `npx tsc --noEmit` clean. Commit `0f7f368`.

Guaranteed: a selection can only narrow. A branch account is returned untouched whatever the
selection says, so no route through this module reaches another branch.

### P1 — Business view, landing rule, portfolio screen

- RED (registry + landing): `npx jest lib/workspaces.test.ts lib/portfolio-landing.test.ts` →
  3 failed (`business` absent from the registry, `branches` still in Insights,
  `portfolio-landing` module missing). Commit `fc79114`.
- GREEN: `npx jest` → 69/69 suites, 1094 tests, tsc clean.
- RED (screens): `npx jest lib/business-screen-mount.test.ts` → 4 failed (no portfolio route
  file, no drill-down, no account-scope import). Commit (test) as part of the same RED step.
- GREEN: `npx jest` → 71/71 suites, 1123 tests, tsc clean. Commit `c31c7d9`.

Two existing tests were updated because the specification moved, not to make an
implementation pass: the owning view of the `branches` tab, and the owner's workspace list.

**Live bug found and fixed on the way**: `app/(main)/branches.tsx` had no `<Tabs.Screen>`
entry, so expo-router registered it with default options — it appeared in *every* view and
ignored staff permissions, showing store-wide branch revenue to a cashier in the Register
view. Now gated by `show()`, with a registry-wide guardrail test asserting every workspace
tab is.

### P2 — context bar and landing redirect

- `BranchContextBar` mounted once in `app/(main)/_layout.tsx`; `useBranchLanding` opens a
  multi-branch owner on the portfolio and publishes known branch ids.
- GREEN: `npx jest` → 71/71 suites, 1123 tests; `npx tsc --noEmit` clean. Commit `5a196bb`.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A branch account's scope is never widened by a viewing selection | `lib/branch-context.test.ts:never widens a branch account` | unit | PASS |
| 2 | An owner's selection narrows the effective scope to that branch | `lib/branch-context.test.ts:narrows an owner to the branch they selected` | unit | PASS |
| 3 | A deleted/foreign branch id falls back to store-wide, not to an empty scope | `lib/branch-context.test.ts:falls back to store-wide for a branch this store does not have` | unit | PASS |
| 4 | A selection is honoured while the branch list is still loading | `lib/branch-context.test.ts:trusts a selection while the branch list is still loading` | unit | PASS |
| 5 | A single-location store still opens on the order queue | `lib/portfolio-landing.test.ts:opens the order queue for a single-location store` | unit | PASS |
| 6 | A branch manager still opens on the order queue | `lib/portfolio-landing.test.ts:opens the order queue for a branch manager` | unit | PASS |
| 7 | The demo tour still opens on the order queue | `lib/portfolio-landing.test.ts:opens the order queue for the demo tour` | unit | PASS |
| 8 | An unknown branch count is treated as single-location | `lib/portfolio-landing.test.ts:treats an unknown branch count as single-location` | unit | PASS |
| 9 | The portfolio lists a branch that has never taken an order | `lib/portfolio-rows.test.ts:keeps a branch that has never taken an order, at zero` | unit | PASS |
| 10 | Branch names come from the store's list, not from old tickets | `lib/portfolio-rows.test.ts:names branches from the store's list` | unit | PASS |
| 11 | The store total matches the dashboard's, unassigned included | `lib/portfolio-rows.test.ts:adds up every row, unassigned included` | unit | PASS |
| 12 | Every workspace tab is gated by the active view and staff permissions | `lib/business-screen-mount.test.ts:gates %s behind the active view` | guardrail | PASS |
| 13 | The portfolio drills down via the context store | `lib/business-screen-mount.test.ts:drills into a branch by setting the viewing context` | guardrail | PASS |
| 14 | Business screens keep listing every branch while one is being viewed | `lib/business-screen-mount.test.ts:reads the un-narrowed account scope in %s` | guardrail | PASS |

Command for all of the above: `cd webnegosyo-app && npx jest` → **71 suites, 1123 tests, 0 failures**.
Type check: `npx tsc --noEmit` → clean.

## Coverage and known gaps

Coverage was not measured as a percentage: this package's jest config runs pure-logic roots
(`lib/`, `theme/`) only, and the new pure modules (`branch-context`, `portfolio-landing`,
`portfolio-rows`) are covered branch-by-branch by the tests above. The screens
(`portfolio.tsx`, `BranchContextBar.tsx`) and the two data hooks (`use-outlets`,
`use-branch-landing`) are **not unit-tested** — they are covered only by source-level
guardrails, matching how every other screen in this app is treated.

Deliberately not done yet, and therefore **not guaranteed**:

- **Nothing here has run on a device.** All evidence is unit tests and type checks.
- **P3 — server-side read scoping.** Order queries are still store-wide; branch narrowing is
  client-side only, so a manager's device still receives other branches' orders over the wire.
- **P4 — write guards.** A manager can still mutate another branch's order if they reach it.
- **P5 — manager accounts in the app.** Staff creation remains web-only; the `team` tab is
  deliberately absent from the workspace registry until its screen exists, because a
  registered tab with no route file breaks the tab bar for every account.
- **P6 — branch-targeted push.** Every device registered to a store still rings for every
  branch's orders.
- **Convex-backed tenants** cannot be server-scoped at all (the branch sits in an unindexed
  `customerData` blob) and keep the 2000-order window ceiling, which is stated on screen.

## Merge evidence

Checkpoint commits on `feat/platform-supabase-order-parity`, in order:
`1eedb7c` (RED, seam) → `0f7f368` (GREEN, seam) → `fc79114` (RED, view + landing) →
`c31c7d9` (GREEN, portfolio) → `5a196bb` (GREEN, landing + context bar).
If these are squashed, this file is the surviving record of what was verified and how.
