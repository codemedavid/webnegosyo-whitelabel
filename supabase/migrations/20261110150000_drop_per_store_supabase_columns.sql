-- ===========================================================================
-- One order backend fewer: drop the per-store Supabase credential columns
-- (owner decision 2026-11-10, "one backend").
--
--   >>> HOLD. DO NOT APPLY YET. Apply ONLY after BOTH are live:
--   >>>   (1) the web deploy from chore/remove-per-store-supabase, which no
--   >>>       longer names these columns in any select list, and
--   >>>   (2) the merchant-app OTA / build from the same branch,
--   >>> AND only after re-probing, on the day, that all four columns are empty
--   >>> on every row and no store is pinned to the retired backend:
--   >>>
--   >>>   select count(*) filter (where nullif(btrim(supabase_order_url), '') is not null)         as url,
--   >>>          count(*) filter (where nullif(btrim(supabase_order_anon_key), '') is not null)    as anon_key,
--   >>>          count(*) filter (where nullif(btrim(supabase_order_service_key), '') is not null) as service_key,
--   >>>          count(*) filter (where nullif(btrim(supabase_order_db_url), '') is not null)      as db_url,
--   >>>          count(*) filter (where order_backend = 'supabase')                               as pinned
--   >>>     from public.tenants;                                   -- every count must be 0
--
-- Why the order matters: the web deployed BEFORE that branch names these
-- columns in explicit select lists on request paths (checkout's
-- ORDER_TENANT_CONFIG_SELECT, order tracking, the dashboard, Boost, loyalty,
-- texts). PostgREST refuses a select that names a missing column (42703), so
-- dropping first breaks checkout on every store until the deploy lands. Give
-- old serverless instances time to drain after the deploy. `select('*')`
-- readers are unaffected. No merchant-app, customer-app, desktop or edge
-- function code has ever named these columns (git log -S), so (2) is belt and
-- braces: the app change only removes its refusal branches.
--
-- What goes: tenants.supabase_order_url, supabase_order_anon_key,
-- supabase_order_service_key, supabase_order_db_url. They configured a store's
-- own, separate Supabase project for its orders (`order_backend = 'supabase'`,
-- 20260721000000). No store ever used it; the code that read them is deleted.
--
-- What stays, on purpose:
--   * tenants.order_backend and its CHECK (still allows the word 'supabase';
--     the code resolves a stale pin like 'auto').
--   * tenants.supabase_order_schema_version (integer, the bundle version of
--     the same retired backend). Not a credential and out of this change's
--     brief; nothing reads it. Drop it in a follow-up if wanted.
--   * The four names in guard_tenant_privileged_columns' list (latest body:
--     20261107120000). The guard compares to_jsonb(old) -> col with
--     to_jsonb(new) -> col, so a listed column that no longer exists reads
--     NULL on both sides and never fires. A guard that outlives its column is
--     harmless; the reverse is not. Trim the list the next time that function
--     is touched. (tests/sql/run-drop-per-store-supabase-columns.cjs proves
--     the guard still works after the drop.)
--
-- Dependencies checked in supabase/migrations (2026-11-10): no view, policy,
-- index, generated column, column-level grant or trigger column list names
-- these four; the only functions that mention them are the guard's text array
-- above. Objects created outside migrations are NOT covered by that grep:
-- before applying, confirm nothing depends on them:
--
--   select d.classid::regclass, d.objid, d.deptype
--     from pg_depend d
--     join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
--    where d.refobjid = 'public.tenants'::regclass
--      and a.attname in ('supabase_order_url', 'supabase_order_anon_key',
--                        'supabase_order_service_key', 'supabase_order_db_url');
--   -- expect no rows (a pg_attrdef row would mean a default; there is none).
--
-- DROP COLUMN has no CASCADE here: if anything does depend on a column the
-- statement fails and nothing is dropped.
--
-- Re-runnable: the guard skips a column that is already gone, and the drops
-- are IF EXISTS.
--
-- ROLLBACK (manual; the values are gone for good, which is why the guard
-- below refuses to run while any exist):
--   alter table public.tenants
--     add column if not exists supabase_order_url text,
--     add column if not exists supabase_order_anon_key text,
--     add column if not exists supabase_order_service_key text,
--     add column if not exists supabase_order_db_url text;
-- ===========================================================================

-- ACCESS EXCLUSIVE on the table every request reads: wait briefly or give up,
-- never queue every storefront behind a long transaction.
set lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- Guard: refuse to drop anything while a single row still holds a value, or
-- while a store is pinned to the retired backend.
-- ---------------------------------------------------------------------------
do $$
declare
  v_col text;
  v_rows bigint;
begin
  foreach v_col in array array[
    'supabase_order_url', 'supabase_order_anon_key',
    'supabase_order_service_key', 'supabase_order_db_url'
  ] loop
    -- Already dropped (a re-run): nothing to check for this one.
    continue when not exists (
      select 1
        from information_schema.columns c
       where c.table_schema = 'public'
         and c.table_name = 'tenants'
         and c.column_name = v_col
    );

    execute format(
      'select count(*) from public.tenants where nullif(btrim(%I), '''') is not null',
      v_col
    ) into v_rows;

    if v_rows > 0 then
      raise exception
        'Refusing to drop public.tenants.%: % row(s) still hold a value. Nothing was dropped.',
        v_col, v_rows
        using errcode = 'P0001',
              hint = 'A store may still be configured for its own Supabase project. Investigate before dropping.';
    end if;
  end loop;

  select count(*) into v_rows from public.tenants where order_backend = 'supabase';
  if v_rows > 0 then
    raise exception
      'Refusing to drop the per-store Supabase columns: % store(s) are pinned to order_backend = ''supabase''. Nothing was dropped.',
      v_rows
      using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- The drop. One statement, so it is all four or none.
-- ---------------------------------------------------------------------------
alter table public.tenants
  drop column if exists supabase_order_url,
  drop column if exists supabase_order_anon_key,
  drop column if exists supabase_order_service_key,
  drop column if exists supabase_order_db_url;
