# TDD Evidence — Merchant-Side MCP (Phases 1–3)

**Source plan**: inline `/ecc:plan` output (2026-08-17 session), confirmed with "proceed". No `*.plan.md` artifact.
**Branch**: `worktree-merchant-mcp` (worktree of `category-studio-management` base).

## User journeys

- As a merchant (tenant admin), I want to connect Claude/ChatGPT to my own store, so that I can manage my menu, bundles, upsells and analytics conversationally.
- As the platform operator, I need a merchant credential to be cryptographically pinned to exactly one tenant, so that no model output or smuggled argument can ever touch another store.
- As a merchant, I want the existing menu/bundle/upsell/analytics tools without ever seeing or supplying a `tenantId`.

## Task report (RED → GREEN per phase)

### Phase 1 — tenant-bound credentials
- `verifyMcpKey` now selects and returns `tenant_id`; `createMcpTokenVerifier` surfaces it as `AuthInfo.extra.tenantId`.
- RED: `npm test -- --testPathPatterns="mcp-auth|mcp-merchant-auth"` → 9 failed for the intended missing `tenantId` (commit `e0fccff`).
- GREEN: same target → 30/30 pass (commit `dd10cc0`).
- Guarantees: tenant binding comes from the key ROW (hash lookup), never from the caller; superadmin keys resolve `tenantId: null`; revocation and expiry semantics unchanged.

### Phase 3 — tenant-pinned merchant registry + route (built before phase 2; phase 2 depends on its scope)
- New `src/lib/mcp/merchant-ops.ts` (op exclusions + schema `tenantId` strip + server-side tenant injection), `register-merchant-tools.ts`, `merchant-config.ts`, transport route `/api/mcp/merchant/[transport]`, path-aware RFC 9728 discovery.
- RED: both new suites failed "Cannot find module merchant-ops" (compile-time RED, commit `e167cc4`); discovery RED: 3 failed (merchant metadata absent) in commit `ff264bb`.
- GREEN: `npm test -- --testPathPatterns="mcp-"` → 19 suites, 136 tests pass (commits `ff264bb`, `be3c441`).
- Guarantees: `create_tenant`/`list_tenants`/`get_tenant`/`configure_integration`/SMS ops are unreachable with a merchant credential; no merchant tool schema advertises `tenantId`; a smuggled `tenantId` is overwritten by the token-bound one; superadmin credentials are rejected on merchant tools; a `tenant_admin` credential without a binding fails closed; `/.well-known/oauth-protected-resource/api/mcp/merchant[...]` serves the `tenant_admin` document while superadmin URLs are unchanged.

### Phase 2 — tenant-bound OAuth issuance
- `oauth-service.ts`: `tenant_id` rides authorization codes → access-key rows → refresh-token rows and survives rotation. Authorize route gains a `tenant_admin` branch: session user must be an `app_users` row with `role='admin'` and a `tenant_id`; bounce target is `/login` (apex tenant-agnostic login); superadmin flow untouched.
- RED: `npm test -- --testPathPatterns="mcp-merchant-oauth"` → 5/5 failed (no tenant_id persisted) (commit `0e34448`).
- GREEN: `npm test -- --testPathPatterns="mcp-"` → 20 suites, 141 tests pass (commit `9c0afdb`).
- Guarantees: a refreshed merchant access token is still pinned; superadmin issuance keeps `tenant_id` NULL end-to-end; scope requests carrying both or neither of `superadmin`/`tenant_admin` are rejected as `invalid_scope`.

## Test specification

| # | What is guaranteed | Test file | Type | Result | Evidence |
|---|---|---|---|---|---|
| 1 | Merchant key resolves `{keyId, scopes:['tenant_admin'], tenantId}` from the DB row | `tests/unit/mcp-merchant-auth.test.ts` | unit | PASS | `npm test -- --testPathPatterns=mcp-merchant-auth` |
| 2 | Tool schemas never expose `tenantId`; registry = provisioning ops − exclusions | `tests/unit/mcp-merchant-ops.test.ts` | unit | PASS | `npm test -- --testPathPatterns=mcp-merchant-ops` |
| 3 | Smuggled `tenantId` is overwritten by the token-bound tenant | `tests/unit/mcp-merchant-ops.test.ts` | unit | PASS | same |
| 4 | Merchant tools reject superadmin scope and unbound tenant_admin creds (fail closed) | `tests/unit/mcp-register-merchant-tools.test.ts` | unit | PASS | `npm test -- --testPathPatterns=mcp-register-merchant-tools` |
| 5 | OAuth challenge points at the merchant RFC 9728 resource metadata | `tests/unit/mcp-register-merchant-tools.test.ts` | unit | PASS | same |
| 6 | Path-suffixed discovery serves per-resource documents; superadmin URLs unchanged | `tests/unit/mcp-merchant-discovery.test.ts` | integration (route handlers) | PASS | `npm test -- --testPathPatterns=mcp-merchant-discovery` |
| 7 | Tenant pin survives code → access key → refresh rotation; superadmin stays NULL | `tests/unit/mcp-merchant-oauth.test.ts` | unit | PASS | `npm test -- --testPathPatterns=mcp-merchant-oauth` |

## Coverage

`npm test -- --testPathPatterns="mcp-" --coverage --collectCoverageFrom="src/lib/mcp/**/*.ts" --collectCoverageFrom="src/lib/mcp-auth.ts"` → **All files 91.43% lines / 82.75% branches**. New modules: merchant-config 100%, merchant-ops 96.8%, register-merchant-tools 100%, oauth-metadata 100%. (provisioning-ops function coverage is low here because its `execute` closures are exercised by its own suite via service mocks, not the mcp-* filter.)

Full repo run: 494/499 suites pass; the 5 failures (`leads-*`, `order-token`, `cache`, `inventory-live-e2e`) are pre-existing environmental failures — the fresh worktree has no `.env.local` (`Missing NEXT_PUBLIC_SUPABASE_URL`). None import MCP code.

Lint: `npx eslint` over every touched file → 0 errors, 6 warnings (unused `_args` in typed test mocks). Repo-wide `npm run lint` errors (26) are all pre-existing in untouched files.

## Known gaps & deliberate deviations from the plan

- **No `delete_*` ops**: `op-safety.ts` fails closed on destructive op names at import AND dispatch. "Remove item" is served by `update_menu_item { is_available: false }`. Adding true deletes means deliberately relaxing that guardrail — deferred as a product decision.
- **Migration `20260825120000_mcp_api_keys_tenant_binding.sql` APPLIED to production 2026-08-20** via Supabase MCP (`tenant_id` columns on all three tables + validated scope↔tenant CHECK verified post-apply). Superadmin keys are untouched (`tenant_id` NULL). The merchant surface goes live once this branch deploys.
- **Staff gating is coarse**: any `app_users` row with `role='admin'` + `tenant_id` can authorize; per-feature staff permissions (staff-permissions registry) not consulted yet.
- **Merchant login bounce goes to apex `/login`** — merchants who only ever log in on their subdomain won't have an apex session cookie; UX to be validated in phase 6 (connect-URL + admin UI, not yet built).
- Phases 4–6 (merchant analytics reads, `launch_product` composite, admin key-management UI + `mcp_enabled` flag) are not started.
- E2E against the live transport not run (needs deploy + applied migration).

## Merge evidence (if commits are squashed)

RED commits: `e0fccff` (phase 1), `e167cc4` (phase 3), `0e34448` (phase 2), plus discovery RED inside `ff264bb`. GREEN commits: `dd10cc0`, `ff264bb`, `be3c441`, `9c0afdb`. Each GREEN rerun executed the same test target that previously failed.
