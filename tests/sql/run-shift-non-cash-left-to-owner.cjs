// "I'll leave this to the owner" at End shift (20261117120000).
// The merchant app sends an unchecked GCash/card row as check = 'unchecked';
// the database only knew 'skipped', so close_shift refused the whole close
// ("The card and e-wallet tallies are not valid."). Reproduced on the real
// chain first, then the fix: 'unchecked' is accepted, stored as 'skipped', and
// the day-close checklist still lists the row for the owner.
// Real chain via lib/cash-chain.cjs; every call asserts rows or the SQLSTATE.
const assert = require('node:assert/strict')
const { as, reset } = require('./lib/platform-auth.cjs')
const { buildCashDb, readMigration } = require('./lib/cash-chain.cjs')

const T = 'aaaaaaaa-0000-4000-8000-000000000001'
const A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  cashier: '00000000-0000-4000-8000-000000000002',
  cashier2: '00000000-0000-4000-8000-000000000003',
  manager: '00000000-0000-4000-8000-000000000004',
}
const PEOPLE = `
  create table public.staff_approval_pins (user_id uuid, tenant_id uuid, pin_hash text, primary key (user_id, tenant_id));
  insert into tenants (id) values ('${T}');
  insert into outlets (id, tenant_id) values ('${A1}', '${T}');
  insert into auth.users select unnest(array[${Object.values(U).map((id) => `'${id}'::uuid`).join(',')}]);
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id, display_name) values
    ('${U.owner}',    'admin', '${T}', true,  '{}',            null,    'Olivia'),
    ('${U.cashier}',  'admin', '${T}', false, '{pos}',         '${A1}', 'Cara'),
    ('${U.cashier2}', 'admin', '${T}', false, '{pos}',         '${A1}', 'Cy'),
    ('${U.manager}',  'admin', '${T}', false, '{cash_manage}', null,    'Mara');
`

let checks = 0
function eq(actual, expected, message) {
  checks += 1
  assert.deepEqual(actual, expected, message)
}
async function refused(promise, code, message, pattern) {
  checks += 1
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `${message}: expected SQLSTATE ${code}, got ${error.code} (${error.message})`)
    if (pattern) assert.match(error.message, pattern, `${message}: message`)
    return true
  }, message)
}
async function val(db, uid, sql, params) {
  await as(db, 'authenticated', uid)
  const { rows } = await db.query(sql, params)
  return rows.length === 0 ? undefined : Object.values(rows[0])[0]
}
async function fixture(db, sql, params) {
  await reset(db)
  return (await db.query(sql, params)).rows
}
async function sale(db, cashier, total, method) {
  await fixture(db, `insert into orders (tenant_id, outlet_id, total, status, payment_status, source, payment_method_name, customer_data)
    values ($1, $2, $3, 'delivered', 'paid', 'pos', $4, $5::jsonb)`, [T, A1, total, method, JSON.stringify({ pos: { cashierId: cashier } })])
}
const CLOSE = 'select public.close_shift($1, $2::jsonb, null, null, 50000, null, true, null)'
const STATUS = 'select public.get_day_close_status($1, $2, $3::date)'
// Exactly what webnegosyo-app toCloseNonCash sends for "I'll leave this to the owner".
const tally = (check, declaredCents = null) =>
  JSON.stringify([{ key: 'name:gcash', method: 'GCash', expectedCents: 12000, slipCount: 1, check, declaredCents, note: null }])

async function shiftReadyToClose(db, cashier) {
  const shift = (await val(db, cashier, 'select public.open_shift($1, $2, null, 50000, null, null, null)', [T, A1])).shift.id
  await sale(db, cashier, 300, 'Cash')
  await sale(db, cashier, 120, 'GCash')
  await val(db, cashier, 'select public.count_shift($1, 80000, null, null)', [shift])
  return shift
}
async function stored(db, shift) {
  return (await fixture(db, 'select status, closing_non_cash from staff_shifts where id = $1', [shift]))[0]
}

async function main() {
  const db = await buildCashDb({ through: '20261027170010_day_close_activity_validate.sql', beforeCashier: (d) => d.exec(PEOPLE) })
  try {
    const today = (await fixture(db, 'select cash.business_day_of($1, now())::text as d', [T]))[0].d
    const shift = await shiftReadyToClose(db, U.cashier)

    // The bug, on the migrations as they were.
    await refused(val(db, U.cashier, CLOSE, [shift, tally('unchecked')]), '22023', 'before: "leave it to the owner" refuses the whole close',
      /tallies are not valid/)
    eq((await stored(db, shift)).status, 'open', 'before: the shift stays open')

    await reset(db)
    await db.exec(readMigration('20261117120000_shift_non_cash_left_to_owner.sql'))

    const done = await val(db, U.cashier, CLOSE, [shift, tally('unchecked')])
    eq(done.countedCents, 80000, 'after: the cashier ends the shift with GCash left to the owner')
    const row = await stored(db, shift)
    eq([row.status, row.closing_non_cash.map((t) => [t.method, t.check, t.declaredCents, t.expectedCents])],
      ['closed', [['GCash', 'skipped', null, 12000]]], "stored as the canonical 'skipped', nothing declared")
    let status = await val(db, U.manager, STATUS, [T, A1, today])
    eq(status.nonCashUnchecked.map((n) => [n.staffName, n.method]), [['Cara', 'GCash']], 'the day-close checklist still lists it for the owner')

    // A checked tally is untouched and is not listed.
    const shift2 = await shiftReadyToClose(db, U.cashier2)
    await refused(val(db, U.cashier2, CLOSE, [shift2, tally('maybe')]), '22023', 'any other answer is still refused', /tallies are not valid/)
    await val(db, U.cashier2, CLOSE, [shift2, tally('matches', 12000)])
    eq((await stored(db, shift2)).closing_non_cash.map((t) => [t.check, t.declaredCents]), [['matches', 12000]], "'matches' is stored as sent")
    status = await val(db, U.manager, STATUS, [T, A1, today])
    eq(status.nonCashUnchecked.map((n) => n.staffName), ['Cara'], 'a checked GCash tally is not on the checklist')

    // Newer app builds send the canonical word.
    await reset(db)
    const { rows } = await db.query(`select cash.non_cash_tallies_valid($1::jsonb) as ok`, [tally('skipped')])
    eq(rows[0].ok, true, "'skipped' (newer app builds) stays valid")

    console.log(`Shift non-cash left to owner: ${checks} checks passed (bug reproduced, 'unchecked' accepted + stored as 'skipped', day-close checklist, other answers refused).`)
  } finally {
    await db.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
