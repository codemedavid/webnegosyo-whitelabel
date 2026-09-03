# TDD Evidence: Team & Staff Management in the Merchant App

**Source plan**: inline `/plan` output (2026-08-29) — no `.plan.md` artifact; journeys derived during planning.
**Scope**: staff management from the webnegosyo-app via a new `manage-staff` Supabase Edge Function. The superadmin side (create owner/staff accounts, transfer ownership) was verified as already built in `src/actions/users.ts` + `src/components/superadmin/{add-tenant-user-dialog,tenant-users-list}.tsx` — no changes made there.

## User journeys

1. As a store owner, I want to add staff accounts from my phone and choose exactly what each one can do, so I never have to open the web admin to run my team.
2. As a store owner, I want to change a staff member's permissions, branch, pinned opening screen, and password, and remove accounts, so I manage everyone from one screen.
3. As a branch admin (branch-locked account holding `branch_staff`), I want to manage only my own branch's staff, and never anyone else's.
4. As the platform, staff writes must be tenant-safe: the tenant and authority always derive from the caller's JWT-verified `app_users` row, never from the request body.

## RED → GREEN cycle (checkpoint commits on `main`)

| Stage | Commit | Evidence |
|---|---|---|
| RED — edge core | `4f45cb45` | `npx jest --config jest.config.cjs tests/unit/manage-staff-core.test.ts` → module-not-found on `supabase/functions/manage-staff/staff-core` (intended missing implementation) |
| GREEN — edge core | `abb95748` | same command → **30 passed** |
| RED — app client | `8fb8cbba` | `npx jest lib/staff-service.test.ts` (webnegosyo-app) → TS2307 module missing |
| GREEN — app client | `f8f7897c` | same command → **8 passed** |
| RED — Team screen | `333e3fb2` | `npx jest lib/team-roster.test.ts lib/team-screen-mount.test.ts` → **5 failed** (files missing) |
| GREEN — Team screen | `4183be4b` | same command + staff-service → **17 passed**; `npx tsc --noEmit` clean |

Note: `4183be4b` also carries the concurrent session's `GlobalKitchenAutoPrint` mount hunks in `app/(main)/_layout.tsx` — the file was dirty from parallel printer work and hunk-level splitting was unsafe while that session was actively committing.

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 1 | Edge-core permission keys and default-screen map match the web source of truth exactly | `tests/unit/manage-staff-core.test.ts` (parity block) | unit | PASS |
| 2 | Non-managers (plain staff, non-admin roles) get 403 from every action | same | unit | PASS |
| 3 | Owner sees/acts on all tenant staff; a branch admin only its own branch plus itself | same | unit | PASS |
| 4 | Cross-tenant records are unreachable even with a matching user id | same | unit | PASS |
| 5 | Create validates email/password/display name/permission keys/branch; enforces the per-branch cap (default 3, plan-raisable); drops uncovered pinned screens | same | unit | PASS |
| 6 | Branch admin can never create a store-wide account or touch another branch | same | unit | PASS |
| 7 | The owner account can never be edited, re-passworded, or removed via this channel | same | unit | PASS |
| 8 | Permission updates clear a pinned screen the new grants no longer cover | same | unit | PASS |
| 9 | App client shapes every action body correctly, maps rows to `StaffMember`, and unwraps both `{success:false}` refusals and `FunctionsHttpError` context messages | `webnegosyo-app/lib/staff-service.test.ts` | unit | PASS |
| 10 | `canOpenTeam` mirrors the server's front door (owner/superadmin/branch admin; demo refused) | same | unit | PASS |
| 11 | Team route is registered as a utility screen (`href: null`), reachable from Account gated on `canOpenTeam`, uses only `lib/staff-service` (never raw `app_users`), and renders from the shared registries | `webnegosyo-app/lib/team-screen-mount.test.ts` | guardrail | PASS |
| 12 | Every permission key and every workspace tab has a display label; roster summary truncates at 3 | `webnegosyo-app/lib/team-roster.test.ts` | unit | PASS |

## Full-suite validation

- webnegosyo-app: `npx jest` → **236 suites / 3310 tests passed**
- web repo: `npx jest --config jest.config.cjs` → **549 suites passed, 6466 passed / 8 skipped** (pre-existing skips)
- `npx eslint` on all new files in both roots → clean (the web repo's 88 pre-existing lint errors are in untouched files)
- `npx tsc --noEmit` (webnegosyo-app) → clean

## Deployment

`manage-staff` deployed to the platform Supabase project (version 2, ACTIVE, `verify_jwt: true`) on 2026-08-29. A version 1 from ~2026-08-16 existed and was replaced; this repo's `supabase/functions/manage-staff/` is now the source of truth. The Team screen itself ships with the next OTA/EAS update of the merchant app.

## Known gaps

- No integration test hits the deployed function with a real JWT; the Deno wiring (`index.ts`) is covered only by the delete-account-proven pattern plus the tested core.
- The Team entry lives on the Account screen (not the Business workspace) because Business is hidden for single-branch stores; if a tab placement is wanted later, add `team` to a workspace **and** keep the route file in the same commit.
- Coverage thresholds are not configured per-file in either Jest root; the new pure modules are effectively fully covered by the suites above, but no numeric report was generated.
