// 20261124180000_paid_needs_method_or_ledger.sql in PGlite, per role.
//
// A staff session may not move a register sale INTO paid while it has no
// method and its ledger is short of the bill (Koko Coffee, 2026-11-24). Every
// write the product makes must keep working: tender inserts (incl. a split
// sale inserted paid with no method), settling once the ledger squares (even
// when the cashier's RLS hides the ledger), own-method handovers, web orders,
// the service role, and re-saving an already paid order.
//
//   node tests/sql/run-paid-needs-method-or-ledger.cjs
const { PGlite } = require('@electric-sql/pglite')
const { installPlatformAuth, as, reset, readMigration } = require('./lib/platform-auth.cjs')

const T = 'aaaaaaaa-0000-4000-8000-000000000001'
const STAFF = '00000000-0000-4000-8000-000000000001'
const M = 'aaaaaaaa-5555-4000-8000-000000000001'

const SCHEMA = `
  create table orders (
    id uuid primary key default gen_random_uuid(), tenant_id uuid not null, total numeric(10,2) not null,
    status text not null default 'pending', payment_status text default 'pending', source text not null default 'web',
    payment_method_id uuid, payment_method_name text
  );
  create table order_payments (
    id uuid primary key default gen_random_uuid(), tenant_id uuid not null, order_id uuid not null,
    kind text not null check (kind = any (array['charge','refund'])), amount numeric(10,2) not null check (amount > 0)
  );
  -- A cashier without a payment READ key sees no ledger rows (live: PAYMENT_READ_KEYS).
  alter table order_payments enable row level security;
`

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`)
  if (!ok) failures += 1
}

async function order(db, fields) {
  await reset(db)
  const cols = Object.keys(fields)
  const placeholders = cols.map((_, i) => '$' + (i + 2)).join(', ')
  const { rows } = await db.query(
    'insert into orders (tenant_id, ' + cols.join(', ') + ') values ($1, ' + placeholders + ') returning id',
    [T, ...Object.values(fields)],
  )
  return rows[0].id
}

async function pay(db, orderId, amount, kind = 'charge') {
  await reset(db)
  await db.query('insert into order_payments (tenant_id, order_id, kind, amount) values ($1, $2, $3, $4)', [T, orderId, kind, amount])
}

/** Rows the update touched, or the error code. */
async function markPaid(db, role, orderId, extra = '') {
  await as(db, role, role === 'authenticated' ? STAFF : null)
  try {
    const { rows } = await db.query("update orders set payment_status = 'paid'" + extra + ' where id = $1 returning id', [orderId])
    return rows.length
  } catch (error) {
    return error.code ?? String(error.message)
  } finally {
    await reset(db)
  }
}

async function main() {
  const db = new PGlite()
  await installPlatformAuth(db)
  await db.exec(SCHEMA)
  await db.exec(readMigration('20261124180000_paid_needs_method_or_ledger.sql'))

  // The hole (Koko): pay-later handover with no method and no ledger.
  const payLater = await order(db, { total: 230, source: 'pos', status: 'completed' })
  check('refuses: method-less pay-later handover, empty ledger', (await markPaid(db, 'authenticated', payLater)) === '42501')
  const partly = await order(db, { total: 230, source: 'pos' })
  await pay(db, partly, 100)
  check('refuses: ledger short of the bill', (await markPaid(db, 'authenticated', partly)) === '42501')
  const refunded = await order(db, { total: 230, source: 'pos' })
  await pay(db, refunded, 230)
  await pay(db, refunded, 50, 'refund')
  check('refuses: ledger short after a refund', (await markPaid(db, 'authenticated', refunded)) === '42501')

  // What the product does, all still working.
  const squared = await order(db, { total: 230, source: 'pos' })
  await pay(db, squared, 130)
  await pay(db, squared, 100)
  check('allows: ledger squares the bill (hidden from the cashier by RLS)', (await markPaid(db, 'authenticated', squared)) === 1)
  const ownMethod = await order(db, { total: 230, source: 'pos', payment_method_name: 'Cash' })
  check('allows: order names its method', (await markPaid(db, 'authenticated', ownMethod)) === 1)
  const methodId = await order(db, { total: 230, source: 'pos', payment_method_id: M })
  check('allows: order carries a method id', (await markPaid(db, 'authenticated', methodId)) === 1)
  const inline = await order(db, { total: 230, source: 'pos' })
  check('allows: method written in the same update', (await markPaid(db, 'authenticated', inline, ", payment_method_name = 'GCash'")) === 1)
  const web = await order(db, { total: 230, source: 'web' })
  check('allows: web order (customer picked the method)', (await markPaid(db, 'authenticated', web)) === 1)
  const service = await order(db, { total: 230, source: 'pos' })
  check('allows: service role', (await markPaid(db, 'service_role', service)) === 1)
  const zero = await order(db, { total: 0, source: 'pos' })
  check('allows: a free order', (await markPaid(db, 'authenticated', zero)) === 1)

  // Split sale at the register: inserted PAID with no method, ledger rows later.
  await as(db, 'authenticated', STAFF)
  let inserted = false
  try {
    await db.query("insert into orders (tenant_id, total, source, payment_status) values ($1, 230, 'pos', 'paid')", [T])
    inserted = true
  } catch (error) {
    inserted = error.code
  }
  await reset(db)
  check('allows: split sale inserted paid with no method', inserted === true, String(inserted))

  // Re-saving an already paid method-less order (e.g. a status change) is free.
  const legacy = await order(db, { total: 230, source: 'pos', payment_status: 'paid' })
  await as(db, 'authenticated', STAFF)
  const { rows } = await db.query("update orders set status = 'delivered', payment_status = 'paid' where id = $1 returning id", [legacy])
  await reset(db)
  check('allows: re-saving an already paid order', rows.length === 1)

  // The helper is not callable by anon.
  await as(db, 'anon', null)
  let anonCall = 'ok'
  try {
    await db.query('select public.order_ledger_net_charged($1)', [legacy])
  } catch (error) {
    anonCall = error.code
  }
  await reset(db)
  check('anon cannot call the ledger helper', anonCall === '42501', anonCall)

  if (failures) {
    console.error('\n' + failures + ' check(s) failed')
    process.exit(1)
  }
  console.log('\nall checks passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
