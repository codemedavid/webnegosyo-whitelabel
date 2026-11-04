// Day close (20261027170000 + 170010): status checklist, close refusals
// (open shifts, unsettled hand-overs in 'required' mode, already closed,
// future day), the frozen snapshot (sales = report_period_sales, named-shift
// split adds up, recount visible), clock-in refused on a closed day,
// deposit set once, masked sales without `reports`, reopen owner-only and
// re-close as version 2, branch reach, RLS. Real chain via lib/cash-chain.cjs.
// Concurrency of the shared advisory lock is not exercised (one PGlite
// connection); both paths are shown to take cash.lock_day.
const assert = require('node:assert/strict')
const { as, asAnon, reset } = require('./lib/platform-auth.cjs')
const { buildCashDb, readMigration } = require('./lib/cash-chain.cjs')

const T = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_C = 'cccccccc-0000-4000-8000-000000000001' // Convex store
const A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  cashier: '00000000-0000-4000-8000-000000000002',
  cashier2: '00000000-0000-4000-8000-000000000003',
  manager: '00000000-0000-4000-8000-000000000004',
  reporter: '00000000-0000-4000-8000-000000000005',
  a2Mgr: '00000000-0000-4000-8000-000000000006',
  ownerC: '00000000-0000-4000-8000-000000000007',
}
const PEOPLE = `
  create table public.staff_approval_pins (user_id uuid, tenant_id uuid, pin_hash text, primary key (user_id, tenant_id));
  insert into tenants (id) values ('${T}');
  insert into tenants (id, convex_deployment_url) values ('${T_C}', 'https://otter.convex.cloud');
  insert into outlets (id, tenant_id) values ('${A1}', '${T}'), ('${A2}', '${T}');
  insert into auth.users select unnest(array[${Object.values(U).map((id) => `'${id}'::uuid`).join(',')}]);
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id, display_name) values
    ('${U.owner}',    'admin', '${T}',   true,  '{}',                    null,    'Olivia'),
    ('${U.cashier}',  'admin', '${T}',   false, '{pos}',                 '${A1}', 'Cara'),
    ('${U.cashier2}', 'admin', '${T}',   false, '{pos}',                 '${A1}', 'Cy'),
    ('${U.manager}',  'admin', '${T}',   false, '{cash_manage}',         null,    'Mara'),
    ('${U.reporter}', 'admin', '${T}',   false, '{cash_manage,reports}', null,    'Rita'),
    ('${U.a2Mgr}',    'admin', '${T}',   false, '{cash_manage,pos}',     '${A2}', 'Bea'),
    ('${U.ownerC}',   'admin', '${T_C}', true,  '{}',                    null,    'Cole');
`
// Named shifts: the morning half of the day, and an evening one.
const PERIODS = `insert into service_periods (tenant_id, name, starts_minutes, ends_minutes) values ('${T}', 'Morning', 0, 720), ('${T}', 'Evening', 1080, 1380);`

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
  if (uid === 'anon') await asAnon(db)
  else await as(db, 'authenticated', uid)
  const { rows } = await db.query(sql, params)
  return rows.length === 0 ? undefined : Object.values(rows[0])[0]
}
async function fixture(db, sql, params) {
  await reset(db)
  return (await db.query(sql, params)).rows
}
const STATUS = 'select public.get_day_close_status($1, $2, $3::date)'
const CLOSE = 'select public.close_business_day($1, $2, $3::date, $4, $5)'

async function sale(db, cashier, total, method = 'Cash') {
  await fixture(db, `insert into orders (tenant_id, outlet_id, total, status, payment_status, source, payment_method_name, customer_data)
    values ($1, $2, $3, 'delivered', 'paid', 'pos', $4, $5::jsonb)`, [T, A1, total, method, JSON.stringify({ pos: { cashierId: cashier } })])
}

async function main() {
  const db = await buildCashDb({ through: '20261027170010_day_close_activity_validate.sql', beforeCashier: (d) => d.exec(PEOPLE) })
  try {
    await reset(db)
    await db.exec(PERIODS)
    const today = (await fixture(db, 'select cash.business_day_of($1, now())::text as d', [T]))[0].d

    // A shift with sales, still open.
    const shift = (await val(db, U.cashier, 'select public.open_shift($1, $2, null, 50000, null, null, null)', [T, A1])).shift.id
    await sale(db, U.cashier, 300)
    await sale(db, U.cashier, 120, 'GCash')
    await refused(val(db, U.cashier, STATUS, [T, A1, today]), '42501', 'a cashier cannot see the day-close checklist')
    await refused(val(db, 'anon', STATUS, [T, A1, today]), '42501', 'anon cannot either')
    await refused(val(db, U.a2Mgr, STATUS, [T, A1, today]), '42501', "another branch's manager cannot")
    let status = await val(db, U.manager, STATUS, [T, A1, today])
    eq([status.businessDay, status.openShifts.length, status.openShifts[0].staffName, status.existingClose], [today, 1, 'Cara', null], 'checklist: the open shift, no close yet')
    await refused(val(db, U.manager, CLOSE, [T, A1, today, null, false]), '55000', 'an open shift always blocks the close', /open_shifts: end these shifts first: Cara/)
    await refused(val(db, U.manager, CLOSE, [T, A1, today, 'please', true]), '55000', 'even when forced')

    // Close the shift: count twice (the recount changed the figure), hand over to Mara.
    await val(db, U.cashier, 'select public.count_shift($1, 0, null, null)', [shift])
    await val(db, U.cashier, 'select public.count_shift($1, 80000, null, null)', [shift])
    await val(db, U.cashier, 'select public.close_shift($1, null, null, null, 50000, $2, false, null)', [shift, U.manager])
    // A pickup earlier would add to cash to account for; here: a separate shift with one.
    const shift2 = (await val(db, U.cashier2, 'select public.open_shift($1, $2, null, 10000, null, null, null)', [T, A1])).shift.id
    await sale(db, U.cashier2, 1000)
    await val(db, U.manager, 'select public.record_cash_pickup($1, 60000, null, false, null)', [shift2])
    await val(db, U.cashier2, 'select public.count_shift($1, 50000, null, null)', [shift2])
    await val(db, U.cashier2, 'select public.close_shift($1, null, null, null, 10000, null, true, null)', [shift2])

    // A counter sale after Cy clocked out, its branch only in customer_data
    // (older registers): a late sale AT THIS BRANCH (QA MEDIUM 6).
    await fixture(db, `insert into orders (tenant_id, outlet_id, total, status, payment_status, source, payment_method_name, customer_data)
      values ($1, null, 75, 'delivered', 'paid', 'pos', 'Cash', $2::jsonb)`, [T, JSON.stringify({ outlet_id: A1, pos: { cashierId: U.cashier2 } })])
    status = await val(db, U.manager, STATUS, [T, A1, today])
    eq(status.preview.lateSales, { count: 1, cashCents: 7500 }, 'a sale after its cashier clocked out is a late sale, branch read from the column or customer_data')
    eq([status.openShifts.length, status.pendingRemittances.map((r) => r.cashierName).sort()], [0, ['Cara', 'Cy']], 'checklist: no open shift, two hand-overs to accept')
    eq(status.nonCashUnchecked.map((n) => [n.staffName, n.method]), [['Cara', 'GCash']], 'checklist: GCash was never checked against the slips')

    // 'required' mode: unsettled hand-overs block unless forced with a note.
    await fixture(db, "insert into tenant_cash_settings (tenant_id, remittance_mode) values ($1, 'required')", [T])
    await refused(val(db, U.manager, CLOSE, [T, A1, today, null, false]), '55000', "'required': unsettled hand-overs block the close", /unsettled_remittances/)
    await fixture(db, "update tenant_cash_settings set remittance_mode = 'optional' where tenant_id = $1", [T])
    await refused(val(db, U.manager, CLOSE, [T, A1, today, null, false]), '22023', 'a day that has not ended yet closes only early-with-a-note', /day_not_over/)
    await fixture(db, "update tenant_cash_settings set remittance_mode = 'required' where tenant_id = $1", [T])
    await refused(val(db, U.manager, CLOSE, [T, A1, today, null, true]), '22023', 'closing anyway needs a note', /note_required/)
    await refused(val(db, U.cashier, CLOSE, [T, A1, today, 'x', true]), '42501', 'a cashier cannot close the day')
    const closed = await val(db, U.manager, CLOSE, [T, A1, today, 'Mara counts tomorrow', true])
    eq(closed.version, 1, 'closed anyway (version 1)')
    const snap = closed.snapshot

    // The snapshot's sales are the one sales definition.
    const period = await val(db, U.reporter, 'select public.report_period_sales($1, $2::timestamptz, $3::timestamptz, $4)', [T, snap.window.start, snap.window.end, A1])
    eq([snap.sales.netCents, snap.sales.orders, snap.sales.collectedByMethod.reduce((s, m) => s + m.cents, 0)],
      [period.summary.netCents, period.summary.orders, period.summary.collectedCents], 'sales = report_period_sales over the same window, to the centavo')
    eq(snap.byServicePeriod.map((p) => p.name), ['Morning', 'Evening'], 'named shifts in start order')
    eq(snap.byServicePeriod.reduce((s, p) => s + p.netCents, 0) + snap.otherHoursNetCents, snap.sales.netCents, 'Morning + Evening + other hours = net')
    eq(snap.drawers.shifts.map((s) => [s.staff, s.countedCents, s.expectedCents]), [['Cara', 80000, 80000], ['Cy', 50000, 50000]], 'drawers from the frozen expectations')
    eq(snap.drawers.totals.collectedMidShiftCents, 60000, 'the pickup is counted as collected mid-shift')
    eq(snap.cashToAccountForCents, 30000 + 40000 + 60000, 'cash to account for = hand-overs (Cara ₱300, Cy ₱400) + the ₱600 pickup')
    eq(snap.recountChanged, [{ shiftId: shift, staffName: 'Cara', firstCents: 0, finalCents: 80000 }], 'a recount that changed the figure stays visible')
    const row = await fixture(db, 'select sales_source, unsettled_remittance_ids, note from business_day_closes where id = $1', [closed.id])
    eq([row[0].sales_source, row[0].unsettled_remittance_ids.length, row[0].note], ['platform_sql', 2, 'Mara counts tomorrow'], 'the unsettled hand-overs are recorded on the close')
    await refused(val(db, U.manager, CLOSE, [T, A1, today, 'again', true]), '23505', 'one live close per day', /already_closed/)

    // No clock-in into a closed day; orders are never blocked.
    await refused(val(db, U.cashier2, 'select public.open_shift($1, $2, null, 0, null, null, null)', [T, A1]), '55000', 'clock-in on a closed day is refused', /day_closed/)
    await as(db, 'authenticated', U.cashier2)
    await refused(db.query("insert into staff_shifts (tenant_id, outlet_id, staff_user_id, staff_name, opening_float) values ($1, $2, $3, 'Cy', 0)", [T, A1, U.cashier2]), '55000', 'by an old build too')
    await sale(db, U.cashier, 50)
    checks += 1 // a sale after the close went in (no error above)
    eq((await val(db, U.a2Mgr, 'select public.open_shift($1, $2, null, 0, null, null, null)', [T, A2])).state, 'opened', 'another branch is not closed')

    // Reads.
    await as(db, 'authenticated', U.a2Mgr)
    eq(Number((await db.query('select count(*) from business_day_closes')).rows[0].count), 0, "another branch's manager reads none of A1's closes")
    await as(db, 'authenticated', U.cashier)
    eq(Number((await db.query('select count(*) from business_day_closes')).rows[0].count), 0, 'a cashier reads none')
    const shown = await val(db, U.manager, 'select public.get_business_day_close($1)', [closed.id])
    eq([shown.snapshot.sales.netCents, shown.snapshot.salesMasked, shown.snapshot.drawers.shifts.length], [snap.sales.netCents, undefined, 2],
      'a cash manager sees the day\'s sales on the close (as on report_shift_sales), without `reports`')
    eq(shown.snapshot, closed.snapshot, 'the close reply and get_business_day_close show the same snapshot')

    // Deposit: set once.
    await refused(val(db, U.cashier, 'select public.record_day_deposit($1, 100, $2, null, null)', [closed.id, 'BDO']), '42501', 'a cashier cannot record the deposit')
    await refused(val(db, U.manager, 'select public.record_day_deposit($1, 100, $2, null, $3)', [closed.id, 'BDO', 'javascript:alert(1)']), '22023', 'a proof must be an https link')
    const dep = await val(db, U.manager, 'select public.record_day_deposit($1, 130000, $2, $3, $4)', [closed.id, 'BDO savings', 'DS-001', 'https://ik.imagekit.io/x/slip.jpg'])
    eq([dep.depositCents, dep.depositTo, dep.depositRef], [130000, 'BDO savings', 'DS-001'], 'deposit recorded')
    await refused(val(db, U.manager, 'select public.record_day_deposit($1, 1, $2, null, null)', [closed.id, 'Safe']), 'P0002', 'the deposit is set once', /deposit_already_recorded/)

    // Reopen: owner only, reason required; then a re-close is version 2.
    await refused(val(db, U.manager, 'select public.reopen_business_day($1, $2)', [closed.id, 'oops']), '42501', 'only the owner reopens a day')
    await refused(val(db, U.owner, 'select public.reopen_business_day($1, $2)', [closed.id, ' ']), '22023', 'reopening needs a reason')
    eq((await val(db, U.owner, 'select public.reopen_business_day($1, $2)', [closed.id, 'Late GCash refund'])).status, 'reopened', 'the owner reopens it')
    await refused(val(db, U.owner, 'select public.reopen_business_day($1, $2)', [closed.id, 'again']), 'P0002', 'reopening twice: P0002')
    const reopenedFlags = await fixture(db, "select flags from store_activity where kind = 'day.reopened' and subject_ref = $1", [closed.id])
    eq(reopenedFlags[0].flags, ['day_reopened'], 'a reopen is flagged in activity')
    eq((await val(db, U.cashier2, 'select public.open_shift($1, $2, null, 0, null, null, null)', [T, A1])).state, 'opened', 'a reopened day accepts a clock-in again')
    await refused(val(db, U.manager, CLOSE, [T, A1, today, 'x', true]), '55000', 'which then blocks the re-close until it ends', /open_shifts/)
    const s3 = (await fixture(db, "select id from staff_shifts where staff_user_id = $1 and status = 'open'", [U.cashier2]))[0].id
    await val(db, U.cashier2, 'select public.count_shift($1, 0, null, null)', [s3])
    await val(db, U.cashier2, 'select public.close_shift($1, null, null, null, 0, null, true, null)', [s3])
    eq((await val(db, U.manager, CLOSE, [T, A1, today, 'Re-closed', true])).version, 2, 're-close writes version 2 (version 1 kept)')
    eq(Number((await fixture(db, 'select count(*) from business_day_closes where business_day = $1::date and outlet_id = $2', [today, A1]))[0].count), 2, 'both versions are kept')

    // A day that is over closes without forcing.
    const yesterday = (await fixture(db, "select (cash.business_day_of($1, now()) - 1)::text as d", [T]))[0].d
    eq((await val(db, U.manager, CLOSE, [T, A1, yesterday, null, false])).version, 1, 'a finished day closes without "close anyway"')
    await refused(val(db, U.manager, CLOSE, [T, null, yesterday, null, false]), '23505', 'a branch closed it: the whole store cannot close it too (cash counted twice)', /a branch already closed/)

    // Day rules and stores.
    await refused(val(db, U.manager, CLOSE, [T, A1, '2099-01-01', null, false]), '22023', 'a future day cannot be closed')
    await refused(val(db, U.a2Mgr, CLOSE, [T, A1, today, null, false]), '42501', "a branch-locked manager cannot close another branch")
    await refused(val(db, U.a2Mgr, CLOSE, [T, null, today, null, false]), '42501', 'nor the whole store')
    await fixture(db, "update tenant_cash_settings set remittance_mode = 'optional' where tenant_id = $1", [T])
    const convexDay = (await fixture(db, 'select cash.business_day_of($1, now())::text as d', [T_C]))[0].d
    const c = await val(db, U.ownerC, CLOSE, [T_C, null, convexDay, 'Closing early', true])
    eq(c.snapshot.sales, null, 'a Convex store: no sales section (drawers only)')
    eq((await fixture(db, 'select sales_source from business_day_closes where id = $1', [c.id]))[0].sales_source, 'drawers_only', 'labelled drawers_only')

    // Both paths take the shared day lock (cash.lock_day).
    const src = readMigration('20261027170000_business_day_closes.sql')
    eq([/perform cash\.lock_day\(p_tenant, null, p_day\);\s*if p_outlet is not null then\s*perform cash\.lock_day\(p_tenant, p_outlet, p_day\)/.test(src), /perform cash\.lock_day\(new\.tenant_id, null, new\.business_day\)/.test(src)], [true, true], 'close_business_day and clock-in take the same advisory lock')
    console.log(`Day close: ${checks} checks passed (checklist, refusals, snapshot = report_period_sales + named-shift split + recount, closed-day clock-in, deposit once, masking, reopen + version 2, branch reach, Convex).`)
  } finally {
    await db.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
