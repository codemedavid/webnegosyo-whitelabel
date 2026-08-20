# TDD Evidence — Loyverse Payment-Type → SmartMenu Payment-Method Sync

**Source plan**: inline `/plan` output in-session (no `.plan.md` artifact); user confirmed with "proceed".
**Date**: 2026-08-20 · **Branch**: `lalamove-overhaul`

## User journeys

1. As a merchant with Loyverse connected, I want my Loyverse payment types to appear as SmartMenu payment methods after one click, so both systems offer the same tender options.
2. As a merchant, I want to add instructions (details text, QR code, proof requirement) to a synced method in Payment Settings, and have re-syncs never overwrite them.
3. As a merchant, I want methods deleted in Loyverse to stop being offered at checkout without losing their order history (deactivate, never delete).

## Task report

| Task | Command | Result |
|---|---|---|
| Migration `20260827130000_payment_methods_loyverse_link.sql` (column + partial unique index) | `mcp apply_migration payment_methods_loyverse_link` | `{"success":true}` — APPLIED to remote 2026-08-20 |
| RED: planner tests before implementation | `npm test -- --testPathPatterns=loyverse-payment-methods-sync` | FAIL — `Cannot find module '@/lib/loyverse/payment-methods-sync'` (intended missing-implementation RED). Commit `3ea3a0b` |
| GREEN: implement `planPaymentMethodSync` | same command | 11 passed, 11 total. Commit `b330977` |
| Executor + server action | `npx tsc --noEmit` (filtered to touched files) | no errors. Commit `85b92e2` |
| Payment Settings UI (sync button, badge, name lock) | `npx eslint <touched files>` | clean. Commit `f4fe382` |
| Coverage | `npx jest --testPathPatterns=loyverse-payment-methods-sync --coverage --collectCoverageFrom=src/lib/loyverse/payment-methods-sync.ts` | **100% stmts / branches / funcs / lines** |
| Full suite regression | `npm test` | 0 failures in the main tree; the 42 failing suites are all under the stale `.claude/worktrees/merchant-mcp` worktree (pre-existing, unrelated) |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Unmapped Loyverse payment type → create (active, appended order_index) | `creates a method for a Loyverse payment type with no mapped row` | unit | PASS |
| 2 | New methods append after the highest existing order_index | `appends new methods after the highest existing order_index` | unit | PASS |
| 3 | Multiple creates numbered sequentially | `numbers multiple creates sequentially` | unit | PASS |
| 4 | Loyverse rename touches only `name` | `renames a mapped method... touching only the name` | unit | PASS |
| 5 | Unchanged name → no rename | `does not rename when the name is unchanged` | unit | PASS |
| 6 | Deactivated mapped method whose type returns → reactivated | `reactivates a mapped method that was deactivated...` | unit | PASS |
| 7 | Type gone from Loyverse → mapped method deactivated | `deactivates a mapped method whose Loyverse payment type disappeared` | unit | PASS |
| 8 | Manual (unlinked) methods are never touched | `never touches manual methods without a Loyverse link` | unit | PASS |
| 9 | Already-inactive mapped methods not re-deactivated | `does not re-deactivate an already inactive mapped method` | unit | PASS |
| 10 | Blank-named Loyverse types skipped with a warning naming the id | `skips Loyverse payment types with blank names...` | unit | PASS |
| 11 | Fully-matching state is a no-op (idempotent re-sync) | `is a no-op when everything already matches` | unit | PASS |

All in `tests/unit/loyverse-payment-methods-sync.test.ts`.

## Design guarantees not test-encoded (enforced by code shape)

- Sync owns only `name` + liveness: `PaymentMethodCreate`/`PaymentMethodRename` types cannot express `details`, `qr_code_url`, or `require_payment_proof`, so instructions survive every re-sync by construction.
- Access token is read with the service-role client only after `verifyTenantPermission(tenantId, 'store_setup')` (`syncPaymentMethodsFromLoyverse` in `src/lib/payment-methods-service.ts`).
- Idempotency key is the partial unique index on `(tenant_id, loyverse_payment_type_id)`.

## Coverage and known gaps

- Planner module: 100%. Executor (`syncPaymentMethodsFromLoyverse`) and the UI have no dedicated tests — the executor is thin I/O around the fully-tested planner, mirroring how `catalog-import` wraps `catalog-mapper`. End-to-end sync against a live Loyverse store is unverified.
- **Follow-up (Phase 5, not implemented)**: `order-push.ts` still sends the single tenant-level `loyverse_payment_type_id` on every receipt. Orders already store `payment_method_id` (`src/lib/orders-service.ts:616`), so per-order mapping via the new column is feasible as its own TDD cycle.

## Merge evidence

RED `3ea3a0b` → GREEN `b330977` → executor `85b92e2` → UI `f4fe382`, all on `lalamove-overhaul`. If squashed, this file preserves the RED/GREEN trail.
