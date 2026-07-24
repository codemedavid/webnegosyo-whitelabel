# TDD Evidence — Tenant Staff Management (integration into current `main`)

**Date:** 2026-07-24
**Branch:** `integrate/tenant-staff-management` (rebase of `feat/tenant-staff-management` onto `main`)
**Source plan:** inline `/ecc:plan` output (integration of an existing, fully-built feature branch)

## Context

The tenant teams feature (owner + up to 3 staff, per-feature permissions across web /
merchant app / desktop POS) was already implemented with TDD on
`feat/tenant-staff-management` (8 commits, 2026-07-10) but never merged. `main` advanced
49 commits in the interim. This work **integrates** that branch: rebase + conflict
resolution, closes the documented server-side gating gap, applies the DB migration, and
re-verifies against current `main`.

## User journeys (from the original feature + this integration)

1. As a tenant **owner**, I manage up to 3 staff accounts and toggle each staff member's
   per-feature access (Settings → Staff & Permissions).
2. As a **staff** member, I only see the windows my permissions allow — web sidebar/routes,
   mobile tabs, and POS tabs are filtered; server actions reject features I lack.
3. As a **legacy admin / owner / superadmin**, nothing changes (`permissions: null` = full
   access; owners and superadmins always pass).

## Integration work

| Step | Summary |
|---|---|
| Rebase | Replayed 8 branch commits onto `main`. Conflicts in 5 service files resolved with the keep-both rule: run `verifyTenantPermission` on the interactive path (`!ctx`), preserve the `ctx`/MCP provisioning bypass. `branding.ts` took `main`'s `writeBrandingWithClient` refactor with the auth swapped to `verifyTenantPermission(tenantId, 'store_setup')`. |
| Gating gap | Closed the documented menu/category gap in `admin-service.ts` and gated `addon-library-service.ts` (added on `main` after the split). Both → `'menu'`. |
| Migration | Applied `20260710120000_staff_management.sql` to the live DB (was unapplied). |

## RED → GREEN — new server-side menu gating

New reproducer: `tests/unit/staff-menu-gating.test.ts`.

- **RED** (`test:` commit): with bare `verifyTenantAdmin`, a staffer with `permissions:['orders']`
  (no `'menu'`) is NOT rejected by the 7 menu-domain mutations — 7 tests fail as expected;
  the 2 owner-allowed tests pass (mock proven sound).
  ```
  ✕ createCategory rejects   ✕ updateCategory rejects   ✕ createMenuItem rejects
  ✕ deleteMenuItem rejects   ✕ createAddonLibraryEntry rejects  ✕ updateAddonLibraryEntry rejects
  ✕ deleteAddonLibraryEntry rejects   ✓ createCategory resolves for the owner   ✓ createAddonLibraryEntry resolves for the owner
  Tests: 7 failed, 2 passed
  ```
- **GREEN** (`feat:` commit): after swapping to `verifyTenantPermission(tenantId, 'menu')`
  (interactive path only; `ctx`/MCP path untouched):
  ```
  Tests: 9 passed, 9 total
  ```

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Staffer without `menu` cannot create/update/delete categories | `staff-menu-gating.test.ts` | unit | PASS |
| 2 | Staffer without `menu` cannot create/update/delete menu items | `staff-menu-gating.test.ts` | unit | PASS |
| 3 | Staffer without `menu` cannot create/update/delete add-on library entries | `staff-menu-gating.test.ts` | unit | PASS |
| 4 | Owner (and superadmin / legacy null-permission admin) still allowed | `staff-menu-gating.test.ts` | unit | PASS |
| 5 | MCP/`ctx` provisioning path stays unauthenticated (no regression) | `admin-service-provisioning.test.ts` + others | unit | PASS |
| 6 | Permission registry logic (hasPermission, filters, path mapping) | `staff-permissions.test.ts`, `staff-service.test.ts` | unit | PASS |

## Full verification

| Gate | Command | Result |
|---|---|---|
| Staff + provisioning suites | `jest --config jest.config.cjs --testPathPatterns="staff\|provisioning\|addon-library"` | 103 passed, 9 suites |
| Full unit suite | `jest --config jest.config.cjs` | **1892 passed, 3 failed** |
| Lint | `eslint <changed files>` | clean |
| Build | `npm run build` | success, all routes compiled |
| DB | migration applied | 4 columns added; 113 owners + 144 emails backfilled |

### Known gaps / follow-ups

- **Pre-existing, unrelated failures (not from this work):** `webnegosyo-app/lib/printer-native-load.test.ts`
  and `order-item-images.test.ts` (3 tests) fail on a `mockFrom`-before-initialization
  hoisting bug in those files. They reference nothing in this change and were not touched by
  the branch.
- **Deferred gating:** `src/actions/facebook.ts` (Messenger → `settings`) and
  `src/actions/tenants.ts` (footer / flash-screen / Messenger / delivery → `settings`/`store_setup`)
  still use bare `verifyTenantAdmin`. Key mapping for footer/flash-screen is ambiguous; deferred
  rather than guess-mapped. These windows are UI-gated today; server gating is the hardening
  follow-up.
- **Repo hygiene (pre-existing):** two Jest configs (`jest.config.ts` broken under Node 22,
  `jest.config.cjs` correct). Tests must run with `--config jest.config.cjs`; `npm test` is
  ambiguous until `jest.config.ts` is removed.
- **Types:** `app_users` fields were merged into `database.ts`/`supabase.ts` by hand and now
  match the live schema; a full `generate_typescript_types` regen was skipped to avoid a large
  noisy diff.
