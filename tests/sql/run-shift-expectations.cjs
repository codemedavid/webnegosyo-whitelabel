// Server expected cash, frozen at close (20261027130000 shadow, 20261027130100
// authoritative — the latter applied HERE ONLY, never live before the probe).
// Built on lib/cash-chain.cjs (the real chain). Every close is the legacy
// direct UPDATE old app builds send; the RPC paths are covered in
// run-shift-close.cjs.
const assert = require('node:assert/strict')
const { as, asAnon, reset } = require('./lib/platform-auth.cjs')
const { buildCashDb, readMigration } = require('./lib/cash-chain.cjs')

const T_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_C = 'cccccccc-0000-4000-8000-000000000001' // Convex store
const A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  cashier: '00000000-0000-4000-8000-000000000002',
  cashier2: '00000000-0000-4000-8000-000000000003',
  manager: '00000000-0000-4000-8000-000000000004',
  ownerC: '00000000-0000-4000-8000-000000000005',
  branch2Mgr: '00000000-0000-4000-8000-000000000006',
}

const PEOPLE = `
  insert into tenants (id) values ('${T_A}');
  insert into tenants (id, convex_deployment_url) values ('${T_C}', 'https://otter-1.convex.cloud');
  insert into outlets (id, tenant_id) values ('${A1}', '${T_A}'), ('${A2}', '${T_A}');
  insert into auth.users select unnest(array[${Object.values(U).map((id) => `'${id}'::uuid`).join(',')}]);
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id, display_name) values
    ('${U.owner}',      'admin', '${T_A}', true,  '{}',            null,    'Olivia'),
    ('${U.cashier}',    'admin', '${T_A}', false, '{pos}',         '${A1}', 'Cara'),
    ('${U.cashier2}',   'admin', '${T_A}', false, '{pos}',         '${A1}', 'Cy'),
    ('${U.manager}',    'admin', '${T_A}', false, '{cash_manage}', null,    'Mara'),
    ('${U.ownerC}',     'admin', '${T_C}', true,  '{}',            null,    'Cole'),
    ('${U.branch2Mgr}', 'admin', '${T_A}', false, '{cash_manage}', '${A2}', 'Bea');
`

let checks = 0
function eq(actual, expected, message) {
  checks += 1
  assert.deepEqual(actual, expected, message)
}
async function refused(promise, code, message) {
  checks += 1
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `${message}: expected SQLSTATE ${code}, got ${error.code} (${error.message})`)
    return true
  }, message)
}
async function scalar(db, sql, params) {
  const { rows } = await db.query(sql, params)
  return rows.length === 0 ? undefined : Object.values(rows[0])[0]
}
async function openAs(db, uid, tenant = T_A, outlet = A1, float = 500) {
  await as(db, 'authenticated', uid)
  return (await db.query("insert into staff_shifts (tenant_id, outlet_id, staff_user_id, staff_name, opening_float) values ($1, $2, $3, 'X', $4) returning id", [tenant, outlet, uid, float])).rows[0].id
}
async function legacyClose(db, uid, shift, expected, counted) {
  await as(db, 'authenticated', uid)
  return (await db.query("update staff_shifts set status = 'closed', closed_at = now(), expected_cash = $2, closing_count = $3 where id = $1", [shift, expected, counted])).affectedRows
}
async function expectation(db, shift) {
  await reset(db)
  const row = (await db.query('select * from shift_expectations where shift_id = $1', [shift])).rows[0]
  if (!row) return row
  return { ...row, expected_cents: row.expected_cents === null ? null : Number(row.expected_cents), server_expected_cents: row.server_expected_cents === null ? null : Number(row.server_expected_cents), device_expected_cents: row.device_expected_cents === null ? null : Number(row.device_expected_cents) }
}

let n = 0
async function order(db, { tenant = T_A, outlet = A1, total, method = 'Cash', source = 'pos', status = 'delivered', cashier = U.cashier, payLater = false, amountPaid = null, at = 'now()', blobOutlet = null }) {
  await reset(db)
  n += 1
  const id = `0a000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const pos = cashier === null ? {} : { pos: { cashierId: cashier, ...(payLater ? { payLater: true } : {}) } }
  const customerData = { ...pos, ...(blobOutlet ? { outlet_id: blobOutlet } : {}) }
  await db.query(`insert into orders (id, tenant_id, outlet_id, total, status, source, payment_method_name, amount_paid, customer_data, created_at)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, ${at})`, [id, tenant, outlet, total, status, source, method, amountPaid, JSON.stringify(customerData)])
  return id
}
async function pay(db, orderId, { kind = 'charge', amount, method = 'Cash', by = U.cashier, at = 'now()' }) {
  await reset(db)
  await db.query(`insert into order_payments (tenant_id, order_id, kind, amount, payment_method_name, recorded_by, created_at) values ($1, $2, $3, $4, $5, $6, ${at})`, [T_A, orderId, kind, amount, method, by])
}

async function checkShadow(db) {
  const shift = await openAs(db, U.cashier)
  await order(db, { total: 100 }) // cash, no ledger
  await order(db, { total: 200, method: 'GCash' }) // non-cash
  await order(db, { total: 120, payLater: true, amountPaid: 50 }) // pay later: what was paid
  await order(db, { total: 999, status: 'cancelled' }) // cancelled: never held
  await order(db, { total: 70, cashier: U.cashier2 }) // someone else's sale
  await order(db, { total: 500, outlet: A2 }) // another branch
  await order(db, { total: 25, outlet: null, blobOutlet: A1 }) // branch only in the blob
  await order(db, { total: 88, at: "now() - interval '1 day'" }) // before clock-in
  await order(db, { total: 15, source: 'web' }) // online, no ledger: not the drawer's
  const online = await order(db, { total: 300, source: 'web', cashier: null })
  await pay(db, online, { amount: 300 }) // ledger on an online order: counted (recorded_by = cashier)
  const edited = await order(db, { total: 80 })
  await pay(db, edited, { amount: 80 })
  await pay(db, edited, { kind: 'refund', amount: 40 }) // change returned after an edit
  const theirs = await order(db, { total: 60 })
  await pay(db, theirs, { amount: 60, by: U.cashier2 }) // collected by a colleague: not here, and not legacy either
  const cancelledPaid = await order(db, { total: 45, status: 'cancelled' })
  await pay(db, cancelledPaid, { amount: 45, method: ' CASH ' }) // real money on a cancelled order still counts
  await as(db, 'authenticated', U.cashier)
  for (const [kind, amount, reason] of [['pay_in', 100, 'change'], ['pay_out', 30, 'ice'], ['collect', 200, null]]) {
    await db.query("insert into shift_cash_movements (tenant_id, shift_id, kind, amount, reason, recorded_by_name) values ($1, $2, $3, $4, $5, 'Cara')", [T_A, shift, kind, amount, reason])
  }
  // Server: float 500 + cash (100 + 50 + 25 + 300 + 40 + 45 = 560) + 100 − 30 − 200 = 930.
  await reset(db)
  const live = await scalar(db, 'select cash.shift_expected(s, now()) from staff_shifts s where id = $1', [shift])
  eq([live.expectedCents, live.cashSalesCents, live.nonCashCents, live.refundCents, live.saleCount], [93000, 56000, 20000, 4000, 7], 'the server twin adds up the drawer (cash, non-cash, refunds, sales)')
  eq([live.payInCents, live.payOutCents, live.collectedCents, live.floatCents, live.floatKeptCents], [10000, 3000, 20000, 50000, 50000], 'movements and float')
  eq(live.nonCashByMethod, [{ key: 'name:gcash', label: 'GCash', cents: 20000, count: 1 }], 'non-cash by method, for the tallies check')

  eq(await legacyClose(db, U.cashier, shift, 900, 900), 1, 'an old build closes with its own figure')
  const frozen = await expectation(db, shift)
  eq([frozen.source, frozen.expected_cents, frozen.server_expected_cents, frozen.device_expected_cents, frozen.mode, frozen.engine_version],
    ['device', 90000, 93000, 90000, 'shadow', 1], 'shadow: the register\'s figure is the one used; the server\'s is recorded beside it')
  await reset(db)
  eq(await scalar(db, 'select expected_cash::text from staff_shifts where id = $1', [shift]), '900.00', 'shadow: staff_shifts.expected_cash is unchanged')
  eq(await scalar(db, 'select device_expected_cash::text from staff_shifts where id = $1', [shift]), '900.00', 'the device figure is kept on the shift')
  eq((await expectation(db, shift)).breakdown.expectedCents, 93000, 'the breakdown is frozen with it')
  return shift
}

async function checkReads(db, shift) {
  await as(db, 'authenticated', U.cashier)
  eq(Number(await scalar(db, 'select count(*) from shift_expectations where shift_id = $1', [shift])), 1, 'the cashier reads their own (non-blind) expectation')
  await refused(db.query('insert into shift_expectations (shift_id, tenant_id, source, expected_cents, engine_version, mode) values ($1, $2, \'device\', 1, 1, \'shadow\')', [shift, T_A]), '42501', 'no client writes it')
  await refused(db.query('update shift_expectations set expected_cents = 1'), '42501', 'nor changes it')
  await as(db, 'authenticated', U.cashier2)
  eq(Number(await scalar(db, 'select count(*) from shift_expectations')), 0, "a colleague reads none of another cashier's")
  await as(db, 'authenticated', U.manager)
  eq(Number(await scalar(db, 'select count(*) from shift_expectations')), 1, 'a cash manager reads it')
  await as(db, 'authenticated', U.branch2Mgr)
  eq(Number(await scalar(db, 'select count(*) from shift_expectations')), 0, "a branch-locked manager at another branch reads none")
  await asAnon(db)
  await refused(db.query('select count(*) from shift_expectations'), '42501', 'anon reads nothing')
  await as(db, 'authenticated', U.cashier)
  await refused(db.query("select cash.shift_expected(s, now()) from staff_shifts s limit 1"), '42501', 'cash.shift_expected is internal')
}

async function checkBlind(db) {
  await reset(db)
  await db.query('insert into tenant_cash_settings (tenant_id, blind_close) values ($1, true)', [T_A])
  const shift = await openAs(db, U.cashier2)
  await legacyClose(db, U.cashier2, shift, 500, 500)
  await as(db, 'authenticated', U.cashier2)
  eq(Number(await scalar(db, 'select count(*) from shift_expectations where shift_id = $1', [shift])), 0, 'a blind shift: the cashier cannot read the expectation')
  await as(db, 'authenticated', U.manager)
  eq(Number(await scalar(db, 'select count(*) from shift_expectations where shift_id = $1', [shift])), 1, 'the cash manager can')
  await reset(db)
  await db.query('update tenant_cash_settings set blind_close = false where tenant_id = $1', [T_A])
}

async function checkConvexAndFailure(db) {
  const convex = await openAs(db, U.ownerC, T_C, null, 0)
  await legacyClose(db, U.ownerC, convex, 250, 250)
  const c = await expectation(db, convex)
  eq([c.source, c.expected_cents, c.server_expected_cents, c.device_expected_cents], ['device', 25000, null, 25000], 'a Convex store: the register\'s figure, labelled device')

  await reset(db)
  await db.exec(`create or replace function cash.shift_expected(p_shift public.staff_shifts, p_until timestamptz) returns jsonb
    language plpgsql stable security definer set search_path = '' as $$ begin raise exception 'boom'; end $$`)
  const broken = await openAs(db, U.cashier)
  eq(await legacyClose(db, U.cashier, broken, 500, 500), 1, 'a failing server computation never blocks a close')
  const b = await expectation(db, broken)
  eq([b.source, b.server_expected_cents, b.device_expected_cents], ['device', null, 50000], 'it falls back to the device figure')
  await reset(db)
  await db.exec(readMigration('20261027130000_shift_expectations.sql'))
}

async function checkAuthoritative(db) {
  await reset(db)
  await db.exec(readMigration('20261027130100_shift_expectations_authoritative.sql'))
  const shift = await openAs(db, U.cashier)
  await order(db, { total: 150 })
  const id = await order(db, { total: 60, method: 'Maya' })
  await pay(db, id, { amount: 60, method: 'Maya' })
  await legacyClose(db, U.cashier, shift, 9999, 650)
  const e = await expectation(db, shift)
  eq([e.source, e.expected_cents, e.server_expected_cents, e.device_expected_cents, e.mode], ['server', 65000, 65000, 999900, 'server'], 'authoritative: the server figure is the one used')
  await reset(db)
  eq(await scalar(db, 'select expected_cash::text from staff_shifts where id = $1', [shift]), '650.00', 'and the register can no longer choose expected_cash (it sent ₱9,999)')
  eq(await scalar(db, 'select device_expected_cash::text from staff_shifts where id = $1', [shift]), '9999.00', 'what it sent is kept as the device figure')
  const convex = await openAs(db, U.ownerC, T_C, null, 0)
  await legacyClose(db, U.ownerC, convex, 300, 300)
  eq((await expectation(db, convex)).source, 'device', 'a Convex store still uses its register\'s figure')
  await reset(db)
  eq(await scalar(db, 'select expected_cash::text from staff_shifts where id = $1', [convex]), '300.00', 'unchanged there')
  eq(await scalar(db, "select mode from shift_expectations where shift_id = (select shift_id from shift_expectations order by computed_at limit 1)"), 'shadow', 'rows frozen in shadow keep their mode')
}

async function main() {
  const db = await buildCashDb({ through: '20261027130000_shift_expectations.sql', beforeCashier: (d) => d.exec(PEOPLE) })
  try {
    const shift = await checkShadow(db)
    await checkReads(db, shift)
    await checkBlind(db)
    await checkConvexAndFailure(db)
    await checkAuthoritative(db)
    console.log(`Shift expectations: ${checks} checks passed (server twin arms, shadow freeze, reads per role, blind, Convex, failure fallback, authoritative switch).`)
  } finally {
    await db.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
