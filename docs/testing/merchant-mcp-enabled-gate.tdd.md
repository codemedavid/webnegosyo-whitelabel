# TDD evidence — the `mcp_enabled` kill switch actually switches

## Source

Not a planned feature. Raised as a **HIGH** finding during the pre-merge security
review of PR #44 (merchant-side MCP), alongside the merge of PRs #41/#42/#43.

## The defect

`tenants.mcp_enabled` is superadmin-controlled — the platform operator's rollout
gate and emergency off-switch for a merchant's AI connection. It was enforced in
exactly one place: `verifyMerchantAdmin()` in
`src/app/actions/merchant-mcp-keys.ts`, which gates the "Connect AI" page.

Nothing on the MCP surface itself checked it:

- `src/app/api/mcp/oauth/authorize/route.ts` — the `wantsMerchant` branch issued
  an authorization code to any `role='admin'` user holding a `tenant_id`, with no
  flag check.
- `src/app/api/mcp/oauth/token/route.ts` — exchanged and refreshed tokens with no
  flag check.
- `src/lib/mcp/merchant-ops.ts` / `register-merchant-tools.ts` — dispatched tool
  calls with no flag check.

Consequences, both of which made the switch a lie:

1. A tenant admin who drives the documented OAuth endpoints directly (real
   Supabase session required — this was never anonymous) could complete the flow
   and mint a working `tenant_admin` credential for a store the operator had
   deliberately left `mcp_enabled = false`.
2. A credential minted while the flag was on kept working forever after the flag
   was turned off. There was no revocation path.

This is **not** a cross-tenant escalation — the admin only ever gained authority
over their own store, which they already hold through the admin UI. The defect is
that the operator's gate and kill switch did not exist in practice.

## User journeys

- As the platform operator, I want a store with `mcp_enabled = false` to be unable
  to complete the merchant OAuth flow at all, so the flag is a real rollout gate.
- As the platform operator, I want flipping `mcp_enabled` off to stop an
  already-issued credential on its very next call, so the flag is a real kill
  switch and not just a signup gate.
- As the platform operator, I want a database blip reading the flag to close the
  surface rather than open it.

## Task report

### 1. `isMerchantAuthorized` — fail closed before a code is issued

Extracted the authorize route's merchant decision into a pure function so it is
directly testable, and threaded the live flag into it. The route now reads the
flag before `issueAuthorizationCode` is ever reached.

- Impl: `src/lib/mcp/merchant-gate.ts`, wired at
  `src/app/api/mcp/oauth/authorize/route.ts`
- Guarantees: admin + concrete tenant binding + `mcp_enabled === true`. A `null`
  or `undefined` flag reads as disabled.

### 2. `executeMerchantOp` — re-read the flag on EVERY dispatch

The flag is re-read against the **pinned** tenant, before the op runs, on every
single tool call. This is what makes the switch a kill switch: turning it off
revokes live credentials on their next call. Placed after the excluded-op and
unknown-op refusals (so a blocked op never costs a database read) and before the
payload is built (so a write op cannot land on a disabled store).

- Impl: `src/lib/mcp/merchant-ops.ts` — new `isEnabled` dep on
  `ExecuteMerchantOpDeps`, defaulting to the live `isTenantMcpEnabled`.
- `registerMerchantTools` passes no override, so the production path uses the
  live flag.

### 3. `isTenantMcpEnabled` — fail closed on error

Reads `tenants.mcp_enabled` via the admin client. Any error, missing row, or
thrown exception returns `false`.

Note: `mcp_enabled` post-dates the generated `Database` types (migration
`20260827120000_tenants_mcp_enabled.sql` is applied; types not regenerated), so
the row is read structurally through an `unknown` cast. Flagged for the next
type regeneration.

## Validation

### RED

```
$ npx jest tests/unit/mcp-merchant-enabled-gate.test.ts
FAIL tests/unit/mcp-merchant-enabled-gate.test.ts
  ● Test suite failed to run
    Cannot find module '../../src/lib/mcp/merchant-gate' from 'tests/unit/mcp-merchant-enabled-gate.test.ts'
Tests: 0 total
```

Compile-time RED: the test newly references the gate module that the enforcement
was missing. The failure is the absent boundary, not broken setup.

### GREEN

```
$ npx jest tests/unit/mcp-merchant-enabled-gate.test.ts
PASS tests/unit/mcp-merchant-enabled-gate.test.ts
  isMerchantAuthorized
    ✓ authorizes a tenant admin whose store has MCP enabled
    ✓ refuses a tenant admin whose store has MCP disabled
    ✓ fails closed when the flag is unreadable
    ✓ refuses a non-admin and an admin with no tenant binding, enabled or not
  executeMerchantOp — mcp_enabled enforcement
    ✓ dispatches when the pinned tenant has MCP enabled
    ✓ refuses to dispatch when the pinned tenant has MCP disabled
    ✓ checks the flag before dispatching a WRITE op, not after
    ✓ checks the flag against the PINNED tenant, never a smuggled one
    ✓ rejects an excluded op without even reading the flag
Tests: 9 passed, 9 total
```

Two pre-existing cases in `tests/unit/mcp-merchant-ops.test.ts` began failing
closed at the new gate — correct behaviour. Those cases are about tenant
*injection*, so they now declare an enabled store via `isEnabled`. No production
behaviour was loosened to make them pass.

### Full suite

```
$ npx jest --testPathPatterns="mcp|merchant"
Tests: 34 failed, 6000 passed, 6034 total
```

34 failures are the pre-existing baseline (`cache`, `leads-service`,
`leads-analytics`, `order-token`, `inventory-live-e2e` — all missing Supabase env
vars in the sandbox), verified identical on `origin/main` before any change here.
Every `mcp*`/`merchant*` suite passes.

### Typecheck and lint

```
$ npx tsc --noEmit   # no errors in merchant-gate / merchant-ops / authorize route / new test
$ npx eslint <changed files>   # 0 errors (4 pre-existing unused-arg warnings)
```

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | A tenant admin of an MCP-enabled store is authorized | `mcp-merchant-enabled-gate.test.ts:authorizes a tenant admin whose store has MCP enabled` | unit | PASS |
| 2 | A tenant admin of a disabled store is refused before any code is issued | `…:refuses a tenant admin whose store has MCP disabled` | unit | PASS |
| 3 | An unreadable flag (`null`/`undefined`) fails closed | `…:fails closed when the flag is unreadable` | unit | PASS |
| 4 | Non-admins and admins with no tenant binding are refused regardless of the flag | `…:refuses a non-admin and an admin with no tenant binding, enabled or not` | unit | PASS |
| 5 | Dispatch proceeds when the pinned tenant is enabled | `…:dispatches when the pinned tenant has MCP enabled` | unit | PASS |
| 6 | Dispatch is refused, and the registry never reached, when disabled | `…:refuses to dispatch when the pinned tenant has MCP disabled` | unit | PASS |
| 7 | A WRITE op is gated before execution, so nothing lands on a disabled store | `…:checks the flag before dispatching a WRITE op, not after` | unit | PASS |
| 8 | The flag is read against the pinned tenant, never a smuggled `tenantId` | `…:checks the flag against the PINNED tenant, never a smuggled one` | unit | PASS |
| 9 | An excluded op is refused without spending a flag read | `…:rejects an excluded op without even reading the flag` | unit | PASS |

## Known gaps

- **`token/route.ts` is not separately gated.** Refresh re-derives the tenant from
  the stored row and every dispatch re-checks the flag, so a refreshed token on a
  disabled store is inert. Gating the token endpoint too would fail louder and
  earlier; left as follow-up.
- **The authorize-route wiring is covered by the pure `isMerchantAuthorized`
  test, not an HTTP-level test.** The route's call into it is verified by reading,
  not by an integration test.
- **`launch_product` / `create_upsell_pair` foreign keys.** The review's
  LOW finding — `categoryId`, `suggestWithItemId`, `source_item_id`,
  `target_item_id` are not verified to belong to the caller's tenant. Pre-existing
  behaviour of the shared provisioning ops, and the tenant-scoped `.eq()` filters
  downstream make the writes fail closed (0 rows) rather than cross tenants. Not
  addressed here.
- **Generated Supabase types are stale** for `mcp_enabled`; regenerate to remove
  the structural cast in `merchant-gate.ts`.
