// Cash reports (20261027200000): report_cash_summary (one row per shift:
// frozen expected vs counted, first vs final count, remittance) and
// report_cash_by_staff (short / over counts and totals, forced closes,
// recounts that changed the figure), per role: cash_manage only (42501),
// RLS keeps a branch-locked manager on their branch, ≤ 93 days.
// Real chain via lib/cash-chain.cjs; shifts made through the real RPCs.
const assert = require('node:assert/strict')
const { as, asAnon, reset } = require('./lib/platform-auth.cjs')
const { buildCashDb } = require('./lib/cash-chain.cjs')

const T = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_B = 'bbbbbbbb-0000-4000-8000-000000000001'
const A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  cara: '00000000-0000-4000-8000-000000000002',
  cy: '00000000-0000-4000-8000-000000000003',
  ana: '00000000-0000-4000-8000-000000000004',
  manager: '00000000-0000-4000-8000-000000000005',
  a2Mgr: '00000000-0000-4000-8000-000000000006',
  reporter: '00000000-0000-4000-8000-000000000007',
  ownerB: '00000000-0000-4000-8000-000000000008',
}
const PEOPLE = `
  create table public.staff_approval_pins (user_id uuid, tenant_id uuid, pin_hash text, primary key (user_id, tenant_id));
  insert into tenants (id) values ('${T}'), ('${T_B}');
  insert into outlets (id, tenant_id, name) values ('${A1}', '${T}', 'Makati'), ('${A2}', '${T}', 'BGC');
  insert into auth.users select unnest(array[${Object.values(U).map((id) => `'${id}'::uuid`).join(',')}]);
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id, display_name) values
    ('${U.owner}',    'admin', '${T}',   true,  '{}',                null,    'Olivia'),
    ('${U.cara}',     'admin', '${T}',   false, '{pos}',             '${A1}', 'Cara'),
    ('${U.cy}',       'admin', '${T}',   false, '{pos}',             '${A1}', 'Cy'),
    ('${U.ana}',      'admin', '${T}',   false, '{pos}',             '${A2}', 'Ana'),
    ('${U.manager}',  'admin', '${T}',   false, '{cash_manage}',     null,    'Mara'),
    ('${U.a2Mgr}',    'admin', '${T}',   false, '{cash_manage}',     '${A2}', 'Bea'),
    ('${U.reporter}', 'admin', '${T}',   false, '{reports}',         null,    'Rita'),
    ('${U.ownerB}',   'admin', '${T_B}', true,  '{}',                null,    'Bo');
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
async function call(db, uid, sql, params) {
  if (uid === 'anon') await asAnon(db)
  else await as(db, 'authenticated', uid)
  return (await db.query(sql, params)).rows
}
const one = async (db, uid, sql, params) => Object.values((await call(db, uid, sql, params))[0])[0]
async function shift(db, uid, outlet, { counts, device, reason = null, remitTo = null }) {
  const id = (await one(db, uid, 'select public.open_shift($1, $2, null, 50000, null, null, null)', [T, outlet])).shift.id
  for (const cents of counts) await one(db, uid, 'select public.count_shift($1, $2, null, $3)', [id, cents, device])
  await one(db, uid, 'select public.close_shift($1, null, $2, null, null, $3, $4, null)', [id, reason, remitTo, remitTo === null])
  return id
}
const n = (v) => (v === null ? null : Number(v))

async function main() {
  const db = await buildCashDb({ through: '20261027200000_report_cash_functions.sql', beforeCashier: (d) => d.exec(PEOPLE) })
  try {
    // Cara: ₱50 short with a reason; Cy: recounted ₱0 → ₱500 (exact); Ana at A2: ₱30 over.
    const cara = await shift(db, U.cara, A1, { counts: [45000], device: 50000, reason: 'wrong_change', remitTo: U.manager })
    const cy = await shift(db, U.cy, A1, { counts: [0, 50000], device: 50000 })
    const ana = await shift(db, U.ana, A2, { counts: [53000], device: 50000, reason: 'customer_left_extra' })
    // A shift nobody counted (force-closed) and one still open.
    const forced = (await one(db, U.cara, 'select public.open_shift($1, $2, null, 0, null, null, null)', [T, A1])).shift.id
    await one(db, U.manager, 'select public.force_close_shift($1, $2)', [forced, 'Went home sick'])
    const open = (await one(db, U.cy, 'select public.open_shift($1, $2, null, 0, null, null, null)', [T, A1])).shift.id
    await one(db, U.manager, 'select * from public.accept_remittance($1, $2, $3)', [
      (await call(db, U.manager, "select id from cash_remittances where shift_id = $1 and kind = 'shift'", [cara]))[0].id, 4000, 'short ₱10'])
    await reset(db)
    const today = (await db.query('select cash.business_day_of($1, now())::text as d', [T])).rows[0].d

    const SUMMARY = 'select * from public.report_cash_summary($1, $2::date, $3::date, $4)'
    const rows = await call(db, U.manager, SUMMARY, [T, today, today, null])
    const by = Object.fromEntries(rows.map((r) => [r.shift_id, r]))
    eq(rows.length, 5, 'one row per shift of the day (open and forced included)')
    eq([n(by[cara].expected_cents), n(by[cara].counted_cents), n(by[cara].difference_cents), by[cara].variance_reason, by[cara].expected_source],
      [50000, 45000, -5000, 'wrong_change', 'device'], 'Cara: ₱50 short, with her reason, against the frozen figure')
    eq([n(by[cara].handed_over_cents), n(by[cara].received_cents), n(by[cara].discrepancy_cents), by[cara].remittance_status, by[cara].received_by_name],
      // ₱450 counted, ₱500 float kept by default (capped at the count) → ₱0 handed over; Mara found ₱40.
      [0, 4000, 4000, 'accepted', 'Mara'], 'her hand-over, what Mara received, and the difference')
    eq([n(by[cy].first_count_cents), n(by[cy].final_count_cents), by[cy].count_attempts, by[cy].recount_changed, n(by[cy].difference_cents)],
      [0, 50000, 2, true, 0], 'Cy: counted ₱0 then ₱500 — the recount that changed the figure is visible')
    eq([by[forced].close_kind, by[forced].counted_cents, by[forced].difference_cents], ['forced', null, null], 'the forced close: no count, no difference')
    eq([by[open].status, by[open].closed_at], ['open', null], 'the open shift is listed')
    eq(n(by[ana].difference_cents), 3000, 'Ana (BGC): ₱30 over')

    const STAFF = 'select * from public.report_cash_by_staff($1, $2::date, $3::date, $4)'
    const staff = Object.fromEntries((await call(db, U.manager, STAFF, [T, today, today, null])).map((r) => [r.staff_name, r]))
    eq([n(staff.Cara.shifts), n(staff.Cara.short_count), n(staff.Cara.over_short_cents), n(staff.Cara.short_cents), n(staff.Cara.forced_closes)],
      [2, 1, -5000, 5000, 1], 'Cara: two closed shifts, one short (₱50), one forced close')
    eq([n(staff.Cy.shifts), n(staff.Cy.recount_changed), n(staff.Cy.over_short_cents)], [1, 1, 0], 'Cy: one closed shift (the open one is not counted), one changed recount')
    eq([n(staff.Ana.over_count), n(staff.Ana.over_cents)], [1, 3000], 'Ana: one over')

    // Access.
    await refused(call(db, U.cara, SUMMARY, [T, today, today, null]), '42501', 'a cashier cannot read cash reports')
    await refused(call(db, U.reporter, SUMMARY, [T, today, today, null]), '42501', '`reports` alone does not open over / short')
    await refused(call(db, U.ownerB, SUMMARY, [T, today, today, null]), '42501', "another store's owner cannot")
    await refused(call(db, 'anon', SUMMARY, [T, today, today, null]), '42501', 'anon cannot')
    eq((await call(db, U.a2Mgr, SUMMARY, [T, today, today, null])).map((r) => r.staff_name), ['Ana'], 'a branch-locked manager reads only their branch, even asking for the whole store (RLS)')
    eq((await call(db, U.a2Mgr, SUMMARY, [T, today, today, A1])).length, 0, 'and nothing when asking for another branch')
    eq((await call(db, U.owner, SUMMARY, [T, today, today, A2])).length, 1, 'p_outlet narrows to one branch')
    await refused(call(db, U.manager, SUMMARY, [T, today, '2030-01-01', null]), '22023', 'more than 93 days is refused')
    await refused(call(db, U.manager, STAFF, [T, '2026-10-20', '2026-10-19', null]), '22023', 'a range that ends before it starts is refused')
    await refused(call(db, U.manager, SUMMARY, [T, today, today, '5a000000-0000-4000-8000-0000000000ee']), '42501', 'an unknown branch is refused')
    console.log(`Cash reports: ${checks} checks passed (per-shift rows incl. first vs final count + remittance, per-cashier totals, cash_manage gate, branch RLS, range rules).`)
  } finally {
    await db.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
