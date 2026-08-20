# TDD Evidence — Merchant-Side MCP (Phases 1–6)

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

### Phase 4 — merchant analytics reads (built 2026-08-20)
- New ops `get_sales_summary` (orders / revenue / AOV / merchant-local daily series, routed by `resolveOrderBackend` like menu-performance) and `get_upsell_performance` (Convex-only funnel; `available: false` when the tenant has no analytics deployment). Both inherit the merchant surface tenant-pinned.
- RED: `npm test -- --testPathPatterns="sales-summary|upsell-performance"` → 2 suites failed compiling (modules absent) (commit `8ad823a`).
- GREEN: same target → 20/20; `mcp-` filter → 20 suites / 141 tests (commit `527306d`).
- Guarantees: reads never fall back to the wrong database; empty/truncated/unreachable reads carry explicit `coverage`/`available` notes instead of fabricated zeros; missing tenant THROWS.

### Phase 5 — launch_product composite (built 2026-08-20)
- New `src/lib/mcp/launch-product.ts` orchestrator + op: item (badge included) + optional photo import + optional complementary upsell from an existing item + live menu URL (custom domain preferred, else slug subdomain).
- RED: `npm test -- --testPathPatterns="launch-product"` → suite failed compiling (commit `adfb3b0`).
- GREEN: `launch-product|mcp-` → 21 suites / 151 tests (commit `3a48568`).
- Guarantees: item-creation failure aborts everything; once the item exists, a failed extra reports `status: 'failed'` with the reason instead of throwing the launch away; upsell direction is existing→new (`pair_type: 'complementary'`).

### Phase 6 — merchant key management (built 2026-08-20)
- Tenant-scoped service fns in `mcp-keys-service.ts` (`createMerchantMcpKey` mints scopes `['tenant_admin']` + `tenant_id`; `revokeMerchantMcpKey` filters by key id AND tenant id), `resolveMerchantMcpConnectUrl`, server actions deriving the tenant from the caller's session (never from client args, gated on `store_setup` permission + `mcp_enabled` flag), `/[tenant]/admin/mcp` "Connect AI" page, sidebar entry under Store Setup.
- RED: `npm test -- --testPathPatterns="merchant-mcp-keys"` → 8/8 failed (missing exports) (commit `bf0a1e0`).
- GREEN: `merchant-mcp-keys|mcp-keys-service|connect-url` → 3 suites / 18 tests (commit `9c64a30`); UI commit `9c6c2e1`.
- Migrations APPLIED to production via Supabase MCP 2026-08-20: `mcp_api_keys_tenant_binding` (verified: columns + validated CHECK) and `tenants_mcp_enabled` (default false — no merchant sees the page until enabled).

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
| 8 | Sales summary reads the tenant's OWN backend; empty/failed/truncated reads carry coverage notes, never zeros | `tests/unit/sales-summary.test.ts` | unit | PASS | `npm test -- --testPathPatterns=sales-summary` |
| 9 | Upsell funnel is Convex-only; no deployment → `available: false`, never a fabricated zero funnel | `tests/unit/upsell-performance.test.ts` | unit | PASS | `npm test -- --testPathPatterns=upsell-performance` |
| 10 | launch_product: item failure aborts; extras failing after the item exists report themselves instead of throwing | `tests/unit/launch-product.test.ts` | unit | PASS | `npm test -- --testPathPatterns=launch-product` |
| 11 | Merchant keys mint as tenant_admin+tenant_id; revocation filters by key AND tenant; hash never selected | `tests/unit/merchant-mcp-keys.test.ts` | unit | PASS | `npm test -- --testPathPatterns=merchant-mcp-keys` |
| 12 | All three analytics/launch ops appear on the merchant surface WITHOUT a tenantId field | op-registration blocks in the three suites above | unit | PASS | same |

## Coverage

`npm test -- --testPathPatterns="mcp-" --coverage --collectCoverageFrom="src/lib/mcp/**/*.ts" --collectCoverageFrom="src/lib/mcp-auth.ts"` → **All files 91.43% lines / 82.75% branches**. New modules: merchant-config 100%, merchant-ops 96.8%, register-merchant-tools 100%, oauth-metadata 100%. (provisioning-ops function coverage is low here because its `execute` closures are exercised by its own suite via service mocks, not the mcp-* filter.)

Full repo run: 494/499 suites pass; the 5 failures (`leads-*`, `order-token`, `cache`, `inventory-live-e2e`) are pre-existing environmental failures — the fresh worktree has no `.env.local` (`Missing NEXT_PUBLIC_SUPABASE_URL`). None import MCP code.

Lint: `npx eslint` over every touched file → 0 errors, 6 warnings (unused `_args` in typed test mocks). Repo-wide `npm run lint` errors (26) are all pre-existing in untouched files.

## Known gaps & deliberate deviations from the plan

- **No `delete_*` ops**: `op-safety.ts` fails closed on destructive op names at import AND dispatch. "Remove item" is served by `update_menu_item { is_available: false }`. Adding true deletes means deliberately relaxing that guardrail — deferred as a product decision.
- **Migration `20260825120000_mcp_api_keys_tenant_binding.sql` APPLIED to production 2026-08-20** via Supabase MCP (`tenant_id` columns on all three tables + validated scope↔tenant CHECK verified post-apply). Superadmin keys are untouched (`tenant_id` NULL). The merchant surface goes live once this branch deploys.
- **Staff gating is coarse**: any `app_users` row with `role='admin'` + `tenant_id` can authorize; per-feature staff permissions (staff-permissions registry) not consulted yet.
- **Merchant login bounce goes to apex `/login`** — merchants who only ever log in on their subdomain won't have an apex session cookie; UX to be validated in phase 6 (connect-URL + admin UI, not yet built).
- Phases 4–6 shipped 2026-08-20 (see phase sections above). Coverage rerun: `92.73% lines / 82.24% branches` over the MCP layer + new query modules, 179 tests in the merchant/MCP filter.
- The "Connect AI" page is server-action-gated (session-derived tenant, `store_setup` permission, `mcp_enabled` flag); the page/actions themselves have no jsdom tests — the tested boundary is the service layer beneath them.
- E2E against the live transport not run (needs deploy; both migrations are now applied).

## Merge evidence (if commits are squashed)

RED commits: `e0fccff` (phase 1), `e167cc4` (phase 3), `0e34448` (phase 2), plus discovery RED inside `ff264bb`. GREEN commits: `dd10cc0`, `ff264bb`, `be3c441`, `9c0afdb`. Each GREEN rerun executed the same test target that previously failed.
