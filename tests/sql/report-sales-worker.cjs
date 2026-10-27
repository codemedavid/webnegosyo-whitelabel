// PGlite worker for the report parity test (tests/unit/reports/report-sql-parity.property.test.ts).
//
// Jest cannot load PGlite (it imports its wasm dynamically, which needs
// --experimental-vm-modules), so the test writes a scenario to a JSON file and
// runs this script in a plain Node process:
//
//   node tests/sql/report-sales-worker.cjs <scenario.json>  →  JSON on stdout
//
// Scenario: { applyHigh3?: boolean, seed: { tenants, cutoffs, outlets, users, appUsers,
// orders, items, payments, menuItems, categories }, calls: [{ fn, args, as:
// { role, uid } }] }. Each call runs one public report function as the given
// API role (RLS and the `reports` check apply) and returns its rows or the
// error's SQLSTATE. The schema is the live slice from lib/platform-orders-stub
// plus the REAL migrations: permission keys, discount sync, report functions
// (and optionally HIGH-3).
const { readFileSync } = require('node:fs')
const { as, reset, readMigration } = require('./lib/platform-auth.cjs')
// The live slice + the REAL chain (report migrations, staff shifts, the cashier
// migrations through 20261027140000): so the parity test also covers
// report_payments / report_sales_by_item as redefined by 20261027121000 and
// the business-day buckets of 20261027140000 (seed.cutoffs = schedule rows).
const { buildCashDb } = require('./lib/cash-chain.cjs')

const REPORT_FUNCTIONS = new Set([
  'report_sales_summary',
  'report_sales_by_period',
  'report_sales_by_dimension',
  'report_sales_by_hour',
  'report_sales_by_item',
  'report_sales_by_category',
  'report_payments',
])

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
  const db = await buildCashDb({
    through: '20261027140000_business_day_reports.sql',
    afterBase: scenario.applyHigh3 ? (d) => d.exec(readMigration('20261013120200_order_reads_need_permission.sql')) : undefined,
  })
  await reset(db)
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
