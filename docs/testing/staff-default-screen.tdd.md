# TDD Evidence — Per-Staff Default Screen

**Feature**: an owner sets which merchant-app screen a staff account opens on.
**Source plan**: produced inline in this session (`/ecc:plan`); no `*.plan.md` artifact was written.
**Date**: 2026-08-29

## User Journeys

| # | Journey |
|---|---------|
| J1 | As an owner, I set a staff member's default screen, so the app opens on the screen they actually work in. |
| J2 | As a staff member with no default set, the app opens exactly where it does today. |
| J3 | As an owner, I cannot pick a screen that staff member has no permission to open. |
| J4 | As a staff member whose permission was revoked after the default was set, I land somewhere safe, not on an empty tab bar. |

## Task Report

### Task 1 — Landing decision + screen registry (pure)

Wrote three suites against modules that did not exist, then the modules.

- RED: `cd webnegosyo-app && npx jest lib/default-landing --selectProjects logic`
  → `TS2307: Cannot find module './default-landing'` — compile-time RED, the intended signal.
- RED: `npx jest --testPathPatterns=staff-default-screen`
  → `Cannot find module '../../src/lib/staff-default-screen'`, 2 suites failed to run.
- GREEN: same commands → 16/16 and 19/19.

Guarantees: the automatic portfolio rule is untouched for anyone who never configured a screen; a pinned screen beats it for anyone who did; and every way the stored value can go stale falls back to what the account would have got with nothing set.

### Task 2 — Persistence

- RED: `npx jest --testPathPatterns=staff-service-default-screen` → 13 failed, 2 passed.
  One of those 13 was my own test's fault (`validatePermissionKeys` rejects an empty list); the test was corrected, not the implementation.
- GREEN: `npx jest --testPathPatterns="staff-service|staff-default-screen"` → **78/78**, including the two pre-existing staff-service suites unchanged.

Migration `20260829120000_staff_default_screen.sql` adds `app_users.default_tab text`. No CHECK constraint, deliberately: the set of screens is an app-side concept that changes every release, and the app and the schema deploy independently. Validity is enforced in code on both sides.

### Task 3 — App plumbing and landing

- RED: `cd webnegosyo-app && npx jest lib/default-screen-wiring --selectProjects logic`
  → `TS2339: Property 'defaultTab' does not exist on type 'SessionAuthPatch'` (and on `AuthState`).
- GREEN: `npx jest lib/default-screen-wiring lib/default-landing lib/portfolio-landing lib/session-resolve stores --selectProjects logic` → **107/107**.

### Task 4 — Web picker UI

- RED: `npx jest --testPathPatterns=staff-default-screen-picker` → 10 failed, 2 passed.
- Two further failures during GREEN were test-selector faults, corrected in the test: `/pos/i` also matched the Orders permission description, and the add-form field is labelled "Name", not "Display name".
- GREEN: `npx jest --testPathPatterns=staff` → **154/154**.

### Task 5 — Projection guard

Adding the column is only half the feature; both web reads have to select it.

- RED: `npx jest --testPathPatterns=staff-default-screen-projection` → `✕ selects default_tab for the branch team roster`.
  This caught a real defect: `loadBranchStaff` (the branch Team tab) omitted the column, which would have rendered the same roster component with no badge and a dialog opening on "No preference" for an account that had one — silently, with nothing thrown.
- GREEN: `npx jest --testPathPatterns="staff|outlets|branch"` → **895/895**.

## Test Specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | An account with no default opens exactly where it does today, single- or multi-branch | `webnegosyo-app/lib/default-landing.test.ts` — "no default chosen" | unit | PASS |
| 2 | A pinned screen beats the automatic portfolio rule | same — "beats the automatic portfolio rule" | unit | PASS |
| 3 | A revoked permission, a retired screen, a dropped branch, or junk in the column all fall back safely | same — "the choice is no longer usable" (7 cases) | unit | PASS |
| 4 | No redirect fires when the pinned screen is already the one the app opens on | same — "navigates nowhere…" | unit | PASS |
| 5 | The picker never offers a screen the account cannot open | `tests/unit/staff-default-screen.test.ts` | unit | PASS |
| 6 | A non-string, unknown, or blank value stores as "no preference" rather than erroring | same — `validateDefaultTab` (6 cases) | unit | PASS |
| 7 | The web screen list matches the app's tab registry and permission gate, tab for tab | `tests/unit/staff-default-screen-parity.test.ts` | unit | PASS |
| 8 | A new account stores only a screen its granted permissions open | `tests/unit/staff-service-default-screen.test.ts` | unit | PASS |
| 9 | Revoking a permission clears a screen it was the key to | same — "keeping the pinned screen honest" | unit | PASS |
| 10 | The owner account and other tenants'/branches' accounts cannot be re-pinned | same — 3 refusal cases | unit | PASS |
| 11 | Both merchant-app `app_users` reads select `default_tab` | `webnegosyo-app/lib/default-screen-wiring.test.ts` | unit | PASS |
| 12 | The session carries the value; sign-out forgets it | same | unit | PASS |
| 13 | Both web `app_users` reads select `default_tab` | `tests/unit/staff-default-screen-projection.test.ts` | unit | PASS |
| 14 | The picker's options move as permissions are ticked and unticked | `tests/unit/staff-default-screen-picker.test.tsx` | component | PASS |
| 15 | The chosen screen reaches the create and update actions; "No preference" sends null | same | component | PASS |

## Coverage

```
src/lib/staff-default-screen.ts        100% stmts / 100% branch / 100% funcs / 100% lines
webnegosyo-app/lib/default-landing.ts  100% stmts / 100% branch / 100% funcs / 100% lines
```

Broadest green run: `npx jest --testPathPatterns="staff|outlets|branch"` → 63 suites, 895 tests, all passing.

## Known Gaps

1. **The migration is not applied.** `supabase/migrations/20260829120000_staff_default_screen.sql` exists but has not been run against the database. Until it is, the staff reads will 404 on the unknown column. This is the one step between the feature and working.
2. **No E2E.** The path is covered by unit and component tests plus two source-level projection guards; no Playwright journey drives web → app.
3. **Merchant app needs a rebuild/OTA** for the landing change to reach devices.
4. **Concurrent session.** This work shares a working tree with another session. Five `receipt-*` suites and the earlier `supabase-orders` failures observed during these runs come from that session's in-flight edits, not from this change; every commit here staged explicit paths only.

## Checkpoint Commits

| Stage | Commit |
|---|---|
| RED — landing + registry | `483c374d` test: add reproducers for the per-staff default screen |
| GREEN — landing + registry | `1b379016` feat: resolve a per-staff default screen (35/35) |
| GREEN — persistence | `b19dc8c9` feat: store the screen a staff account opens on (142/142) |
| GREEN — app plumbing | `45eec0f4` feat: open the merchant app on the screen the owner pinned (107/107) |
| RED — picker UI | picker reproducer commit (10/12 failing) |
| GREEN — picker UI + projection fix | `a0656e76` feat: let an owner pin a staff account to a screen (895/895) |
