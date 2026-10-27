// Cash alerts (20261027190000): cash.notify_overdue_shifts files ONE
// shift_overdue per forgotten shift and ONE remittance_pending per hand-over
// waiting over an hour, with the W3.3 columns; the bell's visibility by kind
// (cash kinds need cash_manage + branch reach, stock kinds unchanged); the
// kind check. Real chain via lib/cash-chain.cjs (bell = live 20261012120000
// sections 1–2). pg_cron and pg_net are absent here: the schedule block is
// skipped and the push trigger is not loaded (the route is tested on web).
const assert = require('node:assert/strict')
const { as, asAnon, reset } = require('./lib/platform-auth.cjs')
const { buildCashDb } = require('./lib/cash-chain.cjs')

const T = 'aaaaaaaa-0000-4000-8000-000000000001'
const A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const DRAWER = 'dddddddd-0000-4000-8000-000000000001'
const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  cashier: '00000000-0000-4000-8000-000000000002',
  cashier2: '00000000-0000-4000-8000-000000000003',
  manager: '00000000-0000-4000-8000-000000000004',
  a2Mgr: '00000000-0000-4000-8000-000000000005',
  menu: '00000000-0000-4000-8000-000000000006',
  legacy: '00000000-0000-4000-8000-000000000007',
}
const PEOPLE = `
  create table public.staff_approval_pins (user_id uuid, tenant_id uuid, pin_hash text, primary key (user_id, tenant_id));
  insert into tenants (id) values ('${T}');
  insert into outlets (id, tenant_id, name) values ('${A1}', '${T}', 'Makati'), ('${A2}', '${T}', 'BGC');
  insert into auth.users select unnest(array[${Object.values(U).map((id) => `'${id}'::uuid`).join(',')}]);
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id, display_name) values
    ('${U.owner}',    'admin', '${T}', true,  '{}',                null,    'Olivia'),
    ('${U.cashier}',  'admin', '${T}', false, '{pos}',             '${A1}', 'Cara'),
    ('${U.cashier2}', 'admin', '${T}', false, '{pos}',             '${A1}', 'Cy'),
    ('${U.manager}',  'admin', '${T}', false, '{cash_manage}',     null,    'Mara'),
    ('${U.a2Mgr}',    'admin', '${T}', false, '{cash_manage}',     '${A2}', 'Bea'),
    ('${U.menu}',     'admin', '${T}', false, '{menu}',            null,    'Mo'),
    ('${U.legacy}',   'admin', '${T}', false, null,                null,    'Lee');
  insert into cash_drawers (id, tenant_id, outlet_id, name) values ('${DRAWER}', '${T}', '${A1}', 'Cashier 1');
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
async function fixture(db, sql, params) {
  await reset(db)
  return (await db.query(sql, params)).rows
}
async function val(db, uid, sql, params) {
  await as(db, 'authenticated', uid)
  const { rows } = await db.query(sql, params)
  return rows.length === 0 ? undefined : Object.values(rows[0])[0]
}
const notify = async (db) => Number((await fixture(db, 'select cash.notify_overdue_shifts() as n'))[0].n)
async function bell(db, uid) {
  await as(db, 'authenticated', uid)
  return (await db.query('select kind from merchant_notifications order by kind')).rows.map((r) => r.kind)
}

async function main() {
  const db = await buildCashDb({ through: '20261027190000_cash_alerts.sql', beforeCashier: (d) => d.exec(PEOPLE) })
  try {
    // A shift forgotten from two days ago, a fresh one, and a hand-over waiting 2 h.
    const stale = (await val(db, U.cashier, 'select public.open_shift($1, $2, $3, 0, null, null, null)', [T, A1, DRAWER])).shift.id
    await reset(db)
    await db.exec('set session_replication_role = replica')
    await db.query("update staff_shifts set opened_at = now() - interval '2 days', business_day = business_day - 2 where id = $1", [stale])
    await db.exec('set session_replication_role = origin')
    const fresh = (await val(db, U.cashier2, 'select public.open_shift($1, $2, null, 50000, null, null, null)', [T, A1])).shift.id
    const done = (await val(db, U.legacy, 'select public.open_shift($1, $2, null, 50000, null, null, null)', [T, A1])).shift.id
    await val(db, U.legacy, 'select public.count_shift($1, 80000, null, 80000)', [done])
    const closed = await val(db, U.legacy, 'select public.close_shift($1, null, null, null, 50000, $2, false, null)', [done, U.manager])
    await fixture(db, "update cash_remittances set created_at = now() - interval '2 hours' where id = $1", [closed.remittanceId])
    // A recent hand-over (not yet an hour) and an accepted one.
    const fresh2 = await val(db, U.cashier2, 'select public.record_cash_pickup($1, 1000, $2, false, null)', [fresh, U.manager])
    eq(fresh2.status, 'pending', 'a fresh pickup is pending')

    eq(await notify(db), 2, 'one overdue shift and one hand-over waiting over an hour')
    const rows = await fixture(db, 'select kind, item_name, drawer_name, outlet_name, outlet_id, shift_id, remittance_id, cash_cents from merchant_notifications order by kind')
    eq(rows.map((r) => [r.kind, r.item_name, r.drawer_name, r.outlet_name, r.outlet_id, r.shift_id, r.remittance_id, r.cash_cents === null ? null : Number(r.cash_cents)]), [
      ['remittance_pending', 'Lee', null, 'Makati', A1, done, closed.remittanceId, 30000],
      ['shift_overdue', 'Cara', 'Cashier 1', 'Makati', A1, stale, null, null],
    ], 'W3.3 columns: the person, drawer, branch, and the amount for a hand-over')
    eq(await notify(db), 0, 'a second run files nothing again (one notice each)')
    await fixture(db, 'delete from merchant_notifications')
    eq(await notify(db), 2, '(the once-only rule is the unique index, not the run)')

    // Visibility by kind.
    await fixture(db, "insert into merchant_notifications (tenant_id, outlet_id, kind, item_name) values ($1, $2, 'stock_low', 'Rice')", [T, A1])
    eq(await bell(db, U.owner), ['remittance_pending', 'shift_overdue', 'stock_low'], 'the owner sees every kind')
    eq(await bell(db, U.legacy), ['remittance_pending', 'shift_overdue', 'stock_low'], 'NULL permissions see every kind')
    eq(await bell(db, U.manager), ['remittance_pending', 'shift_overdue'], 'cash_manage sees the cash kinds (not stock without menu)')
    eq(await bell(db, U.menu), ['stock_low'], 'menu sees stock, never cash')
    eq(await bell(db, U.cashier), [], 'a pos-only cashier sees no cash alerts')
    eq(await bell(db, U.a2Mgr), [], "a manager locked to another branch sees none of this branch's")
    // anon keeps Supabase's default SELECT grant on this table (as live); the
    // read policy is for `authenticated`, so anon gets no rows.
    await asAnon(db)
    eq(Number((await db.query('select count(*) from merchant_notifications')).rows[0].count), 0, 'anon reads nothing')

    await refused(fixture(db, "insert into merchant_notifications (tenant_id, kind, item_name) values ($1, 'shift_late', 'x')", [T]), '23514', 'unknown kinds are refused')
    await as(db, 'authenticated', U.manager)
    await refused(db.query('select cash.notify_overdue_shifts()'), '42501', 'the notifier is not callable by clients')
    await refused(db.query("insert into merchant_notifications (tenant_id, kind, item_name) values ($1, 'shift_overdue', 'x')", [T]), '42501', 'clients never write the bell')

    // Nothing is closed or counted by the notifier.
    eq((await fixture(db, 'select status, closing_count from staff_shifts where id = $1', [stale]))[0], { status: 'open', closing_count: null }, 'the forgotten shift is left as it was')
    console.log(`Cash alerts: ${checks} checks passed (overdue shift + waiting hand-over notices once, W3.3 columns, visibility by kind per role, kind check, no auto-close).`)
  } finally {
    await db.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
