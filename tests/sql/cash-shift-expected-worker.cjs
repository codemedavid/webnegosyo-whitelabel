// PGlite worker for tests/unit/cash/shift-expected-sql-parity.property.test.ts.
//
//   node tests/sql/cash-shift-expected-worker.cjs <scenarios.json>  →  JSON on stdout
//
// Each scenario is one store with one open shift, its orders, ledger rows and
// drawer movements; the answer is cash.shift_expected(shift, until) from the
// REAL migration chain (lib/cash-chain.cjs, through 20261027130000).
const { readFileSync } = require('node:fs')
const { reset } = require('./lib/platform-auth.cjs')
const { buildCashDb } = require('./lib/cash-chain.cjs')

const ORDER_COLUMNS = 'id, tenant_id, outlet_id, created_at, source, status, total, payment_method_name, amount_paid, customer_data'
const PAYMENT_COLUMNS = 'id, tenant_id, order_id, kind, amount, payment_method_name, recorded_by, created_at'

async function seed(db, s) {
  await db.query('insert into tenants (id) values ($1)', [s.tenantId])
  for (const outlet of s.outletIds) await db.query('insert into outlets (id, tenant_id) values ($1, $2)', [outlet, s.tenantId])
  for (const user of s.staffIds) await db.query('insert into auth.users (id) values ($1) on conflict do nothing', [user])
  let drawer = null
  if (s.shift.isZeroBalance) {
    drawer = s.shift.id.replace(/^.{8}/, 'dddddddd')
    await db.query("insert into cash_drawers (id, tenant_id, outlet_id, name, is_zero_balance) values ($1, $2, $3, 'Zero', true)", [drawer, s.tenantId, s.shift.outletId])
  }
  await db.query(`insert into staff_shifts (id, tenant_id, outlet_id, staff_user_id, staff_name, opening_float, opened_at, drawer_id)
    values ($1, $2, $3, $4, 'X', $5, $6, $7)`, [s.shift.id, s.tenantId, s.shift.outletId, s.shift.staffUserId, s.shift.openingFloat, s.shift.openedAt, drawer])
  for (const m of s.moves) {
    await db.query("insert into shift_cash_movements (tenant_id, shift_id, kind, amount, reason, recorded_by_name) values ($1, $2, $3, $4, $5, 'X')",
      [s.tenantId, s.shift.id, m.kind, m.amount, m.kind === 'collect' ? null : 'reason'])
  }
  if (s.orders.length) {
    await db.query(`insert into orders (${ORDER_COLUMNS}) select ${ORDER_COLUMNS} from jsonb_populate_recordset(null::orders, $1::jsonb)`, [JSON.stringify(s.orders)])
  }
  if (s.payments.length) {
    await db.query(`insert into order_payments (${PAYMENT_COLUMNS}) select ${PAYMENT_COLUMNS} from jsonb_populate_recordset(null::order_payments, $1::jsonb)`, [JSON.stringify(s.payments)])
  }
}

async function main() {
  const { scenarios } = JSON.parse(readFileSync(process.argv[2], 'utf8'))
  const db = await buildCashDb({ through: '20261027130000_shift_expectations.sql' })
  await reset(db)
  const results = []
  for (const s of scenarios) {
    await seed(db, s)
    const { rows } = await db.query('select cash.shift_expected(sh, $2::timestamptz) as r, sh.opening_float::text as float from staff_shifts sh where sh.id = $1', [s.shift.id, s.until])
    results.push({ ...rows[0].r, storedFloat: rows[0].float })
  }
  await db.close()
  process.stdout.write(JSON.stringify({ results }))
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`)
  process.exit(1)
})
