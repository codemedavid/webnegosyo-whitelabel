// Shared PGlite build for the cashier-remittance runners (wave 2 onwards):
// the live slice of orders / payments / staff that cash RLS depends on, plus
// the REAL migration chain up to (and including) a given cashier migration.
//
//   const db = await buildCashDb({ through: '20261027130000_shift_expectations.sql' })
//
// Order of objects:
//   1. lib/platform-auth (roles, auth.uid(), Supabase default grants)
//   2. lib/platform-orders-stub STUB_SCHEMA + permission keys + PRE_0D_POLICIES
//   3. the columns the report / cash functions read (live types, 2026-10-27)
//   4. live bodies of app_user_may_reach_branch / app_user_belongs_to_store
//   5. discount sync, the four report migrations, staff shifts + custody +
//      server clock + drawers, store activity (check_function_bodies off,
//      like run-expenses.cjs), daily order number, inventory count sessions,
//      expenses (+ the stubs those need)
//   6. CASHIER_CHAIN in order, stopping after `through`.
// `beforeCashier(db)` runs between 5 and 6 (seed rows that must exist when a
// backfill runs).
const { PGlite } = require('@electric-sql/pglite')
const { installPlatformAuth, readMigration } = require('./platform-auth.cjs')
const { STUB_SCHEMA, PRE_0D_POLICIES } = require('./platform-orders-stub.cjs')

const CASHIER_CHAIN = [
  '20261027120000_business_day_cutoffs.sql',
  '20261027120100_cash_manage_permission.sql',
  '20261027120200_cash_settings.sql',
  '20261027120300_staff_shift_business_day.sql',
  '20261027121000_shift_sales.sql',
  '20261027130000_shift_expectations.sql',
  '20261027140000_business_day_reports.sql',
  '20261027140100_business_day_adopters.sql',
  '20261027150000_cash_activity_and_close.sql',
  '20261027160000_cash_remittances.sql',
]

const EXTRA_COLUMNS = `
  alter table orders
    add column created_at timestamptz not null default now(),
    add column source text,
    add column order_type text,
    add column service_charge_amount numeric,
    add column delivery_fee numeric,
    add column discount_data jsonb,
    add column discount_total numeric not null default 0,
    add column customer_data jsonb,
    add column payment_method_id uuid,
    add column payment_method_name text,
    add column amount_paid numeric,
    add column daily_number integer,
    add column order_date date;
  alter table order_payments
    add column payment_method_id uuid,
    add column payment_method_name text,
    add column recorded_by uuid,
    add column created_at timestamptz not null default now();
  create index orders_tenant_created_idx on orders (tenant_id, created_at desc);
  create index order_payments_tenant_created_idx on order_payments (tenant_id, created_at desc);
  create index order_payments_order_idx on order_payments (order_id, created_at);
  create table categories (id uuid primary key, tenant_id uuid not null, name text not null);
  create table menu_items (id uuid primary key, tenant_id uuid not null, category_id uuid);
  create table order_items (
    id uuid primary key default gen_random_uuid(), order_id uuid not null, menu_item_id uuid,
    menu_item_name text, category_name text, quantity integer, subtotal numeric, price numeric
  );
  alter table order_items enable row level security;
  create policy order_items_select_by_order on order_items for select using (EXISTS ( SELECT 1
     FROM orders o
    WHERE ((o.id = order_items.order_id) AND (( SELECT app_user_is_superadmin() AS app_user_is_superadmin) OR ((o.tenant_id = ( SELECT app_user_admin_tenant_id() AS app_user_admin_tenant_id)) AND ((( SELECT app_user_admin_outlet_id() AS app_user_admin_outlet_id) IS NULL) OR (o.outlet_id = ( SELECT app_user_admin_outlet_id() AS app_user_admin_outlet_id))))))));
  revoke all on order_items from anon, authenticated;
  grant select on order_items, categories, menu_items to authenticated;
  alter table tenants add column order_backend text, add column convex_deployment_url text,
    add column timezone text not null default 'Asia/Manila', add column operating_hours jsonb,
    add column enforce_operating_hours boolean default false;
  alter table outlets add column operating_hours jsonb, add column timezone text;
  alter table app_users add column display_name text, add column email text;
  create table order_status_events (id uuid primary key default gen_random_uuid());
  -- Copied from live on 2026-10-27 (pg_get_functiondef).
  CREATE OR REPLACE FUNCTION public.app_user_may_reach_branch(target_tenant_id uuid, target_outlet_id uuid)
   RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp'
  AS $function$
    SELECT EXISTS (
      SELECT 1
        FROM app_users au
       WHERE au.user_id = auth.uid()
         AND au.tenant_id = target_tenant_id
         AND au.role = ANY (ARRAY['admin','superadmin'])
         AND (
           au.outlet_id IS NULL
           OR COALESCE(au.is_owner, false)
           OR au.outlet_id = target_outlet_id
         )
    );
  $function$;
  CREATE OR REPLACE FUNCTION public.app_user_belongs_to_store(p_tenant_id uuid)
   RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp'
  AS $function$
    SELECT EXISTS (
      SELECT 1 FROM public.app_users au
       WHERE au.user_id = auth.uid()
         AND (au.role = 'superadmin' OR (au.role = 'admin' AND au.tenant_id = p_tenant_id))
    );
  $function$;
`

// Tables later cashier migrations touch (140100: order number, count
// sessions, drawer expenses), with the minimal stubs they need — live bodies
// as in run-expenses.cjs.
const ADOPTER_STUBS = `
  create table stock_movements (id uuid primary key default gen_random_uuid(), tenant_id uuid, reason text);
  create schema if not exists storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
  CREATE OR REPLACE FUNCTION public.stamp_client_actor()
   RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
  AS $function$
  begin
    if current_user in ('anon', 'authenticated') then
      new := jsonb_populate_record(new, jsonb_build_object(tg_argv[0], auth.uid(), 'created_at', now()));
    end if;
    return new;
  end;
  $function$;
  revoke all on function public.stamp_client_actor() from public, anon, authenticated;
`
const ADOPTER_MIGRATIONS = [
  '20260916123000_daily_order_number.sql',
  '20260812120000_inventory_count_sessions.sql',
  '20261022120000_expenses.sql',
  '20261022120100_expenses_rpcs.sql',
]

const BASE_MIGRATIONS = [
  '20261013090000_orders_discount_total_sync.sql',
  '20261013090100_orders_discount_total_hardening.sql',
  '20261014110000_report_sales_functions.sql',
  '20261014130000_report_functions_index_paths.sql',
  '20261014140000_report_helpers_inline.sql',
  '20261014150000_report_payments_name_aliases.sql',
  '20260823120000_staff_shifts.sql',
  '20260916150000_staff_shift_custody.sql',
  '20260927120000_staff_shift_server_timestamps.sql',
  '20261001120000_cash_drawers.sql',
]

async function buildCashDb({ through, beforeCashier, afterBase } = {}) {
  const stop = CASHIER_CHAIN.indexOf(through)
  if (through && stop === -1) throw new Error(`buildCashDb: unknown migration ${through}`)
  const db = new PGlite()
  await installPlatformAuth(db)
  await db.exec(STUB_SCHEMA)
  await db.exec(readMigration('20261013120050_staff_permission_keys.sql'))
  await db.exec(readMigration('20261022130200_expenses_opt_in.sql'))
  await db.exec(PRE_0D_POLICIES)
  await db.exec(EXTRA_COLUMNS)
  for (const file of BASE_MIGRATIONS) await db.exec(readMigration(file))
  await db.exec('set check_function_bodies = off')
  await db.exec(readMigration('20261012150000_store_activity.sql'))
  await db.exec('set check_function_bodies = on')
  await db.exec(ADOPTER_STUBS)
  for (const file of ADOPTER_MIGRATIONS) await db.exec(readMigration(file))
  // Redefines app_user_has_permission with `expenses` opt-in (its live body).
  await db.exec(readMigration('20261022130200_expenses_opt_in.sql'))
  // The live search_path pins (20260829140000): each `alter function` line on
  // its own, skipping functions this slice does not have. Without them a
  // trigger such as staff_shift_branch_belongs_to_tenant breaks under any RPC
  // running with search_path = '' — live it is pinned.
  for (const line of readMigration('20260829140000_lock_definer_rpc_and_pin_search_paths.sql').split('\n')) {
    if (!/^alter function /i.test(line.trim())) continue
    try {
      await db.exec(line)
    } catch (error) {
      if (error.code !== '42883') throw error
    }
  }
  if (afterBase) await afterBase(db)
  if (beforeCashier) await beforeCashier(db)
  const files = through ? CASHIER_CHAIN.slice(0, stop + 1) : []
  for (const file of files) await db.exec(readMigration(file))
  return db
}

module.exports = { CASHIER_CHAIN, buildCashDb, readMigration }
