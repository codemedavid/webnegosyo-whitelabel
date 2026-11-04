# Loly's inventory consolidation (plan section 6, server/web half)

Branch `feat/lolys-inv-server`, base origin/main `4b6beefe`. Client complaint (2026-11-04): "we can still order
even if inventory is out of stock; it should say out of stock; if 5 left and someone orders 7 it should warn".

## Commits

| Commit | Source | What |
|---|---|---|
| `144aac3f` | inventory-oos (uncommitted there) | counted_at, state-based auto-86, "sell anyway until end of day", transfer legs alert/86/restore |
| `78fedadb` | inv-checkout `32f2d582` (cherry-picked) | text-only option ids, switched-off options refused, option counter claim before the order write, rate limits, combo preflight |
| `e5b35517` | inv-orderstock (uncommitted there) + consolidation | atomic claim + ledger RPC; strict `applySimpleOptionStock` kept for the checkout hold; 4 suites moved onto the claim-RPC twin |
| `d1c2d590` | inv-dbsec (untracked there) | inventory permission hardening migrations + runner |
| `8aba28fb` | new | `tenants.pos_stock_policy` + `stockPolicy` on `/api/inventory/ceilings` |
| `6c63b9a9` | new | owner toggle on the Inventory page |
| `a8a1e0a2` | new | storefront cards: "Sold out" at 0, "Only N left" when low |
| `0b2ffdfe` | new | cart stepper capped at stock, "Only N left" under the row |
| `d2a8755d` | new | unused import |

No webnegosyo-app changes were taken (inventory-oos had none).

## Migrations, IN APPLY ORDER

None is applied. Live probe 2026-11-04 (SELECT-only): no `counted_at`, no `auto_86_snoozed_until`, no
`pos_stock_policy`, no `apply_order_stock_claim`; latest platform migration `20261103165009_funnel_six_month_plan_terms`.
Each must be applied AND probed before the code that reads it deploys (the graph read selects `counted_at` /
`auto_86_snoozed_until`; the order-stock service calls `apply_order_stock_claim`).

1. **`20261103120000_inventory_counted_and_sell_anyway.sql`** (runner `run-inventory-counted.cjs`)
   Probe: columns `inventory_items.counted_at`, `inventory_stock.counted_at`, `menu_items.auto_86_snoozed_until`;
   triggers `stock_movements_mark_counted`, `inventory_items_counted_at_guard`, `inventory_stock_counted_at_guard`;
   both functions not executable by anon/authenticated; backfill: count of ingredients with `counted_at` set vs
   those with a receive/stocktake/transfer-in movement or stock > 0.
2. **`20261103130000_inventory_permission_hardening.sql`**
   Probe: `pg_policies` on `stock_alerts` / `presell_stock` are SELECT-only for clients (`stock_alerts_select_branch`,
   `stock_alerts_select_superadmin`, `presell_stock_select_member`, `presell_stock_select_superadmin`);
   `inventory_audit_log_insert_branch` exists; `has_table_privilege('authenticated', 'public.stock_alerts', 'INSERT')`
   false; TRUNCATE revoked; functions `inventory_outlet_in_tenant`, `inventory_recent_own_movements`.
3. **`20261103130100_inventory_transfer_count_lifecycle.sql`**
   Probe: functions `stock_transfers_lifecycle_guard`, `stock_transfer_lines_lifecycle_guard`,
   `inventory_counts_lifecycle_guard`, `inventory_may_act_for_branch` + their triggers; the new unique index.
4. **`20261103130200_inventory_tenant_consistency.sql`**
   Probe: `inventory_same_tenant_guard` triggers on inventory_items, inventory_stock, presell_stock,
   recipe_components, recipes, stock_alerts, stock_transfer_lines; `recipe_components_unit_guard` and
   `stock_alerts_to_notifications` bodies updated.
5. **`20261103130300_inventory_unit_and_delete_guards.sql`**
   Probe: `inventory_items_stock_unit_shelf_guard`, `inventory_items_store_wide_delete_guard`,
   `inventory_units_meaning_guard` and triggers.
   Runner for 2–5: `run-inventory-permission-hardening.cjs` (81 checks, over the live schema slice).
6. **`20261103140000_order_stock_atomic_claim.sql`** (runner `run-order-stock-atomic-claim.cjs`)
   Probe: `apply_order_stock_claim(uuid, text, text, text, integer, jsonb, text)` exists, EXECUTE for service_role
   only (`has_function_privilege('authenticated', …, 'EXECUTE')` false). Deploy the web code right after: the old
   code never calls it, the new code needs it.
7. **`20261104150000_tenants_pos_stock_policy.sql`** (runner `run-pos-stock-policy.cjs`, 21 checks)
   Probe: `tenants.pos_stock_policy` text not null default 'warn', constraint `tenants_pos_stock_policy_check`,
   trigger `tenants_guard_pos_stock_policy`; `select count(*) from tenants where pos_stock_policy <> 'warn'` = 0.
   The code reads it fail-safe ('warn' when the column is missing), so this one may follow the deploy.

Then regenerate `src/types/database.ts` via the Supabase MCP (the new columns are read through narrow local
interfaces until then).

## Contract for the register agent

- `GET /api/inventory/ceilings` answers `stockPolicy: 'warn' | 'block'` (default `'warn'`, also `'warn'` whenever
  the ceilings could not be read).
- The app session may read `tenants.pos_stock_policy` directly (readable wherever the tenants row is).
- Only the store owner (store-wide account) or a superadmin can change it; staff with `settings` get 42501.

## Storefront behaviour

- Menu cards (all 19 designs, one shared path: `card-templates/card-stock.tsx`): a dish switched on but made 0
  times shows "Sold out" and refuses the add; ≤ `STOCK_HINT_THRESHOLD` (10) shows "Only N left" in the store's
  button colours. Ceilings are read client-side (`useStockCeilings`, 30 s stale, no retry) only when
  `inventory_enabled`; the menu HTML stays cached.
- Cart page, every cart design and the drawer: "+" stops at the ceiling (all lines of the dish share it); the row
  says "Only 2 left", "That's all we can make today", "Only 5 left — lower to 5 to check out" or "Sold out".
- Checkout (`checkout-stock-guard.ts`) is still the hard refusal.
- No ceiling (= unchanged behaviour): untracked dish, a branch with no `inventory_stock` row, never-counted stock,
  a "sell anyway" dish.

## Behaviour change to know

`tests/unit/inventory-audit/lifecycle-claims.test.ts`: an EDIT give-back that reaches the server before its
original sale is now capped to zero (the atomic claim's edit cap), so the late sale deducts in full: −200 g where
−100 g would be exact. It errs toward less on the shelf (never oversells); before the claim it invented +100 g.

## Loly's after deploy

Their counts are wrong (−3200 and similar). With `counted_at` backfilled, received-then-oversold ingredients are
"counted" and negative, so their dishes will show Sold out online until the owner does an opening stocktake in the
app. Tell them; do not edit their data.

## Evidence (2026-11-04)

See the final report for the counts of: inventory suites, `npm run test:sql`, full `npx jest --ci`.
