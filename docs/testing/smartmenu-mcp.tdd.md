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
| 1b — Branding writer extraction (cookie-free) | ⬜ pending |
| 1c — Integrations ctx (`updateTenantSupabase`, `createPaymentMethod`) | ⬜ pending |
| 2 — HTTP admin API (`/api/admin/*`, Bearer-authed, service-role) | ⬜ pending |
| 3 — Remote MCP tools at `/api/mcp/[transport]` | ⬜ pending |
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

RED→GREEN was verified for both files (module-missing RED for mcp-auth; `verifyTenantAdmin` cookie-path RED for the seam), each committed as a separate checkpoint.

## Coverage and known gaps
- `npx jest --config jest.config.cjs tests/unit/mcp-auth.test.ts tests/unit/admin-service-provisioning.test.ts` → **18 passed**.
- Pre-existing, unrelated failures outside this work: `webnegosyo-app/lib/order-item-images.test.ts` (3) and several `tsc` errors in `product-detail-theme`/`revalidate-menu`/`supabase-deploy` test files. None reference files edited here.
- Remaining seam writers (branding, `updateTenantSupabase`, `createPaymentMethod`) not yet threaded — see pending phases.

## Next actions
1. Extract a pure `buildBrandingUpdatePayload` + client-based branding writer; have `saveBrandingAction` delegate; add ctx path.
2. Thread ctx into `updateTenantSupabase` and `createPaymentMethod`.
3. Build `/api/admin/*` route handlers (Bearer → `verifyMcpKey` → `createAdminClient()` → writers with ctx), `{success,data,error}` envelope.
4. Add remote MCP tools at `app/api/mcp/[transport]/route.ts`; connection README for Claude + ChatGPT.
