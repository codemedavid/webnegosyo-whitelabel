# TDD Evidence — Superadmin MCP Auth Redesign (Supabase OAuth 2.1)

**Source plan:** `docs/superpowers/plans/2026-08-31-superadmin-mcp-auth-redesign.md`
**Spec:** `docs/superpowers/specs/2026-08-31-superadmin-mcp-auth-redesign.md`
**Branch:** `feature/superadmin-mcp-supabase` (worktree `.worktrees/superadmin-mcp-supabase`)
**Date:** 2026-09-01

## User journeys

1. As a superadmin, I add `https://www.webnegosyo.com/api/mcp/mcp` to ChatGPT/Claude/Grok, sign in through the existing SmartMenu browser login, approve one consent card, and the client stays connected via standard OAuth refresh tokens.
2. As the platform, only a user whose **current** `app_users.role = 'superadmin'` may approve the connection or execute any MCP tool; revoking the role blocks the very next request.
3. As a merchant, my tenant MCP keys and OAuth flow keep working unchanged.

## Task report (Tasks 1–6 implemented in commits dba9cb07..c5bd2a05; Task 7 in ca26ec50)

| Task | Commit | What it did |
|---|---|---|
| 1 SDK boundary | `dba9cb07` | Upgraded Supabase SDK for OAuth-server support |
| 2 Discovery | `e0d444dc` | Protected-resource metadata names the Supabase issuer; no local authorization server for superadmin |
| 3 Token verify | `7637b6e9` | Supabase JWT verification + audience + current-role check |
| 4 Transport gate | `39014a07` | All MCP methods (initialize, tools/list, tools/call) require auth; 401 challenge with `resource_metadata` |
| 5 Consent | `b31c8acd` | `/superadmin/mcp/authorize` consent surface; preserves `authorization_id` through login; non-superadmin cannot approve |
| 6 Legacy retire | `c5bd2a05` | Custom superadmin OAuth issuer (authorize/token/register/JWT/JWKS branches) removed; merchant paths preserved |
| 7 Runbook + regression | `ca26ec50` | `docs/runbooks/superadmin-mcp-oauth.md` + full validation below |

Tasks 1–6 each followed the plan's RED-first steps in the worktree session that
produced those commits; this report records the final consolidated GREEN evidence.

## Validation actually run (2026-09-01, Task 7)

```bash
npm test -- --runInBand tests/unit/mcp-
# Test Suites: 28 passed, 28 total
# Tests:       243 passed, 243 total

npx tsc --noEmit
# 104 errors in worktree vs 138 on main working tree — all pre-existing;
# the single mcp-* error (tests/unit/mcp-auth.test.ts:91) exists identically on main.

npm run lint -- src/lib/mcp src/app/api/mcp src/app/superadmin/mcp tests/unit
# 3 errors, all in files untouched by this branch
# (admin-service-set-image-from-data, imagekit-server-upload, provisioning-ops tests — pre-existing).
```

## What the passing tests guarantee

| # | Guarantee | Test file | Result |
|---|---|---|---|
| 1 | Unauthenticated MCP requests get 401 + `resource_metadata` challenge pointing at Supabase | `tests/unit/mcp-superadmin-auth.test.ts` | PASS |
| 2 | Valid Supabase token without current superadmin role → 403; missing `app_users` row → 403; role-lookup error fails closed | `tests/unit/mcp-superadmin-auth.test.ts` | PASS |
| 3 | Discovery metadata names the exact MCP resource and Supabase issuer | `tests/unit/mcp-oauth-discovery.test.ts`, `mcp-supabase-oauth-config.test.ts` | PASS |
| 4 | Consent page preserves `authorization_id` through login; only a current superadmin can approve | `tests/unit/mcp-superadmin-consent*.test.*` | PASS |
| 5 | Legacy custom OAuth routes no longer serve the superadmin branch | `tests/unit/mcp-legacy-oauth-routes.test.ts` | PASS |
| 6 | Merchant MCP key + OAuth behavior unchanged | `tests/unit/mcp-merchant-*.test.ts`, `mcp-keys-service.test.ts` | PASS |

## Coverage and known gaps

- The MCP suites (28 files) cover the auth boundary, discovery contract, consent, and merchant regression paths; suite-wide coverage threshold not separately measured for this branch.
- **Not yet proven:** live production contract probes and ChatGPT/Claude/Grok smoke tests — blocked on the production cutover (Supabase dashboard OAuth-server enablement + migration `20260831140000_superadmin_mcp_oauth_audience.sql` + deploy). See the Deployment Checkpoint in the plan and `docs/runbooks/superadmin-mcp-oauth.md`.

## Merge evidence

If checkpoint commits are squashed on merge, this file preserves the RED/GREEN
history index: feature commits `dba9cb07..c5bd2a05` + runbook `ca26ec50`, all
validated GREEN by the commands above.
