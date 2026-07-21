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
| 3 — Remote MCP transport at `/api/mcp/[transport]` + connection docs | ✅ done (`mcp-handler` + SDK; `register-tools` + `auth-adapter`; key-mint script; README) |
| 4A — Superadmin MCP Keys UI (generate/copy-once/revoke) | ✅ done (`mcp-keys-service` + `actions/mcp-keys` + `/superadmin/mcp-keys` page + sidebar link) |
| 4B — OAuth "automatic login" (no copy-paste) | ⬜ pending (Large; DCR + authorize/token + JWT; needs live connector testing) |
| 6 — E2E/docs + final coverage | ⬜ pending (live smoke test against a deployed URL) |

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
| 14 | `registerProvisioningTools` registers one MCP tool per op (name/description/inputSchema), dispatches tools/call via executeOp, returns text content, wraps errors as isError | `tests/unit/mcp-register-tools.test.ts` | unit | PASS | `jest mcp-register-tools` |
| 15 | `createMcpTokenVerifier` maps a valid key → AuthInfo (clientId=keyId, scopes), returns undefined (→401) on invalid/absent token | `tests/unit/mcp-auth-adapter.test.ts` | unit | PASS | `jest mcp-auth-adapter` |
| 16 | `listMcpKeys` maps rows to summaries, never selects/returns `key_hash`, surfaces DB errors | `tests/unit/mcp-keys-service.test.ts` | unit | PASS | `jest mcp-keys-service` |
| 17 | `createMcpKey` stores only the hash, returns plaintext once, validates label, records creator, surfaces DB errors | `tests/unit/mcp-keys-service.test.ts` | unit | PASS | `jest mcp-keys-service` |
| 18 | `revokeMcpKey` stamps `revoked_at` on the target id and returns the updated summary; surfaces DB errors | `tests/unit/mcp-keys-service.test.ts` | unit | PASS | `jest mcp-keys-service` |

RED→GREEN was verified for every file (module-missing RED for mcp-auth / branding-service / provisioning-ops; `verifyTenantAdmin`/cookie-client RED for the seam + integrations), each committed as a separate checkpoint.

**Jest-under-next/jest note:** top-level ES `import`s execute *before* an in-place `jest.mock` registers (SWC does not hoist the mock above imports). To mock service modules the SUT imports, `provisioning-ops.test.ts` uses inline `jest.fn()` factories + `jest.requireMock` and `require`s the SUT after the mocks register. Directly-injected stubs (the ProvisioningCtx seam) remain the preferred, transform-agnostic pattern.

## Coverage and known gaps
- `npx jest --config jest.config.cjs tests/unit/{mcp-auth,admin-service-provisioning,branding-service,integrations-provisioning,provisioning-ops,mcp-register-tools,mcp-auth-adapter}.test.ts` → **42 passed** (7 suites).
- `npx tsc --noEmit` on all new/edited source (`branding-service`, `actions/branding`, `tenants-service`, `payment-methods-service`, `mcp/provisioning-ops`, `mcp/register-tools`, `mcp/auth-adapter`, `api/mcp/[transport]/route`) → clean. ESLint on the new files → clean.
- **Not unit-tested (integration surface):** the `route.ts` adapter wiring and the `mint-mcp-key.mjs` script (syntax-checked only). These need a live smoke test against a deployed URL with a real minted key.
- Pre-existing, unrelated failures outside this work: `webnegosyo-app/lib/order-item-images.test.ts` (3) and several `tsc` errors in `product-detail-theme`/`revalidate-menu`/`supabase-deploy` test files. None reference files edited here.

## Next actions (Phase 6 — go-live)
1. Deploy, mint a key (`node scripts/mint-mcp-key.mjs "<label>"`), and smoke-test `tools/list` + one `tools/call` from Claude and ChatGPT against `/api/mcp/mcp`.
2. Verify `mcp-handler` runs statelessly on Vercel (no Redis) with `disableSse: true`; add `REDIS_URL` only if session resumability is wanted.
3. Optional: a superadmin UI to mint/revoke keys (wrapping `generateApiKey` + `mcp_api_keys`), and richer per-field tool schemas for a better AI authoring experience.
