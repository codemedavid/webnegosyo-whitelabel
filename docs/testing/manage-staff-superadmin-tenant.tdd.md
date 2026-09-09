# TDD evidence — "No store access for this account" in Team management

## Source plan

No `*.plan.md` was supplied. Journeys were derived during this TDD run from the
reported symptom: the merchant app's Team screen (`webnegosyo-app/app/(main)/team.tsx`)
answered **"No store access for this account."** for every action.

## Diagnosis

`supabase/functions/manage-staff/index.ts` derived the acting store from the
caller's own `app_users` row and returned 403 when that row carried no
`tenant_id`. Confirmed against the platform database:

```sql
select role, is_owner, (tenant_id is null) as no_tenant, count(*) from app_users group by 1,2,3;
-- admin      | false | false | 47
-- admin      | false | true  | 1
-- admin      | true  | false | 174
-- superadmin | false | true  | 1     <-- the only account that can hit the 403
```

The superadmin row is the one with no tenant. The app nonetheless offers the
screen to that account — `canOpenTeam` in `webnegosyo-app/lib/staff-service.ts`
returns `true` for `role === "superadmin"` — and a superadmin reaches the
merchant surface only by impersonating a store ("open as merchant",
`webnegosyo-app/lib/impersonation.ts`). So the store being viewed was known on
the phone and simply never reached the server.

The deployed function (v2) was byte-identical to the checked-in source, so the
defect was in the source, not a stale deploy.

## User journeys

1. As the platform superadmin viewing a merchant's store, I want to manage that
   store's team, so that I can fix a merchant's staff access for them.
2. As a store owner or branch admin, I want my staff calls to keep acting on my
   own store only, so that naming another store in a request changes nothing.

## Task report

### Task 1 — the server must know which store a superadmin is acting on

Added the pure `resolveStaffCaller(row, requestedTenantId)` to
`supabase/functions/manage-staff/staff-core.ts` and wired `index.ts` to it. A
tenant in the request body is honoured **only** for a caller whose own row says
`role === 'superadmin'`; every other caller's tenant still comes from their row
and the body value is discarded. Postgres RLS already grants that account
cross-tenant reach, so this widens no boundary.

- Command: `npx jest tests/unit/manage-staff-caller-tenant.test.ts`
- RED: `Test Suites: 1 failed` / `Tests: 8 failed, 8 total` — `resolveStaffCaller`
  did not exist in `staff-core.ts`.
- GREEN: `Test Suites: 1 passed` / `Tests: 8 passed, 8 total`.
- Guaranteed: an owner's row wins over a body value; a superadmin acts on the
  named store; a superadmin naming no store (or a blank one) is refused; a
  missing row and a non-superadmin row with no tenant are both refused 403.

### Task 2 — the phone must send the store it is viewing

Added `withTenantScope(invoke, tenantId)` to
`webnegosyo-app/lib/staff-service.ts` and applied it in the Team screen with
`useAuthStore(s => s.impersonatedTenantId)`. Off impersonation the value is
`null` and the request goes out byte-identical to before.

- Command (in `webnegosyo-app/`): `npx jest lib/staff-tenant-scope.test.ts`
- RED: `Test suite failed to run` — `TS2305: Module './staff-service' has no
  exported member 'withTenantScope'` (compile-time RED).
- GREEN: passing, and the Team-screen wiring is pinned by source assertion.
- Guaranteed: the viewed store is attached to every request while impersonating,
  and nothing is added when no store is being viewed.

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | An owner's tenant comes from their row; a body tenant is ignored | `tests/unit/manage-staff-caller-tenant.test.ts:takes the tenant from an owner row and ignores the request body` | unit | PASS | `npx jest tests/unit/manage-staff-caller-tenant.test.ts` |
| 2 | A superadmin acts on the store it named | same file: `lets a superadmin act on the store it named` | unit | PASS | same |
| 3 | A superadmin naming no store (or a blank one) is refused 403 | same file: `refuses a superadmin who named no store` / `…a blank store` | unit | PASS | same |
| 4 | No access row at all still answers "No store access for this account." | same file: `refuses an account with no access row at all` | unit | PASS | same |
| 5 | A non-superadmin row with no tenant is refused whatever the body says | same file: `refuses a non-superadmin row that carries no tenant, body value or not` | unit | PASS | same |
| 6 | The entrypoint resolves through the core and passes the body tenantId | same file: `manage-staff entrypoint wiring` | source-pin | PASS | same |
| 7 | Existing owner/branch-admin authorization is unchanged | `tests/unit/manage-staff-core.test.ts` | unit | PASS | `npx jest tests/unit/manage-staff` (38 passed) |
| 8 | The viewed store rides along on every request while impersonating | `webnegosyo-app/lib/staff-tenant-scope.test.ts:attaches the viewed store to every request` | unit | PASS | `npx jest lib/staff-tenant-scope.test.ts` |
| 9 | Requests are untouched when no store is being viewed | same file: `leaves the request untouched when no store is being viewed` | unit | PASS | same |
| 10 | The Team screen scopes its transport to the impersonated store | same file: `Team screen wiring` | source-pin | PASS | same |

## Coverage and known gaps

- `npx jest tests/unit/manage-staff --coverage --collectCoverageFrom='supabase/functions/manage-staff/staff-core.ts'`
  → `staff-core.ts` **98.58% statements, 83.45% branches, 100% functions**.
- `npx jest lib/staff-tenant-scope lib/staff-service --coverage --collectCoverageFrom='lib/staff-service.ts'`
  → `staff-service.ts` **92.15% statements, 100% functions**.
- Regression sweeps: `npx jest tests/unit/staff tests/unit/manage-staff` → 13 suites,
  181 tests passed. `(webnegosyo-app) npx jest lib/staff lib/team` → 5 suites, 30 tests passed.
- Gaps: `index.ts` runs only under Deno and is covered by source-pinning
  assertions, not execution. `npx tsc --noEmit` reports pre-existing, unrelated
  errors in `src/lib/mcp/superadmin-consent.ts` and two `tests/product-detail-*`
  files; `webnegosyo-app/lib/screen-primitives.test.ts` (untracked, from other
  in-flight work) fails independently of this change.

## Merge evidence

- RED: `1fc8a842 test: add reproducer for superadmin "No store access" in Team management`
- GREEN: `10cd7200 fix: let a superadmin manage a viewed store's team`
- No refactor commit was needed; the fix landed in its final shape.

## Deployment (required — the fix is inert until then)

1. ~~Deploy the edge function~~ — **done 2026-09-04** via Supabase MCP
   (`deploy_edge_function`), v2 → v3, ACTIVE, `verify_jwt` still true. Smoke
   test: no Authorization header → `401`; anon token → `401 {"success":false,
   "error":"Invalid or expired session."}`, i.e. the new bundle boots and runs
   the handler.
2. **Pending:** ship the app change — OTA update or EAS build for
   `webnegosyo-app`.

Both halves are needed. The server alone lets a superadmin act once a tenant
arrives; the app alone sends a tenant the old server ignores.
