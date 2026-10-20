# Inventory ledger guards — TDD evidence (Phase 0a, Reports & Inventory suite)

Plan: `docs/plans/2026-10-12-reports-and-inventory-suite.md` §1.3 (security findings HIGH-1, HIGH-2, MED-4, MED-6, MED-7, LOW).
Date: 2026-10-12. Branch: `feat/reports-inventory`.

## Scope

| Finding | Fix | Where |
|---|---|---|
| HIGH-1 direct `current_qty` / `unit_cost` writes | BEFORE triggers on `inventory_items` / `inventory_stock`: qty only via `apply_stock_movement` (depth > 1), ingredient writes need `menu`, shelves never deleted, new rows start at 0 | `20261012170000_inventory_ledger_guards.sql` |
| HIGH-2 forged movements | `stock_movements_00_client_guard`: clients may write only receive/stocktake/waste/transfer legs, no `order_id`, sign matches reason, transfer legs on their own transfer. (Backdating/actor stamping = Store Activity floor `20261012140000`.) | same |
| MED-4 recipes + claims | Recipes/components/units: `menu` + store-wide account. Claims: SELECT only for clients, writes revoked | `20261012170100_inventory_write_scopes.sql` |
| MED-7 `delete_inventory_item` | Gate = `menu` + store-wide (or superadmin) | same |
| LOW transfers / grants / index | Receiver may only record what arrived; audit log append-only; TRUNCATE revoked; `stock_movements (tenant_id, created_at desc)` | same |
| MED-6 `/api/inventory/ceilings` | UUID validation + per-IP-per-store Redis limit (120/min, instance fallback) | `src/app/api/inventory/ceilings/route.ts` |
| Silent refusal after MED-4 | `saveRecipeForTarget` checks the UPDATE's affected rows | `src/lib/inventory/recipes-service.ts` |

Deferred on purpose: HIGH-3 (permission conjunct on order/payment SELECT) moves to 0d with the `reports` key; MED-5 (fail-open `resolveActingBranchScope`) is replaced by the fail-closed `requireReportScope` in Phase 1.

## RED → GREEN

1. `npx jest tests/unit/inventory-ledger-guards-migration.test.ts` — RED: migration file missing (ENOENT). GREEN after writing the migrations: 11/11.
2. `npx jest tests/unit/inventory-ceilings-route.test.ts` — RED: 3 new tests failed (non-UUID ids accepted, no 429, no limiter call). GREEN: 9/9.
3. `npx jest tests/unit/inventory-recipe-save-refusal.test.ts` — RED: zero-row update resolved as success. GREEN: 2/2.
4. Regression: `npx jest tests/unit/inventory` → 126 suites / 1399 tests pass; recipe route/yield/platform-staff suites 49/49.

## Live verification (platform DB)

Before applying: the full migration ran inside `BEGIN … ROLLBACK` on the real database with role probes (`SET LOCAL ROLE`, `request.jwt.claims`), 33 probes, all as expected — including the ledger path still working through the guards (receive 2 into an empty branch → shelf row created at 2 at trigger depth 2; stocktake target 7 → 7; service-role sale −1 → 6; roll-up moved by exactly +6).

Applied via MCP as `inventory_ledger_guards` + `inventory_write_scopes`. Probed by object name: 5 triggers, 13 new policies, the old "Admins manage own-tenant rows" policies gone from recipes/components/units/claims, the index present, no client INSERT/UPDATE/DELETE/TRUNCATE grant left on `order_stock_applications`, no UPDATE/DELETE/TRUNCATE on `inventory_audit_log`, `delete_inventory_item` carries the store-wide gate.

Post-apply probes (rolled back), all matching:

| Actor | Action | Result |
|---|---|---|
| owner | PATCH `current_qty` | ERR 42501 |
| staff without menu | PATCH `unit_cost` | ERR 42501 |
| staff with menu | edit `unit_cost` | 1 row |
| staff with menu | insert `sale` | ERR 42501 |
| owner | receive 2 | 1 row |
| service role | sale −1 with order | 1 row |
| service role | write a claim | privilege OK (reached the CHECK) |
| owner | delete claims | ERR 42501 |
| branch-locked | edit recipe | 0 rows (refused) |
| owner | edit recipe | 1 row |
| branch-locked | `delete_inventory_item` | ERR 42501 |
| owner | `delete_inventory_item` (dry run) | OK |

Security advisors after apply: no ERROR; `delete_inventory_item` remains the known, intentional authenticated-callable definer (gated inside).

## Review follow-up (part 3, `20261012170200_inventory_guard_hardening.sql`)

A security review of parts 1–2 (no CRITICAL/HIGH) raised three items, all fixed and applied:

- **Client movements need `menu`** (MEDIUM-3). Store Activity's floor carries the same rule as a policy but is not applied yet, so a cashier token could still post a receive/count. Phase 0d swaps `menu` → `inventory` in both places.
- **Transfer legs bounded by their transfer** (MEDIUM-2): item on the transfer, |delta| ≤ sent, `transfer_out` only from the sender while draft, `transfer_in` only while sent (receiver, or the shortfall back onto the sender), shortfall waste only on the sender while sent, each leg once.
- **Stock unit fixed while stock is held** (LOW-1), and platform staff checked against the `stores.*` grant for the operation (LOW-2).

RED: `inventory-ledger-guards-migration.test.ts` failed on the missing part-3 file (ENOENT); GREEN 15/15. Live rollback probes before apply (12/12): no-menu receive refused; a full send → receive → shortfall lifecycle passes; a repeat send/receive leg, a receive of 10,000 against a 5-unit transfer, a receipt while still draft and a send after sent are all refused; unit change with stock refused, rename allowed. Applied as `inventory_guard_hardening`; live bodies probed.

Known and accepted: a branch-locked account seeding the default units for a store with none now fails (the owner normally seeds them); a branch-locked receiver still cannot post the shortfall legs on the sender's shelf (RLS branch reach, unchanged by this work).
