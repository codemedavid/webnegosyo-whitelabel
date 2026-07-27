# TDD evidence — POS stock depletion (Inventory Phase 5A)

**Source plan**: derived in-session from a progress audit of the inventory
build (no `*.plan.md` artifact). The audit re-ordered the remaining phases and
promoted POS depletion ahead of low-stock alerts.

**Branch**: `feat/unified-modifier-groups`

## Why this phase came first

Order-driven depletion (Phase 4B/4C) hooks into `createOrderAction`, which every
*online* order funnels through. The POS register does not: `pos-tender.tsx`
calls the tenant's Convex `orders:createOrder` mutation directly. A counter
sale — the highest-volume stock event a merchant has — therefore left stock
untouched.

Investigating that turned up a second, silent defect described below.

## The latent defect: Convex-backed tenants never depleted

`stock_movements.order_id` was typed `UUID`. Orders live in three places:

| Backend | Order id shape | Fits a UUID column |
|---|---|---|
| Platform Supabase | uuid | yes |
| Tenant Supabase | uuid | yes |
| Tenant Convex | base32-ish document id | **no** |

`applyOrderStockBestEffort` deliberately swallows errors so a stock write can
never lose a paid order. The result: for every Convex-backed tenant, each
depletion insert failed with Postgres `22P02` and was logged and discarded.
Stock silently never moved, and nothing surfaced it.

RED evidence, run against the live database:

```
SELECT 'jh7dm2p8qr3n5x9k4tw2vc6y8b'::uuid;
ERROR:  22P02: invalid input syntax for type uuid: "jh7dm2p8qr3n5x9k4tw2vc6y8b"
```

Fixed by migration `20260727120000_stock_movements_order_id_text.sql`
(**APPLIED 2026-07-27**), widening the column to TEXT. The column is a
correlation key only — it carries no foreign key, because the order it names may
live in a different database entirely.

GREEN evidence — full insert probe inside a transaction, then rolled back:

```
order_id                    | quantity_delta | balance_after
jh7dm2p8qr3n5x9k4tw2vc6y8b  | -600.0000      | 9400.0000
```

The trigger computed 10000 − 600 = 9400 with a Convex-style id. Leak check after
`ROLLBACK` returned `probe_units 0, probe_items 0, probe_movements 0`.

## User journeys

1. As a cashier, when I complete a counter sale, I want the ingredients it used
   spent from stock, so the ledger matches what actually left the kitchen.
2. As a cashier, I want a sale to complete even if the stock write fails, so a
   paid order is never lost to an inventory problem.
3. As a merchant on a Convex backend, I want my online orders to move stock at
   all, which until this phase they never did.
4. As a merchant who has not enabled inventory, I want no ledger accumulating
   behind my back.
5. As a tenant, I want no other tenant's register able to write to my ledger.

## Task report

### 1. Map the register cart to a depletion payload

`buildPosStockItems` converts `PosCartLine[]` into per-line items carrying
`menuItemId`, `quantity`, and `optionIds`. Kept separate from `buildPosOrder`
on purpose: the order itself goes to Convex, whose already-deployed per-tenant
schema has no place for option ids. Routing ids through Convex would have meant
a schema bump and a redeploy for every tenant.

- RED: `npx jest lib/pos-stock.test.ts` → `TS2307: Cannot find module './pos-stock'`
- GREEN: `npx jest lib/pos-stock.test.ts` → 5 passed

### 2. Widen `stock_movements.order_id`

See the defect section above for RED/GREEN database evidence.

### 3. Platform depletion route

`POST /api/inventory/order-stock` authenticates with the caller's own Supabase
access token and authorizes against `app_users`, matching
`/api/revalidate-menu`. It re-applies the `inventory_enabled` gate that
`createOrderAction` applies, and feeds the same id set to both the
variation-option and modifier-option recipe buckets.

- RED: `npx jest tests/unit/api/inventory-order-stock.test.ts` → 8 failed (module not found)
- GREEN: same command → 8 passed

### 4. Wire the register

`notifyPosStockDepletion` posts the sale after the order is safely written and
marked paid. It never throws, for the same reason the rest of the depletion path
is best-effort.

- RED: `npx jest lib/pos-stock-notify.test.ts` → `TS2307: Cannot find module './pos-stock-notify'`
- GREEN: same command → 5 passed

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Every register line contributes its menu item and quantity | `pos-stock.test.ts:carries the menu item id and quantity of every line` | unit | PASS |
| 2 | Selected option ids reach the platform, so option recipes are spent | `pos-stock.test.ts:carries every selected option id so option recipes are spent` | unit | PASS |
| 3 | A line with no modifiers sends an empty option list | `pos-stock.test.ts:sends an empty option list for a line with no modifiers` | unit | PASS |
| 4 | Two configurations of one item stay separate, since they spend different ingredients | `pos-stock.test.ts:keeps two configurations of the same item as separate lines` | unit | PASS |
| 5 | An empty cart produces no depletion items | `pos-stock.test.ts:returns nothing for an empty cart` | unit | PASS |
| 6 | The route rejects a request missing tenantId or orderId | `inventory-order-stock.test.ts:rejects a request missing tenantId or orderId` | integration | PASS |
| 7 | The route rejects an unauthenticated request | `inventory-order-stock.test.ts:rejects a request with no Authorization header` | integration | PASS |
| 8 | A token that resolves to no user is rejected | `inventory-order-stock.test.ts:rejects when the token does not resolve to a user` | integration | PASS |
| 9 | An admin of another tenant cannot write to this tenant's ledger | `inventory-order-stock.test.ts:rejects an admin of a different tenant` | integration | PASS |
| 10 | An authorized sale reaches the depletion service with both option buckets filled | `inventory-order-stock.test.ts:depletes stock for the caller-s own tenant` | integration | PASS |
| 11 | A tenant with inventory disabled accumulates no movements | `inventory-order-stock.test.ts:does nothing when the tenant has inventory disabled` | integration | PASS |
| 12 | A malformed items payload is rejected | `inventory-order-stock.test.ts:rejects a body whose items are not a list` | integration | PASS |
| 13 | An item without option ids still depletes its base recipe | `inventory-order-stock.test.ts:ignores an item with no option ids rather than failing the sale` | integration | PASS |
| 14 | The register posts the sale with its session token | `pos-stock-notify.test.ts:posts the sale to the platform depletion route with the session token` | unit | PASS |
| 15 | A signed-out register fires no unauthenticated write | `pos-stock-notify.test.ts:does not call the platform when there is no session` | unit | PASS |
| 16 | An empty sale skips the network call | `pos-stock-notify.test.ts:skips the call entirely for a sale with no items` | unit | PASS |
| 17 | An unreachable platform cannot fail the tender screen | `pos-stock-notify.test.ts:never throws when the platform is unreachable` | unit | PASS |
| 18 | A failed session lookup cannot fail the tender screen | `pos-stock-notify.test.ts:never throws when the session lookup fails` | unit | PASS |
| 19 | A Convex-style order id stores and drives the balance trigger | live DB probe (above) | database | PASS |

## Suite results

```
webnegosyo-app:  npx jest   → 37 suites, 594 tests passed
webnegosyo-app:  npx tsc --noEmit → exit 0
web app:         npx jest   → 215 suites, 2489 tests passed
eslint (changed files only) → exit 0, no findings
```

### Test-runner correction

Before this phase, the web app's `jest.config.cjs` swept in all 37
`webnegosyo-app` suites and ran them under its own jsdom/Next config, where 2
already failed (`printer-native-load`, `order-item-images`) because their native
and `expo-constants` mocks cannot resolve there. Added
`testPathIgnorePatterns` for `webnegosyo-app/`. No coverage is lost — those are
exactly the 37 suites the merchant app's own runner executes and passes.

## Known gaps (carried forward)

These are unchanged by this phase and remain open:

- **Both mobile apps still send display strings, not option ids.** Their orders
  deplete base recipes only. The web checkout and now the POS send ids.
- **Cancellation restore does not cover POS or Convex admin surfaces.** A voided
  counter sale does not yet return its ingredients; `reverseOrderStockMovements`
  is only reachable from the platform order path. This is the natural next task.
- **No live end-to-end POS probe.** The route and notifier are proven by unit
  and integration tests plus a database probe, but a real register sale against
  a Convex tenant with `inventory_enabled` has not been run.
- Phases 5B (low-stock alerts / auto-86), 6 (merchant app inventory surface),
  and 7 (RLS audit, E2E) are not started.
