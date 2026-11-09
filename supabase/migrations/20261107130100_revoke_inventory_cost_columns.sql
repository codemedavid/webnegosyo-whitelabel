-- Cost secrecy, stage 2 of 2: the cost columns stop being selectable by client
-- roles.
--
--   >>> DO NOT APPLY YET. Apply ONLY after (1) the web deploy that reads costs
--   >>> through public.inventory_costs_for_tenant / inventory_movement_costs and
--   >>> uses explicit column lists, AND (2) the merchant-app build / OTA with the
--   >>> same change is what nearly every device runs. Every OLD build's
--   >>> `select('*')` on these tables, and every old app list that names
--   >>> `unit_cost` (inventory-service, ingredient-service, daily-report-service),
--   >>> fails with 42501 "permission denied for table" the moment this lands.
--   >>> Status 2026-11-10: every merchant-app BINARY up to and including 1.0.18
--   >>> names unit_cost in its Stock list, ingredient editor and daily report
--   >>> reads; only the 1.0.18 OTA from #110 (production branch, Android group
--   >>> 31353c24, iOS d83928ac) is clean. Binaries 1.0.6-1.0.17 have no OTA
--   >>> channel, so they need a store/APK update (raise
--   >>> platform_app_releases.minimum_version to 1.0.18 to block them; builds
--   >>> before 1.0.14 have no update gate at all). The exact lists are pinned in
--   >>> tests/sql/run-inventory-cost-secrecy.cjs (`breaks`).
--   >>> Requires 20261107130000 (the readers and the definer-safe
--   >>> apply_stock_movement / profit_facts) to be applied first.
--
-- Postgres has no column-level REVOKE on top of a table-level grant: the
-- table-level SELECT must be revoked and replaced by a SELECT grant on every
-- column EXCEPT the cost column. The list is built here from the live column
-- set (everything but unit_cost), so it is exactly what the table has today.
--
--   !!! A column added to these tables LATER is invisible to anon/authenticated
--   !!! until its migration says `grant select (new_col) on public.<table> to
--   !!! anon, authenticated;`. tests/unit/inventory-cost-column-guard.test.ts
--   !!! fails a migration that adds a column to one of them without that grant.
--
-- INSERT and UPDATE are untouched, so ingredient forms, `receive` deliveries and
-- transfer drafts keep writing unit_cost. What changes for writers:
--   * `.insert().select()` / `.update().select()` with no column list asks for
--     RETURNING every column and is refused; name the columns.
--   * an UPDATE or ON CONFLICT DO UPDATE whose SET/WHERE *reads* unit_cost
--     (`set unit_cost = coalesce(x, unit_cost)`, `excluded.unit_cost`) needs
--     SELECT on it; the only such statement in the schema was
--     apply_stock_movement, fixed in 20261107130000.
-- The service role and the postgres owner keep full access (definers: the
-- frozen-cost helpers, order_items_cost_snapshot, store-activity triggers).
-- Rollback: grant select on public.<table> to anon, authenticated;

set lock_timeout = '3s';

do $$
declare
  v_table text;
  v_columns text;
begin
  foreach v_table in array array['inventory_items', 'stock_movements', 'stock_transfer_lines'] loop
    if to_regclass('public.' || v_table) is null then
      continue;
    end if;

    select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position)
      into v_columns
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.table_name = v_table
       and c.column_name <> 'unit_cost';

    execute format('revoke select on table public.%I from anon, authenticated', v_table);
    execute format('grant select (%s) on table public.%I to anon, authenticated', v_columns, v_table);
  end loop;
end
$$;
