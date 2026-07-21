# TDD Evidence — MCP deletion guardrails

**Task:** Make the remote MCP provisioning surface structurally incapable of
deleting tenant data or taking a tenant offline (from the `/code-review`
finding: "the no-delete guarantee is incidental, not enforced").

**Source plan:** None. Journeys derived during this TDD run from the code-review
hardening recommendations.

## User journeys

1. As the platform owner, I want the MCP to be **unable to expose or dispatch any
   delete/drop/remove op**, so an AI (or a future careless op addition) can never
   delete a tenant or its data through the MCP.
2. As the platform owner, I want the MCP's `configure_integration` op to **refuse
   to deactivate a tenant** (`is_active: false`), so the closest-to-deletion field
   mutation cannot take a storefront offline via the MCP.
3. As a developer, I want a **guardrail test that fails at CI** if anyone adds a
   destructive op, so the guarantee is "safe by contract," not "safe by accident."
4. As an AI client of the MCP, I want every tool to **advertise its real input
   fields**, so ops like `create_tenant` are callable (previously they normalized
   to an empty parameter schema and "could not be accessed").

## What changed

- New pure module `src/lib/mcp/op-safety.ts`:
  - `isDestructiveOpName` / `assertNonDestructiveOpName` — whole-token match on
    destructive verbs (`delete`, `drop`, `remove`, `destroy`, `deprovision`,
    `truncate`, `purge`, `wipe`, `teardown`, `erase`); ignores substrings like
    `undelete`/`dropdown`.
  - `assertNoTenantDeactivation` — throws on `is_active === false`.
- `src/lib/mcp/provisioning-ops.ts`:
  - Import-time fail-closed: asserts every registered op name is non-destructive
    (module throws on load if a destructive op is ever added).
  - Runtime fail-closed: `executeOp` calls `assertNonDestructiveOpName(name)`
    before the registry lookup, so a destructive name is rejected even if
    somehow registered.
  - `configure_integration` calls `assertNoTenantDeactivation(payload)` before
    delegating to `updateTenantSupabase`.
- Client-visible schemas (`provisioning-ops.ts`): replaced the `z.record`
  (`looseRecord`) and intersection (`tenantScoped().and(...)`) and union
  (`list_tenants`) input schemas — which the MCP SDK's `normalizeObjectSchema`
  turns into `undefined` → an empty `{type:object,properties:{}}` params schema —
  with passthrough `ZodObject`s (`createTenantEnvelope`, `tenantScoped` →
  `z.object({...}).passthrough()`, `list_tenants` → `z.object({}).passthrough()`).
  Deep validation still lives in the service writers; `.passthrough()` keeps
  extra fields flowing through while exposing `.shape` to clients.
- Removed stale `jest.config.ts` (conflicted with the branch's `jest.config.cjs`
  and broke `npm test` entirely — dual-config resolution error).

## RED → GREEN

- **RED** (`npx jest --config jest.config.cjs tests/unit/mcp-op-safety.test.ts tests/unit/provisioning-ops.test.ts`):
  `Test Suites: 2 failed` — `mcp-op-safety.test.ts` failed to import (module did
  not exist), `configure_integration` with `is_active:false` **resolved** instead
  of rejecting, and a destructive name threw generic `Unknown op` rather than a
  destructive error.
- **GREEN** (same command after implementation): `Test Suites: 2 passed, 2 total;
  Tests: 19 passed, 19 total`.

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|--------------------|-----------|------|--------|
| 1 | Destructive verbs are flagged in any snake_case position; safe ops are not | `tests/unit/mcp-op-safety.test.ts` | unit | PASS |
| 2 | `undelete`/`dropdown` are not false-positived | `tests/unit/mcp-op-safety.test.ts` | unit | PASS |
| 3 | `assertNoTenantDeactivation` throws only on `is_active:false` | `tests/unit/mcp-op-safety.test.ts` | unit | PASS |
| 4 | Registry contains no destructive-named op | `tests/unit/provisioning-ops.test.ts:destructive-op guardrail` | unit | PASS |
| 5 | `executeOp` rejects a destructive name before any service is reached | `tests/unit/provisioning-ops.test.ts:destructive-op guardrail` | unit | PASS |
| 6 | `configure_integration` refuses `is_active:false`; still works otherwise | `tests/unit/provisioning-ops.test.ts:tenant-deactivation guardrail` | unit | PASS |
| 7 | Every op advertises a non-empty object schema the SDK can expose | `tests/unit/provisioning-ops.test.ts:advertised MCP input schemas` | unit | PASS |
| 8 | `create_tenant` advertises name/slug/primary_color/secondary_color | `tests/unit/provisioning-ops.test.ts:advertised MCP input schemas` | unit | PASS |

## Coverage and known gaps

- `src/lib/mcp/op-safety.ts`: **100%** stmts/branch/funcs/lines.
- `npm test` (full suite) after fixes: `1767 passed`. The 2 failing suites
  (`webnegosyo-app/lib/order-item-images.test.ts`,
  `webnegosyo-app/lib/printer-native-load.test.ts`) are **pre-existing
  mock-hoisting bugs in the merchant mobile app**, unrelated to this change —
  previously hidden because the dual jest-config conflict made `npm test` error
  before running. Not addressed here (out of scope).
