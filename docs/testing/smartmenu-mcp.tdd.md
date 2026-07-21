# SmartMenu MCP — TDD Evidence Report

**Branch:** `feat/smartmenu-mcp`
**Scope (locked):** Remote Streamable-HTTP MCP in the Next app; MVP = create tenant + build menu + branding; AI design generation and locations/teams deferred.

## Source plan
Journeys derived during this TDD run from the `/ecc:plan` output in-session (no `*.plan.md` artifact was written). The five grounding explorations mapped the reusable service layer.

## User journeys
1. As a superadmin, I authenticate an external AI (Claude/ChatGPT) to the admin surface with a Bearer API key, so I can drive it without a browser session.
2. As that AI, I call a domain writer (e.g. create category) with a service-role context and no cookie, so tenant setup works out-of-process.

## Progress
| Phase | Status |
|---|---|
| 0 — Bearer-key auth (`mcp-auth` + `mcp_api_keys` table) | ✅ done, migration applied |
| 1 — Injectable `ProvisioningCtx` seam on MVP writers | ✅ done (tenant, category, menu item, addon-library, upsell, bundle) |
| 1b — Branding writer extraction (cookie-free) | ✅ done (`@/lib/branding-service`, `saveBrandingAction` delegates + ctx path) |
| 1c — Integrations ctx (`updateTenantSupabase`, `createPaymentMethod`) | ✅ done |
| 2 — Provisioning-ops registry (`executeOp` dispatch) | ✅ done (`@/lib/mcp/provisioning-ops`, 11 ops) |
| 3 — Remote MCP transport at `/api/mcp/[transport]` + connection docs | ⬜ pending (transport lib choice) |
| 6 — E2E/docs + final coverage | ⬜ pending |

## Test specification
| # | What is guaranteed | Test file | Type | Result | Evidence |
|---|--------------------|-----------|------|--------|----------|
| 1 | `hashApiKey` is a stable 64-char sha-256 hex digest | `tests/unit/mcp-auth.test.ts` | unit | PASS | `jest mcp-auth` |
| 2 | `extractBearerToken` parses `Bearer`, is case-insensitive, rejects other schemes/empty | `tests/unit/mcp-auth.test.ts` | unit | PASS | `jest mcp-auth` |
| 3 | `generateApiKey` returns an `smk_live_`-prefixed key whose hash matches `hashApiKey` | `tests/unit/mcp-auth.test.ts` | unit | PASS | `jest mcp-auth` |
| 4 | `verifyMcpKey` resolves keyId+scopes for a valid key, looked up by hash not plaintext | `tests/unit/mcp-auth.test.ts` | unit | PASS | `jest mcp-auth` |
| 5 | `verifyMcpKey` throws on unknown key, revoked key, missing/malformed header, and DB error | `tests/unit/mcp-auth.test.ts` | unit | PASS | `jest mcp-auth` |
| 6 | `createCategory` with a ProvisioningCtx uses the injected client and never touches the cookie client | `tests/unit/admin-service-provisioning.test.ts` | unit | PASS | `jest admin-service-provisioning` |
| 7 | MCP path still injects `tenant_id` and still validates input (rejects short name) | `tests/unit/admin-service-provisioning.test.ts` | unit | PASS | `jest admin-service-provisioning` |
| 8 | A DB error from the injected client surfaces to the caller | `tests/unit/admin-service-provisioning.test.ts` | unit | PASS | `jest admin-service-provisioning` |
| 9 | `buildBrandingUpdatePayload` normalizes promotion_banners ''→[] and empty hero uuid/url→null | `tests/unit/branding-service.test.ts` | unit | PASS | `jest branding-service` |
| 10 | `writeBrandingWithClient` updates via injected client, validates, retries on missing column, surfaces DB errors | `tests/unit/branding-service.test.ts` | unit | PASS | `jest branding-service` |
| 11 | `updateTenantSupabase`/`createPaymentMethod` with ctx use the injected client, skip cookie auth | `tests/unit/integrations-provisioning.test.ts` | unit | PASS | `jest integrations-provisioning` |
| 12 | Ops registry exposes named ops; `executeOp` rejects unknown op + missing tenantId | `tests/unit/provisioning-ops.test.ts` | unit | PASS | `jest provisioning-ops` |
| 13 | `executeOp` dispatches each op to the correct service writer with tenantId + ctx (tenantId not leaked into payloads) | `tests/unit/provisioning-ops.test.ts` | unit | PASS | `jest provisioning-ops` |

RED→GREEN was verified for every file (module-missing RED for mcp-auth / branding-service / provisioning-ops; `verifyTenantAdmin`/cookie-client RED for the seam + integrations), each committed as a separate checkpoint.

**Jest-under-next/jest note:** top-level ES `import`s execute *before* an in-place `jest.mock` registers (SWC does not hoist the mock above imports). To mock service modules the SUT imports, `provisioning-ops.test.ts` uses inline `jest.fn()` factories + `jest.requireMock` and `require`s the SUT after the mocks register. Directly-injected stubs (the ProvisioningCtx seam) remain the preferred, transform-agnostic pattern.

## Coverage and known gaps
- `npx jest --config jest.config.cjs tests/unit/{mcp-auth,admin-service-provisioning,branding-service,integrations-provisioning,provisioning-ops}.test.ts` → **36 passed** (5 suites).
- `npx tsc --noEmit` on all edited source files (`branding-service`, `actions/branding`, `tenants-service`, `payment-methods-service`, `mcp/provisioning-ops`) → clean.
- Pre-existing, unrelated failures outside this work: `webnegosyo-app/lib/order-item-images.test.ts` (3) and several `tsc` errors in `product-detail-theme`/`revalidate-menu`/`supabase-deploy` test files. None reference files edited here.

## Next actions
1. **Phase 3 — remote MCP transport** at `app/api/mcp/[transport]/route.ts`: Bearer → `verifyMcpKey(createAdminClient())` → build `ProvisioningCtx` → advertise `listOps()` as MCP tools → `tools/call` dispatches through `executeOp`. Transport lib TBD (`mcp-handler` adapter vs hand-rolled JSON-RPC vs SDK direct).
2. Connection README for Claude remote connectors + ChatGPT custom connectors (one Bearer-keyed URL).
3. A superadmin UI/CLI to mint an `smk_live_` key via `generateApiKey()` (only the hash is stored).
