# TDD Evidence — Superadmin mode in `webnegosyo-app` (Phases 0–5, partial)

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

### Task 5 — Tenant editor form logic and screen (Phase 3)

Six tabs mirroring the web editor minus branding, which the user removed from
scope. Verified beforehand that this is safe: every color / template / brand /
font column on `tenants` is nullable or carries a DB default, so creating and
editing from the app without them violates no constraint.

- **Validation command**: `npx jest lib/tenant-form.test.ts`
- **RED**: `TS2307: Cannot find module './tenant-form'` (commit `f18ae1d`)
- **GREEN**: `Tests: 45 passed, 45 total` (commit `a4d677c`)
- **Coverage follow-up**: added the all-null "freshly created tenant" case,
  taking branch coverage on `lib/tenant-form.ts` from 80.35% to 96.42%
  (`Tests: 48 passed`, commit `6ea665c`). No production code changed, so this
  step had no RED gate — it closes a coverage gap in existing fallbacks.
- **Guaranteed**: no branding column is ever read or written; the primary key
  is never in the payload; empty numeric fields persist as `null` rather than
  `NaN`; reserved subdomains (`www`, `superadmin`, `app`, `admin`) are rejected
  because `src/middleware.ts` routes them to the platform; Lalamove and
  distance-delivery fields are only required once their feature is on; a zero
  delivery radius is rejected because it would place every address out of
  range; and the checkout upsell cannot outlive menu engineering in either
  direction.

The screen (`app/(superadmin)/tenant/[id].tsx`) writes General, Features,
Integrations and Delivery directly to Supabase under the superadmin's RLS
grant. Team lists staff read-only and Import is a placeholder; both state on
screen that they need the Phase 5 service-role bridge rather than presenting
controls that cannot work.

### Task 6 — Sales lead pipeline and RLS alignment (Phase 4)

Checked the live policies before writing anything, and the real state differed
from what the plan assumed:

```
select tablename, policyname, qual from pg_policies where tablename in (…);
select relname, relrowsecurity, policy_count from pg_class …;

leads                     RLS on, 1 policy on auth.users.raw_user_meta_data
lead_notes                RLS on, 0 policies  -> denies everyone
lead_status_history       RLS on, 0 policies  -> denies everyone
checkout_leads            RLS on, already app_users-based
platform_payment_methods  RLS on, already app_users-based
checkout_lead_status_history  does not exist in the database
```

So the migration is narrower than planned (checkout leads needed nothing) and
also wider (two tables were unreachable by anyone but service role, not just by
the superadmin). `raw_user_meta_data->>'role'` is NULL for every user in this
project, so the `leads` policy grants access to nobody; the web console works
only because its server actions use the service-role client.

- **Validation command**: `npx jest lib/leads.test.ts`
- **RED**: `TS2307: Cannot find module './leads'` (commit `62fe8bc`)
- **GREEN**: `Tests: 25 passed, 25 total` (commit `a1d5d60`)
- **Nav RED**: `lib/superadmin-nav.test.ts` "defines the platform tabs" failed
  with the three-tab registry against a four-tab expectation — a runtime RED,
  1 failed / 18 passed (commit `b7b4ac2`)
- **Nav GREEN**: back to 19/19; full app suite 539/539 (commit `e5bb392`)
- **Guaranteed**: status keys match the `leads.status` CHECK constraint, so a
  schema change breaks the build rather than the screen; a converted or lost
  lead offers no further transition, which stops the funnel counts being
  corrupted by a reopen; no transition ever offers the status the lead already
  holds; search spans name, email and phone.

A fixture was corrected here rather than the implementation: the lost-lead
fixture spread the new-lead fixture and inherited its email, so a search for
"ana" legitimately matched two leads. Distinct contact details keep the
case-insensitivity assertion honest.

### Task 7 — Superadmin API bridge (Phase 5, partial)

- **Validation command**: `npx jest --config jest.config.cjs tests/unit/superadmin-bridge.test.ts`
- **RED**: `Cannot find module '@/lib/superadmin/bridge'` (commit `5546fd9`)
- **GREEN**: `Tests: 19 passed, 19 total` (commit `ea83d8b`)
- **Refactor**: `lib/mcp-auth` already exported an equivalent
  `extractBearerToken`; the duplicate was removed and the canonical one
  re-exported, still 19/19 (commit `faa1a92`). An over-specified assertion went
  with it — the duplicate trimmed leading whitespace, which HTTP headers never
  carry.
- **Route**: `src/app/api/superadmin/[action]/route.ts` (commit `da4e482`),
  `tsc --noEmit` and `eslint` clean.
- **Guaranteed**: the allowlist holds exactly the nine service-role operations;
  dispatch uses `hasOwnProperty` so `constructor` / `__proto__` cannot resolve
  as actions; unknown actions 404 before any auth work; missing or non-Bearer
  tokens 401; a valid token whose `app_users.role` is not `superadmin` gets
  403; malformed JSON and missing fields get 400 naming the field.

The route verifies the token with an anon-key client and then re-reads the role
from `app_users` with the service-role client, because a JWT can carry stale
metadata. **No handler is wired yet** — an allowlisted, authorized, validated
request answers 501 rather than reporting work it did not do.

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
| 15 | The editor never reads or writes a branding column | `lib/tenant-form.test.ts:never writes a branding column` | unit | PASS |
| 16 | The editor opens cleanly on a freshly created, all-null tenant | `lib/tenant-form.test.ts:toFormValues — a freshly created tenant` | unit | PASS |
| 17 | Empty numeric fields persist as null, never NaN | `lib/tenant-form.test.ts:writes an empty numeric field back as null, not NaN` | unit | PASS |
| 18 | Reserved subdomains are rejected as slugs | `lib/tenant-form.test.ts:rejects the reserved subdomain %s` | unit | PASS |
| 19 | Delivery credentials and fees are required only once their feature is on | `lib/tenant-form.test.ts:validateTenantForm — delivery` | unit | PASS |
| 20 | The checkout upsell cannot outlive menu engineering in either direction | `lib/tenant-form.test.ts:applyFeatureToggle` | unit | PASS |
| 21 | Lead status keys match the database CHECK constraint | `lib/leads.test.ts:matches the database status check constraint` | unit | PASS |
| 22 | A converted or lost lead offers no further transition | `lib/leads.test.ts:allowedNextStatuses` | unit | PASS |
| 23 | Lead search spans name, email and phone | `lib/leads.test.ts:filterLeads` | unit | PASS |
| 24 | Pipeline counters are correct, including an empty pipeline | `lib/leads.test.ts:summarizeLeads` | unit | PASS |

## Coverage

```
npx jest lib/session-resolve.test.ts lib/impersonation.test.ts \
  lib/tenant-list.test.ts lib/superadmin-nav.test.ts \
  lib/tenant-form.test.ts --coverage …

File                | % Stmts | % Branch | % Funcs | % Lines
 impersonation.ts   |     100 |      100 |     100 |     100
 leads.ts           |     100 |    91.66 |     100 |     100
 session-resolve.ts |     100 |      100 |     100 |     100
 superadmin-nav.ts  |     100 |      100 |     100 |     100
 tenant-form.ts     |   98.57 |    96.42 |     100 |     100
 tenant-list.ts     |     100 |      100 |     100 |     100

Tests: 154 passed, 154 total
```

Against the project's 80% floor. The two residual uncovered branches in
`tenant-form.ts` are the non-finite fallbacks in `inputToNumber` and
`checkCoordinate`, which validation already rejects upstream.

`npx tsc --noEmit` reports no errors in any file touched by this work.

## Known gaps

- **Screens are not render-tested.** The app's Jest config only runs pure-logic
  roots (`lib/`, `theme/`), so the new screens are covered indirectly through
  source-level guardrails, matching the existing `workspace-switcher-mount`
  pattern. The sign-in and impersonation flows still need one manual pass on a
  device.
- **Team and Import tabs are not functional.** Team lists staff read-only;
  adding, removing and password resets need the service-role bridge, as does
  AI menu import. Both tabs say so on screen.
- **Migration `20260727000000_leads_rls_app_users.sql` is APPLIED** (approved
  in-session). Verified afterwards: `leads`, `lead_notes` and
  `lead_status_history` each carry exactly one `app_users`-based FOR ALL policy,
  and the dead `raw_user_meta_data` policy is gone.
- **Phase 5 is half done.** The bridge authenticates, authorizes and validates,
  but dispatches to nothing: all nine actions return 501. Team, Import,
  Convex/Supabase deploy and MCP keys therefore remain web-only.
- **Phase 6 (platform analytics) is not started.**
- **Two suites fail under the ROOT jest config**:
  `webnegosyo-app/lib/{order-item-images,printer-native-load}.test.ts`
  (`ReferenceError: Cannot access 'mockFrom' before initialization`). These are
  mobile-app tests written for the app's own ts-jest config, which hoists
  `jest.mock` differently; under `webnegosyo-app/jest.config.js` they pass. Both
  files were last touched by commit `78f2391`, unrelated to this work. Root
  suite: 3012 passed / 3 failed of 3015.
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
| `f18ae1d` | RED — tenant editor form reproducer |
| `a4d677c` | GREEN — tenant editor form logic (45/45) |
| `b253b71` | GREEN — tenant editor screen (124/124 across five suites) |
| `6ea665c` | Coverage — all-null tenant case (branches 80.35% -> 96.42%) |
| `62fe8bc` | RED — lead pipeline reproducer |
| `a1d5d60` | GREEN — lead pipeline logic (25/25) |
| `b7b4ac2` | RED — Leads tab expectation + RLS migration |
| `e5bb392` | GREEN — leads surface (539/539 full suite) |
| `5546fd9` | RED — API bridge reproducer |
| `ea83d8b` | GREEN — bridge contract (19/19) |
| `faa1a92` | Refactor — reuse the canonical bearer extractor (19/19) |
| `da4e482` | GREEN — bridge route with bearer auth |
