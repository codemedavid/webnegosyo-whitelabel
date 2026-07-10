# TDD Evidence — Tenant Staff Management + Per-Feature Permissions

## Source plan

Inline plan approved in-session (2026-07-10); no `*.plan.md` artifact. One approved-scope
simplification: staff CRUD runs in Next.js server actions using the existing service-role
admin client (`src/lib/supabase/admin.ts`) instead of a new Supabase edge function — staff
management is web-only and the Next.js server already holds the service role.

## User journeys

1. As a tenant owner, I can add up to 3 staff accounts with per-feature permissions from
   Settings → Staff & Permissions, and edit/reset-password/remove them.
2. As a staff member granted only `orders`, I see and can access only Orders (plus
   dashboard/settings-account) on the web admin, the merchant mobile app, and the desktop POS.
3. As any admin, I manage my own email and password in Settings → Account; as an owner I also
   manage Lalamove API keys there.
4. The legacy branding form is gone from Settings (replaced by a link to Branding Studio).

## Task report

### 1. Permission registry + staff service (web)
- **RED**: `npx jest tests/unit/staff-permissions.test.ts tests/unit/staff-service.test.ts` →
  `Test Suites: 2 failed … Cannot find module '../../src/lib/staff-service'` (commit `57021ba`)
- **GREEN**: same command → `Tests: 47 passed, 47 total` (commit `8e92d40`)
- Guarantees: owner/superadmin/legacy-null admins have full access; restricted staff limited to
  granted keys; max-3 limit excludes the owner and other tenants; owner rows cannot be modified,
  password-reset, or removed via the staff service; unknown/empty permission lists rejected;
  route/tab/POS-screen permission maps; sidebar filtering is non-mutating.

### 2. Schema + web wiring (commit `f7a1e3b`)
- Migration `supabase/migrations/20260710120000_staff_management.sql`: `is_owner`,
  `permissions`, `display_name`, `email` on `app_users`; earliest-admin owner backfill; email
  backfill from `auth.users`; ≤3-staff trigger backstop. **NOT YET APPLIED to the database.**
- Server actions `src/app/actions/staff.ts` (owner-verified via `verifyTenantOwner`); settings
  page redesigned (branding form removed, Staff/Account/Lalamove cards added); middleware
  redirects staff off non-permitted `/admin/<section>` routes; sidebar filtered.
- Validation: `npx tsc --noEmit` clean for `src/`; `npx eslint <changed files>` clean.

### 3. Merchant mobile app (commits `293f844` RED, `766e8f9` GREEN)
- **RED**: `npx jest lib/staff-permissions.test.ts` (in `webnegosyo-app/`) → module not found.
- **GREEN**: same → `Tests: 7 passed`; combined with workspaces suite: 19 passed.
- Guarantees: tab gating (`isTabAllowed`) and workspace filtering/default-tab repointing
  (`allowedWorkspaces`). Wired into auth store, login, session restore, tab bar, and
  WorkspaceSwitcher.

### 4. Desktop POS (commit `b244521`)
- Permission snapshot flows through `resolveTenant`, the offline `PosTenantCache`, and gates
  the Orders/POS tabs with a no-access fallback. `npx tsc --noEmit -p tsconfig.web.json` clean.
- No test infra exists in `webnegosyo-desktop`; the ported `hasPermission` is line-identical to
  the web/mobile implementations that are under test (known gap, below).

### 5. Server-action hardening (commit `01a55e5`)
- `verifyTenantAdmin` → `verifyTenantPermission(tenantId, <key>)` across orders/customers/
  bundles/order-types/payment-methods/menu-engineering services and orders/branding/
  hero-designer/menu-engineering/lalamove actions (65 mechanical line swaps).
- Validation: `npx jest tests/unit` → **94 suites, 1358 tests passed**; `tsc --noEmit` clean.

## Test specification

| # | What is guaranteed | Test target | Type | Result |
|---|--------------------|-------------|------|--------|
| 1 | Owners/superadmins/legacy-null admins pass every permission check | `tests/unit/staff-permissions.test.ts` (hasPermission) | unit | PASS |
| 2 | Restricted staff pass only granted keys | same | unit | PASS |
| 3 | Admin routes map to the right permission; dashboard/settings ungated | same (permissionForAdminPath) | unit | PASS |
| 4 | Sidebar filtering drops gated leaves/empty groups, never mutates input | same (filterSidebarEntriesByPermission) | unit | PASS |
| 5 | 4th staff creation rejected; owner and other tenants excluded from count | `tests/unit/staff-service.test.ts` (createStaff) | unit | PASS |
| 6 | Invalid email/short password/unknown permission/blank name rejected | same | unit | PASS |
| 7 | Owner cannot be edited, password-reset, or removed; cross-tenant targets rejected | same | unit | PASS |
| 8 | Mobile tabs and workspaces filter by permission; defaultTab repoints | `webnegosyo-app/lib/staff-permissions.test.ts` | unit | PASS |
| 9 | No regressions across the platform | `npx jest tests/unit` (1358 tests) | unit | PASS |

## Coverage

`npx jest tests/unit/staff-{permissions,service}.test.ts --coverage` →
`staff-permissions.ts` 100% stmts/lines (97.67% branch), `staff-service.ts` 100% everywhere.

## Known gaps / follow-ups

- **Migration not applied** — run `20260710120000_staff_management.sql` against the Supabase
  project before deploying; all three clients tolerate missing columns until then only in the
  sense that they'd error on the new selects, so apply first.
- Desktop POS port untested in-repo (no test infra); logic mirrors tested modules.
- Settings cards (React) have no component tests; behavior is thin over tested actions/services.
- Middleware permission gate not covered by an automated test (Next middleware harness absent);
  verified by typecheck + code review. Manual E2E per journey 2 recommended before release.
- `menu-items`/`categories` CRUD inside `admin-service.ts` still uses plain `verifyTenantAdmin`
  (menu permission enforcement there is UI + middleware only).

## Merge evidence (if squashed)

RED `57021ba`/`293f844` → GREEN `8e92d40`/`766e8f9` → feature commits `f7a1e3b`, `b244521`,
hardening `01a55e5`. Final state: 1358/1358 unit tests green, typechecks clean on all three apps.
