// PGlite worker for the report parity test (tests/unit/reports/report-sql-parity.property.test.ts).
//
// Jest cannot load PGlite (it imports its wasm dynamically, which needs
// --experimental-vm-modules), so the test writes a scenario to a JSON file and
// runs this script in a plain Node process:
//
//   node tests/sql/report-sales-worker.cjs <scenario.json>  →  JSON on stdout
//
// Scenario: { applyHigh3?: boolean, seed: { tenants, outlets, users, appUsers,
// orders, items, payments, menuItems, categories }, calls: [{ fn, args, as:
// { role, uid } }] }. Each call runs one public report function as the given
// API role (RLS and the `reports` check apply) and returns its rows or the
// error's SQLSTATE. The schema is the live slice from lib/platform-orders-stub
// plus the REAL migrations: permission keys, discount sync, report functions
// (and optionally HIGH-3).
const { readFileSync } = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')
const { installPlatformAuth, as, reset, readMigration } = require('./lib/platform-auth.cjs')
const { STUB_SCHEMA, PRE_0D_POLICIES } = require('./lib/platform-orders-stub.cjs')

const REPORT_FUNCTIONS = new Set([
  'report_sales_summary',
  'report_sales_by_period',
  'report_sales_by_dimension',
  'report_sales_by_hour',
  'report_sales_by_item',
  'report_sales_by_category',
  'report_payments',
])

// Columns the report functions read, on top of the RLS stub (types as live, 2026-10-14).
const REPORT_COLUMNS = `
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
  -- Live order_items_select_by_order (pg_policies, 2026-10-14).
  create policy order_items_select_by_order on order_items for select using (EXISTS ( SELECT 1
     FROM orders o
    WHERE ((o.id = order_items.order_id) AND (( SELECT app_user_is_superadmin() AS app_user_is_superadmin) OR ((o.tenant_id = ( SELECT app_user_admin_tenant_id() AS app_user_admin_tenant_id)) AND ((( SELECT app_user_admin_outlet_id() AS app_user_admin_outlet_id) IS NULL) OR (o.outlet_id = ( SELECT app_user_admin_outlet_id() AS app_user_admin_outlet_id))))))));
  revoke all on order_items from anon, authenticated;
  grant select on order_items, categories, menu_items to authenticated;
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

async function build(scenario) {
  const db = new PGlite()
  await installPlatformAuth(db)
  await db.exec(STUB_SCHEMA)
  await db.exec(readMigration('20261013120000_staff_permission_keys.sql'))
  await db.exec(PRE_0D_POLICIES)
  await db.exec(REPORT_COLUMNS)
  await db.exec(readMigration('20261013090000_orders_discount_total_sync.sql'))
  await db.exec(readMigration('20261013090100_orders_discount_total_hardening.sql'))
  if (scenario.applyHigh3) await db.exec(readMigration('20261013120200_order_reads_need_permission.sql'))
  await db.exec(readMigration('20261014110000_report_sales_functions.sql'))
  await db.exec(readMigration('20261014130000_report_functions_index_paths.sql'))
  await db.exec(readMigration('20261014140000_report_helpers_inline.sql'))
  await db.exec(readMigration('20261014150000_report_payments_name_aliases.sql'))

  const seed = scenario.seed
  await insertRows(db, 'tenants', seed.tenants)
  await insertRows(db, 'outlets', seed.outlets)
  await insertRows(db, 'auth.users', seed.users)
  await insertRows(db, 'app_users', seed.appUsers)
  await insertRows(db, 'categories', seed.categories)
  await insertRows(db, 'menu_items', seed.menuItems)
  await insertRows(db, 'orders', seed.orders)
  await insertRows(db, 'order_items', seed.items)
  await insertRows(db, 'order_payments', seed.payments)
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
