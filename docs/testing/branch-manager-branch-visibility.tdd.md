# Branch manager: no other branches, no branches tab — TDD evidence

**Branch**: `feat/platform-supabase-order-parity`
**Date**: 2026-07-30
**Source plan**: none. Journeys were derived during this TDD run from the request
"the manager of a branch should not be able to see other branches or the branches tab".

## The gap

Writing was already closed (`docs/testing/branch-scoped-order-reads.tdd.md`): a
manager of North could not rename or deactivate South. **Reading was not.**

- **Web** — the `Branches` sidebar entry rendered for every `role='admin'`, and
  `/admin/outlets` listed every outlet the tenant owns with a branch-versus-branch
  comparison table beside it. The admin layout already *read* `outlet_id` (through
  `getCachedCurrentUserRole` → `fetchAppUserScope`) and then dropped it when building
  the caller, so nothing downstream could have gated on it.
- **Merchant app** — `WorkspaceSwitcher` listed views from `allowedWorkspaces`, which
  asks only about staff permissions. A branch manager is `role='admin'` with
  `permissions: null` by construction, so Business was offered: the portfolio and the
  branch comparison, one tap away. `isPortfolioAvailable` already stated the correct
  rule — it was wired to the landing redirect only, never to visibility.

## User journeys

1. As a branch manager, I want the app to show me my branch's work, so that I am not
   shown — or invited into — the other branches' names, addresses and takings.
2. As a store owner, I want the branch directory and the Business view to keep working
   exactly as they do today, so that adding the restriction costs me nothing.
3. As a single-location merchant, I want nothing to change, so that a multi-branch
   feature I never enabled cannot move my screens.

## Task report

| # | What was done | Validation run | Result |
|---|---|---|---|
| 1 | Wrote failing specs for both surfaces | `npx jest tests/unit/branch-manager-branch-surfaces.test.ts` / `cd webnegosyo-app && npx jest lib/business-view-visibility.test.ts` | **RED** — 14/16 web assertions failed; mobile suite failed to compile (`no exported member 'visibleWorkspaces'`) |
| 2 | Added `canViewBranchDirectory` + `isStoreWideAdminPath` (web), `visibleWorkspaces` / `isBusinessTabVisible` / `activeWorkspace` (app), and wired the five leak points | same two commands | **GREEN** — 16/16 and 15/15 |
| 3 | Full suites + typecheck + lint | `npx jest`, `npx tsc --noEmit`, `npx eslint <changed>` | web 296 suites pass, app 80 suites / 1266 tests pass, both typecheck clean, lint clean |

RED evidence (step 1, web):

```
Tests:       14 failed, 2 passed, 16 total
● web admin wiring › refuses to render the branches page for a branch manager
```

RED evidence (step 1, app):

```
error TS2305: Module '"./portfolio-landing"' has no exported member 'visibleWorkspaces'.
```

GREEN evidence (step 2):

```
PASS tests/unit/branch-manager-branch-surfaces.test.ts      (16 tests)
PASS webnegosyo-app/lib/business-view-visibility.test.ts    (15 tests)
```

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A branch-locked admin fails `canViewBranchDirectory`; owner, superadmin and store-wide admin pass | `tests/unit/branch-manager-branch-surfaces.test.ts:canViewBranchDirectory` | unit | PASS |
| 2 | A blank `outlet_id` reads as store-wide, matching `resolveBranchScope` — no account is store-wide for reads and locked for writes | same, `treats a blank branch as store-wide` | unit | PASS |
| 3 | `/admin/outlets` **and** any page nested under it are store-wide sections; no other admin section is | same, `isStoreWideAdminPath` | unit | PASS |
| 4 | The `Branches` sidebar entry is hidden from a branch manager even with multi-branch on, and exactly one entry is affected | same, `hiddenAdminSidebarPaths — branch-scoped account` | unit | PASS |
| 5 | An absent branch lock reads as store-wide, so every existing caller keeps today's sidebar | same, `reads an absent branch lock as store-wide` | unit | PASS |
| 6 | The admin layout carries `outlet_id`, the layout client decides the entry from it, middleware bounces the route, and the page refuses to render | same, `web admin wiring` (4 source guardrails) | integration (source) | PASS |
| 7 | Business is withheld from a branch manager, a single-location store, the demo tour, and an unknown branch count | `webnegosyo-app/lib/business-view-visibility.test.ts:visibleWorkspaces` | unit | PASS |
| 8 | A branch manager keeps all four working views; staff permissions still compose | same, `still offers a branch manager the four working views`, `keeps honouring staff permissions` | unit | PASS |
| 9 | The Business tabs are unregistered for a manager; every non-Business tab is untouched | same, `isBusinessTabVisible` | unit | PASS |
| 10 | A persisted view the account may no longer see falls back to a view it does have, rather than an empty tab bar | same, `activeWorkspace` | unit | PASS |
| 11 | The switcher lists views from the branch-aware rule and no longer from `allowedWorkspaces` alone; the tab bar asks the branch rule | same, `merchant app wiring` | integration (source) | PASS |
| 12 | Existing behaviour unchanged: sidebar flag regression lock, `canManageOutlets`, landing rule, staff gating | `admin-sidebar-visibility`, `outlets-manage-guard`, `portfolio-landing`, `staff-permissions`, `staff-menu-gating` | unit | PASS |

## Coverage

```
src/lib/outlets/branch-scope.ts        100% stmts / 100% branch
src/lib/admin-sidebar-visibility.ts    100% stmts / 100% branch
src/lib/staff-permissions.ts           100% stmts /  97.7% branch
webnegosyo-app/lib/portfolio-landing.ts 100% stmts / 90.9% branch
```

The one uncovered branch in `portfolio-landing.ts` is `activeWorkspace`'s
`?? "operations"` default, reachable only if an account has *no* visible view at all.
No permission set produces that today (the dashboard is ungated, so Operations always
survives), so it is a defensive default rather than a path.

## Two corrections made during the run

- The first draft asserted a POS-only cashier sees `["register"]`. It sees
  `["operations", "register"]` — `dashboard` carries no permission mapping. The test was
  wrong, not the code, and was corrected to state that plus "never Business".
- `activeWorkspace`'s "falls back to the first visible view" case cannot be distinguished
  from "falls back to Operations" with today's permission registry, so the test asserts
  against `visibleWorkspaces(...)[0].key` rather than a literal.

## Known gaps

- **Nothing has run on a device.** Jest in `webnegosyo-app` runs pure-logic roots only,
  so the switcher and tab-bar wiring is pinned by source guardrails, not by rendering.
- **Inert in production, as with the rest of the branch work**: 0 branch-scoped accounts
  exist (see `branch-scoped-order-reads.tdd.md`), so no live merchant's screens change.
- **`listOutletsAction` stays ungated** on purpose — the branch picker, checkout and the
  app's known-branch list all read it, and `outlets-manage-guard.test.ts` pins that.
  What is closed here is the *directory surface*, not the ability to resolve a branch.
- **Convex-backed tenants** are unaffected by the server-side half of this (they have no
  `orders.outletId`); this change is a visibility rule and applies to both backends.

## Checkpoints

| Stage | Commit |
|---|---|
| RED | `dba9361` test: pin that a branch manager sees no other branch |
| GREEN | `857d82b` fix: hide every other branch from a branch manager |

No separate refactor commit: the implementation extracted `isStoreWideAccount` and
`adminSectionForPath` as it went, with the suites green at the point of commit.
