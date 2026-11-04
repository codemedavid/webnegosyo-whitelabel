// PGlite worker for the profit report suites
// (tests/unit/reports/report-profit-parity.property.test.ts and
// report-profit-access.test.ts).
//
// Jest cannot load PGlite, so the tests write a scenario to a JSON file and run
//   node tests/sql/report-profit-worker.cjs <scenario.json>  →  JSON on stdout
//
// Scenario: { seed: { tenants, outlets, users, appUsers, categories,
// menuItems, orders, items, payments, dishCosts, movements, payouts,
// expenseCategories, expenses }, calls: [{ fn, args, as: { role, uid } }] }.
// Each call runs one public report function as the given API role (RLS and
// the key checks apply) and returns its rows or the error's SQLSTATE.
//
// Schema: the live order/RLS slice (lib/platform-orders-stub), the order-line
// columns the sales parity worker uses, stubs of stock_movements,
// order_item_costs and shift_cash_movements with their LIVE select policies
// (pg_policies, 2026-10-21), and the REAL migrations: permission keys,
// discount sync, the sales report functions, the expense book
// (20261022120000) and the profit functions (20261022120300 + 20261022130100).
const { readFileSync } = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')
const { installPlatformAuth, as, reset, readMigration } = require('./lib/platform-auth.cjs')
const { STUB_SCHEMA, PRE_0D_POLICIES } = require('./lib/platform-orders-stub.cjs')

const REPORT_FUNCTIONS = new Set([
  'report_profit_summary',
  'report_profit_by_period',
  'report_expenses_by_category',
  'report_sales_summary',
])

// As tests/sql/report-sales-worker.cjs (types as live, 2026-10-14).
const ORDER_COLUMNS = `
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
    add column payment_method_name text;
  alter table order_payments
    add column payment_method_id uuid,
    add column payment_method_name text,
    add column created_at timestamptz not null default now();
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
`

// Live helper bodies (pg_get_functiondef, 2026-10-21), and the inventory and
// drawer tables with their live SELECT policies. Columns: what the profit
// functions read, with the live types.
const PROFIT_STUBS = `
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
  -- Stands in for the security floor's actor stamp (20261012140000); only suppliers use it.
  create or replace function public.stamp_client_actor() returns trigger language plpgsql as $$ begin return new; end; $$;

  create table stock_movements (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null,
    inventory_item_id uuid not null default gen_random_uuid(),
    reason text not null,
    quantity_delta numeric(16,4) not null,
    unit_cost numeric(12,4),
    order_id text,
    outlet_id uuid,
    created_at timestamptz default now()
  );
  create index stock_movements_tenant_created_idx on stock_movements (tenant_id, created_at desc);
  create index idx_stock_movements_order on stock_movements (order_id) where order_id is not null;
  alter table stock_movements enable row level security;
  create policy stock_movements_select_branch on stock_movements for select using (app_user_may_reach_branch(tenant_id, outlet_id));
  create policy stock_movements_select_superadmin on stock_movements for select using (EXISTS ( SELECT 1
     FROM app_users au
    WHERE ((au.user_id = auth.uid()) AND (au.role = 'superadmin'::text))));
  revoke all on stock_movements from anon, authenticated;
  grant select on stock_movements to authenticated;

  create table order_item_costs (
    order_item_id uuid primary key,
    tenant_id uuid not null,
    unit_cost numeric(12,4) not null check (unit_cost >= 0),
    source text not null default 'recipe',
    costed_at timestamptz not null default now()
  );
  alter table order_item_costs enable row level security;
  create policy order_item_costs_select_costs on order_item_costs for select to authenticated
    using (app_user_has_permission(tenant_id, 'costs'::text) AND app_user_may_reach_branch(tenant_id, NULL::uuid));
  create policy order_item_costs_select_platform on order_item_costs for select to authenticated
    using (( SELECT app_user_platform_can(ARRAY['stores.view'::text, 'tenants.view'::text, 'overview.view'::text]) AS app_user_platform_can));
  revoke all on order_item_costs from anon, authenticated;
  grant select on order_item_costs to authenticated;

  -- Only the open/closed status (the expense book's undo-after-save policy reads it).
  create table staff_shifts (id uuid primary key default gen_random_uuid(), tenant_id uuid, status text not null default 'open');

  create table shift_cash_movements (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null,
    outlet_id uuid,
    shift_id uuid not null default gen_random_uuid(),
    kind text not null check (kind in ('collect','pay_in','pay_out')),
    amount numeric(12,2) not null check (amount > 0 and amount <= 10000000),
    reason text,
    recorded_by uuid,
    recorded_by_name text not null default 'Cashier',
    created_at timestamptz not null default now()
  );
  create index idx_shift_cash_movements_tenant on shift_cash_movements (tenant_id, created_at desc);
  alter table shift_cash_movements enable row level security;
  create policy shift_cash_movements_read_branch on shift_cash_movements for select to authenticated
    using (app_user_may_reach_branch(tenant_id, outlet_id));
  revoke all on shift_cash_movements from anon, authenticated;
  grant select on shift_cash_movements to authenticated;
`

async function insertRows(db, table, rows) {
  for (const row of rows ?? []) {
    const columns = Object.keys(row)
    const values = columns.map((column) => {
      const value = row[column]
      return value !== null && typeof value === 'object' && !Array.isArray(value) ? JSON.stringify(value) : value
    })
    await db.query(
      `insert into ${table} (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
      values,
    )
  }
}

/** Expenses go in recorded (the book's triggers insist), then the void ones are voided. */
async function insertExpenses(db, rows) {
  for (const { void_reason: voidReason, ...row } of rows ?? []) {
    await insertRows(db, 'expenses', [{ ...row, status: 'recorded' }])
    if (voidReason) {
      await db.query(
        "update expenses set status = 'void', void_reason = $2, voided_at = now() where id = $1",
        [row.id, voidReason],
      )
    }
  }
}

async function build(scenario) {
  const db = new PGlite()
  await installPlatformAuth(db)
  await db.exec(STUB_SCHEMA)
  await db.exec(readMigration('20261013120050_staff_permission_keys.sql'))
  await db.exec(PRE_0D_POLICIES)
  await db.exec(ORDER_COLUMNS)
  await db.exec(PROFIT_STUBS)
  await db.exec(readMigration('20261013090000_orders_discount_total_sync.sql'))
  await db.exec(readMigration('20261013090100_orders_discount_total_hardening.sql'))
  await db.exec(readMigration('20261014110000_report_sales_functions.sql'))
  await db.exec(readMigration('20261014130000_report_functions_index_paths.sql'))
  await db.exec(readMigration('20261014140000_report_helpers_inline.sql'))
  await db.exec(readMigration('20261014150000_report_payments_name_aliases.sql'))
  await db.exec(readMigration('20261022120000_expenses.sql'))
  await db.exec(readMigration('20261022120300_report_profit.sql'))
  await db.exec(readMigration('20261022130100_report_profit_live_orders.sql'))
  // Business-day dating (seed.cutoffs = schedule rows): cutoffs table +
  // helpers, the constant-cutoff helper, then the profit day buckets.
  await db.exec(readMigration('20261027120000_business_day_cutoffs.sql'))
  await db.exec(readMigration('20261027140000_business_day_reports.sql'))
  await db.exec(readMigration('20261027180000_profit_business_day.sql'))

  const seed = scenario.seed
  await insertRows(db, 'tenants', seed.tenants)
  await insertRows(db, 'business_day_cutoffs', seed.cutoffs)
  await insertRows(db, 'outlets', seed.outlets)
  await insertRows(db, 'auth.users', seed.users)
  await insertRows(db, 'app_users', seed.appUsers)
  await insertRows(db, 'categories', seed.categories)
  await insertRows(db, 'menu_items', seed.menuItems)
  await insertRows(db, 'orders', seed.orders)
  await insertRows(db, 'order_items', seed.items)
  await insertRows(db, 'order_payments', seed.payments)
  await insertRows(db, 'order_item_costs', seed.dishCosts)
  await insertRows(db, 'stock_movements', seed.movements)
  await insertRows(db, 'shift_cash_movements', seed.payouts)
  await insertRows(db, 'expense_categories', seed.expenseCategories)
  await insertExpenses(db, seed.expenses)
  return db
}

async function run(db, call) {
  if (!REPORT_FUNCTIONS.has(call.fn)) throw new Error(`not a report function: ${call.fn}`)
  const names = Object.keys(call.args)
  const sql = `select * from public.${call.fn}(${names.map((name, i) => `${name} => $${i + 1}`).join(', ')})`
  if (call.as) await as(db, call.as.role, call.as.uid)
  else await reset(db)
  try {
    const { rows } = await db.query(sql, names.map((name) => call.args[name]))
    return { rows }
  } catch (error) {
    return { error: { code: error.code, message: error.message } }
  } finally {
    await reset(db)
  }
}

async function main() {
  const scenario = JSON.parse(readFileSync(process.argv[2], 'utf8'))
  const db = await build(scenario)
  const results = []
  for (const call of scenario.calls) results.push(await run(db, call))
  await db.close()
  process.stdout.write(JSON.stringify({ results }, (_, value) => (typeof value === 'bigint' ? Number(value) : value)))
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`)
  process.exit(1)
})
