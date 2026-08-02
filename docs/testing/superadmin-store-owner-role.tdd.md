# TDD Evidence — Superadmin Store Owner Role

**Source plan**: produced inline via `/ecc:plan` on 2026-08-02 (no `*.plan.md` artifact); journeys below were derived during that planning pass and confirmed against a production probe.
**Branch**: `feat/platform-supabase-order-parity`
**Migration**: `supabase/migrations/20260803120000_tenant_owner_uniqueness.sql` — **APPLIED to production 2026-08-02**

## Problem

`createTenantUser` hardcoded `role: 'admin'` and never set `is_owner`, so every tenant created through the superadmin panel after migration `20260710120000` was left with no owner. An ownerless store cannot add staff at all — `canManageStaff()` (`src/lib/staff-permissions.ts:87`) requires `is_owner` — and each of its admins consumes a staff seat against the per-branch cap.

Production probe before the change:

| Tenants with admins | Exactly 1 owner | **No owner** | >1 owner |
|---|---|---|---|
| 126 | 113 | **13** | 0 |

All 13 were created between 2026-07-24 and 2026-08-01, i.e. entirely within the window since the staff migration ran.

## User journeys

1. As a superadmin, I want to mark a new tenant account as the **store owner**, so the merchant can manage their own staff.
2. As a superadmin, I want to see **who owns** each store, so I can tell an owner from an ordinary admin.
3. As a superadmin, I want to **transfer ownership** to another admin, so a store is never stuck with the wrong owner.
4. As a superadmin, I want to be **warned when a store has no owner**, so the broken state is visible rather than silent.
5. As the platform, I want a store to have **exactly one owner**, always.

## Design decision

Implemented as a UI-level role selector writing the existing `app_users.is_owner` flag — **not** a new `role = 'owner'` enum value. `role === 'admin'` is compared across web, `webnegosyo-app`, RLS policies and the branch-scope layer; a new role string would have silently locked owners out of all of it.

## Task report

| Task | Validation command | RED | GREEN |
|---|---|---|---|
| Pure ownership rules | `npx jest tests/unit/tenant-ownership.test.ts` | `Cannot find module '@/lib/tenant-ownership'` | 22/22 passed |
| Transfer orchestration + rollback | `npx jest tests/unit/tenant-ownership-service.test.ts` | `Cannot find module '@/lib/tenant-ownership-service'` | 6/6 passed |
| Superadmin dialog + list UI | `npx jest tests/unit/superadmin-owner-role.test.tsx` | 10 failed, 3 passed | 13/13 passed |
| Backfill + uniqueness index | production probe (below) | 13 ownerless tenants | 0 ownerless, index rejects a second owner |

Checkpoint commits on the active branch, in order: `7ede766` (RED) → `e59a58b` (GREEN) → RED → GREEN (transfer service) → RED → `bffa4e6` (GREEN, UI) → migration commit.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A store with an owner rejects a second one, naming transfer as the remedy | `tenant-ownership.test.ts:assertCanAddOwner` | unit | PASS |
| 2 | A transfer stands the sitting owner down *before* raising the new one | `tenant-ownership-service.test.ts:stands the sitting owner down before raising the new one` | unit | PASS |
| 3 | A failed promotion restores the previous owner rather than leaving the store empty | `tenant-ownership-service.test.ts:restores the sitting owner when the promotion fails` | unit | PASS |
| 4 | A failed rollback reports both failures instead of one | `tenant-ownership-service.test.ts:reports both failures` | unit | PASS |
| 5 | Promoting a branch admin clears their branch (satisfies `app_users_outlet_scope_ck`) | `tenant-ownership.test.ts:frees a promoted owner from any branch confinement` | unit | PASS |
| 6 | Removing the last owner of a staffed store is refused | `tenant-ownership.test.ts:assertNotLastOwner` | unit | PASS |
| 7 | Removing the very last account is still allowed (closing a store) | `tenant-ownership.test.ts:allows removing the owner when they are the last account` | unit | PASS |
| 8 | Ownership cannot be handed to a superadmin account | `tenant-ownership.test.ts:refuses to hand a store to a superadmin account` | unit | PASS |
| 9 | The add-user dialog defaults to Store Owner when the store has none | `superadmin-owner-role.test.tsx:defaults to Store Owner` | component | PASS |
| 10 | The Store Owner option is disabled once a store has an owner | `superadmin-owner-role.test.tsx:does not offer a second owner` | component | PASS |
| 11 | Choosing Store Owner sends `is_owner: true` to the action | `superadmin-owner-role.test.tsx:creates the account as the owner` | component | PASS |
| 12 | The list marks the owning account and warns when there is none | `superadmin-owner-role.test.tsx:marks which account owns the store` / `warns when a staffed store has nobody in charge` | component | PASS |
| 13 | The confirmation names who loses ownership before transferring | `superadmin-owner-role.test.tsx:names who loses the store` | component | PASS |
| 14 | A failed transfer rolls the badge back to the original owner | `superadmin-owner-role.test.tsx:rolls the badge back when the transfer fails` | component | PASS |

## Validation output

```
npx jest                       -> Test Suites: 384 passed, 1 skipped; Tests: 4743 passed, 8 skipped
npx tsc --noEmit               -> no errors under src/
npx eslint <5 changed files>   -> clean
```

Coverage over the changed surface:

```
File                          | % Stmts | % Branch | % Funcs | % Lines
All files                     |   91.81 |       80 |   62.96 |   91.81
  tenant-ownership.ts         |     100 |      100 |     100 |     100
  tenant-ownership-service.ts |   97.05 |    63.63 |     100 |   97.05
  add-tenant-user-dialog.tsx  |   94.57 |    71.42 |    62.5 |   94.57
  tenant-users-list.tsx       |   84.76 |    81.25 |   41.66 |   84.76
```

## Production migration evidence

Applied via `mcp__supabase__apply_migration` (name `tenant_owner_uniqueness`), returned `{"success": true}`.

Probe after apply:

```
ownerless: 0        (was 13)
one_owner: 126
multi_owner: 0
owners_stuck_on_branch: 0
index_present: 1     (app_users_one_owner_per_tenant)
```

Negative test — attempting to flag a second owner on a tenant that already has one raised `unique_violation` and the probe block aborted without committing. Had the index not blocked it, the block would have failed with the distinct marker `INDEX_DID_NOT_BLOCK_SECOND_OWNER`.

Pre-apply safety checks: zero tenants had >1 owner (so the unique index could not fail on existing data), and no tenant had two admins sharing a `created_at` (so the earliest-admin backfill promotes exactly one row per tenant).

## Known gaps

- `updateTenantUser` still exposes `role`/`tenant_id` reassignment and does **not** carry ownership. Transfers go through `setTenantOwner`; the older action was left untouched beyond the shared auth-guard refactor.
- The transfer is two writes with no surrounding transaction. The rollback path is tested, but a Postgres function would make it atomic — deferred, and noted as the hardening step if this proves flaky.
- Function coverage on `tenant-users-list.tsx` is 41.66% because the pre-existing delete flow has no test here; its behavior is unchanged by this work.
- No E2E test. The superadmin panel has no Playwright suite in this repo.
- Lint reports 87 pre-existing errors elsewhere in the repo (mostly `webnegosyo-desktop/`); none are in the files changed here.
