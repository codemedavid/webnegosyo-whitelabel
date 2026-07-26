# TDD Evidence — Superadmin mode in `webnegosyo-app` (Phases 0–2)

**Source plan**: no `*.plan.md` artifact; journeys were derived from the inline
plan agreed in-session (superadmin dashboard on the merchant app, tenant
management parity with the web `/superadmin/*`, and view switching). Branding
management was explicitly excluded from scope by the user.

**Branch**: `feat/unified-modifier-groups`

## User journeys

1. As the platform superadmin, I want to sign into the merchant app with my
   existing credentials, so that I reach the platform console without a
   separate app or login screen.
2. As the platform superadmin, I want to see and search every tenant on the
   platform, so that I can find a store from my phone.
3. As the platform superadmin, I want to open any tenant's merchant view and
   return to the console afterwards, so that I can manage a store without
   signing in as its owner.
4. As a merchant admin or App Review demo guest, I want the platform surface to
   stay invisible and unreachable, so that the app's behaviour is unchanged for
   me.

## Task report

### Task 1 — Superadmin sign-in with no tenant (Phase 0)

The superadmin's `app_users` row carries `tenant_id = NULL`, verified directly
against the database:

```
select au.user_id, au.role, au.tenant_id from app_users au where au.role='superadmin';
-> [{"user_id":"82183d84-…","role":"superadmin","tenant_id":null}]
```

Both `app/_layout.tsx` and `app/(auth)/login.tsx` looked the tenant up by that
id and treated the miss as a failure, so the superadmin could not sign in at
all. `lib/session-resolve.ts` now owns that decision for both callers.

- **Validation command**: `npx jest lib/session-resolve.test.ts`
- **RED**: `TS2307: Cannot find module './session-resolve'` — 0 tests run
  (commit `285b7d0`)
- **GREEN**: `Tests: 17 passed, 17 total` (commit `a5645d4`)
- **Guaranteed**: a superadmin resolves to its own session mode with a null
  tenant and lands on the platform surface; merchant sign-in keeps its exact
  previous shape; denials still produce the original user-facing messages.

### Task 2 — Tenant impersonation round trip (Phase 1)

Every merchant screen resolves its tenant from the auth store alone, so
rewriting those fields is the whole impersonation. RLS (migration
`0001_initial.sql:192-222`) already grants a superadmin cross-tenant access, so
no server change was required.

- **Validation command**: `npx jest lib/impersonation.test.ts`
- **RED**: `TS2307: Cannot find module './impersonation'` (commit `ee3ca3a`)
- **GREEN**: `Tests: 23 passed, 23 total` (commit `f53e3cc`)
- **Guaranteed**: entering and exiting a tenant restores the superadmin state
  exactly (no residual `tenantId` to silently scope a later query); the
  superadmin flag survives impersonation; a non-superadmin calling
  `enterTenant` throws; the banner shows for an impersonating superadmin but
  never for an ordinary merchant admin who owns their tenant.

### Task 3 — Platform tenant list (Phase 2)

- **Validation command**: `npx jest lib/tenant-list.test.ts`
- **RED**: `TS2307: Cannot find module './tenant-list'` (commit `a3b7797`)
- **GREEN**: `Tests: 20 passed, 20 total` (commit `a1ff343`)
- **Guaranteed**: search matches name and slug case-insensitively and ignores
  surrounding whitespace; status and feature filters compose with search; the
  source list is never mutated or reordered; the overview counters are correct
  including for an empty platform.

### Task 4 — Superadmin navigation shell and role gate (Phase 2)

- **Validation command**: `npx jest lib/superadmin-nav.test.ts`
- **RED**: `TS2307: Cannot find module './superadmin-nav'` (commit `d93070d`)
- **GREEN**: `Tests: 19 passed, 19 total` (commit `c60cc0a`)
- **Guaranteed**: the registry and the post-sign-in landing href cannot drift
  apart; every registered tab has a screen file and is declared in the layout;
  the layout redirects a non-superadmin away; no merchant tab links into the
  `(superadmin)` group; the demo path never routes into it.

One test was corrected during this task rather than the implementation: the
merchant-tab-bar guardrail originally asserted that `app/(main)/_layout.tsx`
contained no superadmin tab *name*, which fails because both trees legitimately
own a route called `dashboard`. The assertion now expresses the actual
invariant — no merchant tab links into the `(superadmin)` group.

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|--------------------|-----------|------|--------|
| 1 | A superadmin with `tenant_id = NULL` signs in instead of being denied | `lib/session-resolve.test.ts:signs a superadmin in even though they own no tenant` | unit | PASS |
| 2 | The tenant lookup is skipped for a superadmin and required for a merchant | `lib/session-resolve.test.ts:needsTenantLookup` | unit | PASS |
| 3 | A superadmin lands on the platform surface, not the merchant dashboard | `lib/session-resolve.test.ts:lands a superadmin on the superadmin surface…` | unit | PASS |
| 4 | Existing merchant sign-in is unchanged, including staff permissions | `lib/session-resolve.test.ts:resolveSession — merchant` | unit | PASS |
| 5 | Denials keep their original messages and never emit an auth patch | `lib/session-resolve.test.ts:resolveSession — denial` | unit | PASS |
| 6 | Opening a tenant attaches it so merchant screens read it | `lib/impersonation.test.ts:enterTenant` | unit | PASS |
| 7 | Enter → exit restores the superadmin state exactly | `lib/impersonation.test.ts:restores the exact superadmin state after a round trip` | unit | PASS |
| 8 | Only a superadmin can impersonate | `lib/impersonation.test.ts:throws when a non-superadmin attempts it` | unit | PASS |
| 9 | The banner never shows for an ordinary merchant admin | `lib/impersonation.test.ts:is false for an ordinary merchant admin holding a tenant` | unit | PASS |
| 10 | Tenant search, status and feature filters compose correctly | `lib/tenant-list.test.ts:filterTenants` | unit | PASS |
| 11 | Overview counters are correct, including for an empty platform | `lib/tenant-list.test.ts:summarizeTenants` | unit | PASS |
| 12 | The landing href always names a real registered tab | `lib/superadmin-nav.test.ts:agrees with the post-sign-in landing route` | unit | PASS |
| 13 | Every registered tab ships a screen and is declared in the layout | `lib/superadmin-nav.test.ts:superadmin screens` | unit | PASS |
| 14 | The platform surface is role-gated, absent from the merchant tab bar, and unreachable from the demo path | `lib/superadmin-nav.test.ts:superadmin surface is role-gated` | unit | PASS |

## Coverage

```
npx jest lib/session-resolve.test.ts lib/impersonation.test.ts \
  lib/tenant-list.test.ts lib/superadmin-nav.test.ts --coverage …

File                | % Stmts | % Branch | % Funcs | % Lines
All files           |     100 |      100 |     100 |     100
 impersonation.ts   |     100 |      100 |     100 |     100
 session-resolve.ts |     100 |      100 |     100 |     100
 superadmin-nav.ts  |     100 |      100 |     100 |     100
 tenant-list.ts     |     100 |      100 |     100 |     100

Tests: 79 passed, 79 total
```

100% on all four new modules, against the project's 80% floor.

`npx tsc --noEmit` reports no errors in any file touched by this work.

## Known gaps

- **Screens are not render-tested.** The app's Jest config only runs pure-logic
  roots (`lib/`, `theme/`), so the new screens are covered indirectly through
  source-level guardrails, matching the existing `workspace-switcher-mount`
  pattern. The sign-in and impersonation flows still need one manual pass on a
  device.
- **Phases 3–6 are not started**: the tenant editor (6 tabs; branding excluded
  per the user), the leads RLS migration, the `/api/superadmin/*` bridge for
  service-role operations, and platform analytics.
- **Unrelated failures in the shared worktree.** `lib/products.test.ts` has 3
  failing tests from a concurrent session's in-flight `modifier-groups` work
  (`products.ts` is modified but uncommitted; their RED commit is `2d28661`).
  Those are not caused by, and do not affect, the work in this report. Full
  suite at the time of writing: `Tests: 440 passed, 3 failed, 443 total`.

## Merge evidence

If these commits are squashed, the RED/GREEN record above is the surviving
proof. Checkpoint sequence on `feat/unified-modifier-groups`:

| Commit | Stage |
|---|---|
| `285b7d0` | RED — session resolution reproducer |
| `a5645d4` | GREEN — `resolveSession` (17/17) |
| `ee3ca3a` | RED — impersonation reproducer |
| `f53e3cc` | GREEN — impersonation transitions (23/23) |
| `d93070d` | RED — navigation shell reproducer |
| `a3b7797` | RED — tenant list reproducer |
| `a1ff343` | GREEN — tenant list (20/20) |
| `c60cc0a` | GREEN — superadmin surface, screens and wiring (19/19) |
