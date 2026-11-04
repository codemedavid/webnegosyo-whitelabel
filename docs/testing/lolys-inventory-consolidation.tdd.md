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

## Pre-apply checklist (SELECT-only, each probe starts `set local statement_timeout = '5s';`)

- **Before `20261103130100`**: duplicate transfer legs. Non-empty = the unique index is skipped with a NOTICE
  (no data changes), so look before, not after:
  ```sql
  select stock_transfer_id, inventory_item_id, reason,
         coalesce(outlet_id, '00000000-0000-0000-0000-000000000000'::uuid) as outlet, count(*)
    from public.stock_movements
   where stock_transfer_id is not null
   group by 1, 2, 3, 4
  having count(*) > 1;
  ```
- **Before `20261103130200`**: compare the LIVE bodies of the two functions it replaces with the repo's latest
  definition (`select pg_get_functiondef('public.stock_alerts_to_notifications()'::regprocedure)` and
  `… 'public.recipe_components_unit_guard()'::regprocedure`). A live hotfix not in the repo would be overwritten.
- **Before `20261104140000`** (shift report per cashier): the helpers it calls must have the signatures it calls
  them with — `cash.window_sales(uuid, timestamptz, timestamptz, uuid, integer)`,
  `cash.shift_expected(public.staff_shifts, timestamptz)`, `cash.tenant_order_backend(uuid)`:
  ```sql
  select p.oid::regprocedure, pg_get_function_result(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'cash' and p.proname in ('window_sales', 'shift_expected', 'tenant_order_backend');
  ```
  App 1.0.16 (live) calls `report_shift_sales(id)` with no scope: after this migration that answers the window
  for a cash manager / `reports` holder (unchanged) and HER OWN sales for a plain cashier (was the branch window;
  never 42501), with every key the 1.0.16 parser reads (`run-shift-report-cashier.cjs`).

## Loly's after deploy

Their counts are wrong (−3200 and similar). Verifier's corrected prediction (2026-11-04, live SELECT-only) once
`20261103120000` backfills `counted_at`:

- **28 of 34 ingredients are marked counted** (they had a receive / stocktake / transfer-in or stock > 0).
- **SOLD OUT**: Chicken Karage (already switched off) and Spam (counted 10-29, now 0).
- **"Only N left"**: Chicken Skin 2, Chicken Pops 4, Chicken 6, Nuggets 7, Tocino 8, Fries 9, Shanghai 9, and the
  three Breezes 10 (their Sprite).
- **Become UNLIMITED (never counted)**: the negative ones — Straw −63, Cold cup −63, Garlic rice −49, Hot cup −2 —
  and the never-received Mozzarella sticks and Chicken poppers spicy. A never-counted ingredient caps nothing, so
  about **16 dishes that checkout refuses today become sellable**.

Owner action (tell them; do not edit their data): an opening stocktake in the app for cups, straws, garlic rice,
mozzarella sticks and spicy poppers if she wants them tracked; recount karaage and spam.

## Follow-up: orphaned simple-option holds (MEDIUM-4)

On the platform backend the simple-option counters are claimed BEFORE the order row exists
(`simple-option-hold.ts`). A failure the action sees releases them (`cancel` under the same id); a function killed
between claim and insert does not. Fixed cheaply (2026-11-04): the claim is now the LAST step before the insert
(after delivery fee / road distance / vouchers / Senior-PWD pricing, which used to sit inside the window —
`create-order-stock-claims.test.ts` pins `price → claim → write`). What is left is the gap between two consecutive
DB calls. The leak errs toward UNDER-selling (counters lower than real), never overselling.

Not built — a sweeper, because it is not safe cheaply: `simple_option_stock_applications` has no `created_at`
index (a new migration), the table also holds Convex and tenant-Supabase orders (claimed AFTER their own insert,
ids not in platform `orders`), so each candidate needs `resolveOrderBackend` before "no order row" means orphan,
and a register's offline queue may claim before its order syncs. If wanted: an existing 5-minute cron
(`/api/loyalty/maintenance` or `/api/sms/automations/tick`) calling a service-role SQL function that, for
platform tenants only, cancels `sale` claims older than 30 minutes and younger than 2 days with no `cancel` and no
`orders` row of that id, bounded (≤ 100 per run), with a PGlite runner for each of those exclusions.

## Evidence (2026-11-04)

- `npm run test:sql`: 48/48 runners passed (incl. run-inventory-counted 20, run-inventory-permission-hardening 81,
  run-order-stock-atomic-claim, run-pos-stock-policy 21).
- Full web suite `npx jest --ci`: 1609 suites / 18,300 tests passed (11 suites, 35 tests skipped = opt-in live), exit 0.
- `npx tsc --noEmit` clean (apart from webnegosyo-desktop's missing `electron` types, pre-existing);
  `npx eslint` over the 71 touched src files: 0 errors.

## Follow-up migration `20261105120000_inventory_followups.sql` (NOT applied)

Runner `node tests/sql/run-inventory-followups.cjs` (96 checks over the live slice + the five applied migrations above +
this one, run twice for idempotency; `--before` = without it, fails). Mutation-checked: dropping each fix fails its checks.

1. **Tracking starts at the first delivery.** A receive / transfer_in (> 0) on a shelf with `counted_at IS NULL` and
   `current_qty < 0` first writes a correcting `stocktake` (target 0, `opens_tracking = true`, same actor, 1 ms earlier,
   note "Tracking started: earlier untracked sales cleared"), so Cold cup −65 + receive 5 = **5** (was −60 → sold out).
   Counted shelves, shelves ≥ 0 and missing shelves are a plain add. Only the movement's OWN shelf is corrected (a branch
   receive never touches the store shelf or other branches). Done in the DB (trigger `stock_movements_05_open_tracking`,
   between the client guard and `stock_movements_apply`; worker `inventory_private.open_shelf_tracking`, definer, locks
   ingredient → shelf like `apply_stock_movement`, refuses calls outside a trigger), so web, app, transfers and any server
   writer get it without code changes; Σ ledger = `current_qty` holds. Clients/service role cannot set `opens_tracking`.
   **Reports:** the correction is UNCOSTED (`stock_movements_apply_opening_uncosted` nulls the frozen cost) — the
   untracked sales already booked their cost, and a costed +65 would have shown as a negative count loss in Profit. Until
   reports filter `not opens_tracking`, Profit shows it only as +1 "uncosted movement" (info), the daily report as a +65
   count adjustment (never shrinkage), Store Activity as "Cold cup set to 0 (+65 pcs)" with the note.
   Known gap: a store-wide caller that names no branch (`outletId === undefined`) computes alert crossings from the
   pre-read −65, so an open "out" alert may stay open until the next movement (auto-86 re-reads and is fine).
2. **Guard helpers no longer answer for other stores.** The five definer helpers moved to the non-exposed schema
   `inventory_private` (like `reporting`/`cash`; USAGE for authenticated + service_role so the invoker guards and the
   audit-log policy still call them); a caller who is not a member / superadmin / platform staff gets the REFUSING
   constant. The four guards were repointed (live bodies) and the `public` copies dropped.
3. **Count sessions:** a stocktake joins only an OPEN count of its own branch (every role). Web and app write the session's
   stocktakes before flipping the count to closed, so closing is unaffected (pinned).
4. **Policies:** `stock_alerts_select_member` and `presell_stock_select_member` (each replaces a member + superadmin pair)
   and `inventory_audit_log_insert_branch` use `(select auth.uid())`; same rows visible.

Post-apply probes (each starts `set local statement_timeout = '5s';`):

```sql
-- objects
select column_name, data_type, column_default from information_schema.columns
 where table_schema = 'public' and table_name = 'stock_movements' and column_name = 'opens_tracking';
select tgname from pg_trigger where tgrelid = 'public.stock_movements'::regclass and not tgisinternal order by tgname;
  -- expect stock_movements_00_client_guard, stock_movements_05_open_tracking, stock_movements_apply,
  --        stock_movements_apply_opening_uncosted, stock_movements_mark_counted, stock_movements_stamp_actor, ...
select p.oid::regprocedure from pg_proc p where p.pronamespace = 'inventory_private'::regnamespace order by 1;   -- 7
select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace
 and p.proname in ('inventory_item_has_stock_on_any_shelf','inventory_units_in_use','stock_transfer_has_movements',
                   'inventory_count_has_movements','inventory_outlet_in_tenant');                                  -- 0 rows
select has_schema_privilege('anon', 'inventory_private', 'USAGE') as anon,                                         -- false
       has_schema_privilege('authenticated', 'inventory_private', 'USAGE') as auth;                                -- true
select pg_get_functiondef('public.stock_movement_count_session_is_valid()'::regprocedure) ~ 'already closed';     -- true
select tablename, policyname, cmd, qual, with_check from pg_policies
 where schemaname = 'public' and tablename in ('stock_alerts','presell_stock','inventory_audit_log') order by 1, 2;
  -- no stock_alerts_select_branch/_superadmin or presell_stock_select_superadmin; auth.uid() only as ( SELECT auth.uid() ...)
-- nothing is rewritten by the migration: the 29 uncounted negative shelves are still there until their next delivery
select count(*) from public.inventory_stock where counted_at is null and current_qty < 0;                         -- 29 (as on 2026-11-05)
select count(*) from public.stock_movements where opens_tracking;                                                  -- 0
```

Then get_advisors (performance): `auth_rls_initplan` / `multiple_permissive_policies` for the three tables'
policies above should be gone (the shared `platform_staff_*` ones remain). Regenerate `src/types/database.ts` via the
Supabase MCP (new `stock_movements.opens_tracking`). After Loly's next cup delivery:
`select reason, quantity_delta, balance_after, unit_cost, note from stock_movements where opens_tracking order by created_at desc limit 5;`
