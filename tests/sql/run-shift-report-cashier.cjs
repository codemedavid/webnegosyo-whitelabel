// Shift report per cashier (20261104140000), pinned in PGlite as the role that
// really calls. Real chain via lib/cash-chain.cjs through 20261027200000
// (shift sales, expectations, counts, close, remittances), then:
//   * BEFORE the migration: report_shift_sales(id) answers for every shift and
//     every role that may ask, plus report_payments / report_sales_by_item;
//     AFTER: the window scope (old one-argument call and {p_scope:'window'})
//     answers EXACTLY the same, and so do the two Reports functions;
//   * cashier scope: her POS sales only — another cashier's sale, an online
//     order she confirmed, a POS sale with no cashier, another branch's and an
//     out-of-window sale are out; a cancelled one is a VOID (listed, not
//     sold); an edited order uses its current lines; discounts are scaled;
//     Σ items = net; Σ PAID BY = collected; items sorted by quantity; the
//     money she recorded on a colleague's bill is `otherCollections`;
//   * the cash block: closed = frozen expected / counted / difference; open =
//     the live server figure; blind + open + uncounted = hidden (no pesos
//     anywhere), counted = shown;
//   * roles: holder ok (cashier scope); holder window → 42501 unless she holds
//     `reports`; another cashier 42501; cash manager both; branch-locked
//     manager elsewhere 42501; anon 42501; bad scope 22023; unknown P0002;
//   * items ≤ 500 with itemsTruncated; report_shift_nets; Convex unavailable.
// SHIFT_REPORT_DUMP=<file>: also write real answers there (app parser fixture).
const assert = require('node:assert/strict')
const { as, asAnon, reset } = require('./lib/platform-auth.cjs')
const { buildCashDb, readMigration } = require('./lib/cash-chain.cjs')

const MIGRATION = '20261104140000_shift_report_cashier_scope.sql'
const T = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_C = 'cccccccc-0000-4000-8000-000000000001' // a Convex store
const A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  cashier: '00000000-0000-4000-8000-000000000002',
  cashier2: '00000000-0000-4000-8000-000000000003',
  manager: '00000000-0000-4000-8000-000000000004',
  branchMgr: '00000000-0000-4000-8000-000000000005',
  lead: '00000000-0000-4000-8000-000000000006', // pos + reports
  ownerC: '00000000-0000-4000-8000-000000000008',
}
const S = {
  closed: '5a000000-0000-4000-8000-000000000001', // cashier, A1, closed 2026-10-20 10:00–20:00 Manila
  colleague: '5a000000-0000-4000-8000-000000000002', // cashier2, A1, same window, closed
  open: '5a000000-0000-4000-8000-000000000003', // cashier, A1, open 3 h
  blind: '5a000000-0000-4000-8000-000000000004', // cashier2, A1, open, blind
  lead: '5a000000-0000-4000-8000-000000000005', // lead, A1, open
  busy: '5a000000-0000-4000-8000-000000000006', // cashier, A1, closed 2026-09-01, 505 dishes
  convex: '5a000000-0000-4000-8000-000000000007',
}
const MENU = { adobo: '88888888-0000-4000-8000-000000000001', rice: '88888888-0000-4000-8000-000000000002' }
const FROM = '2026-10-20T10:00:00+08:00'
const TO = '2026-10-20T20:00:00+08:00'
const IN = (minutes) => `('${FROM}'::timestamptz + interval '${minutes} minutes')`
const O = (n) => `0a000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const pos = (cashier, extra = {}) => ({ pos: { cashierId: cashier, ...extra } })

const PEOPLE = `
  insert into tenants (id) values ('${T}');
  insert into tenants (id, convex_deployment_url) values ('${T_C}', 'https://happy-otter-1.convex.cloud');
  insert into outlets (id, tenant_id) values ('${A1}', '${T}'), ('${A2}', '${T}');
  insert into auth.users select unnest(array[${Object.values(U).map((id) => `'${id}'::uuid`).join(',')}]);
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id, display_name) values
    ('${U.owner}',     'admin', '${T}',   true,  '{}',                 null,    'Olivia'),
    ('${U.cashier}',   'admin', '${T}',   false, '{pos}',              '${A1}', 'Loly Cashier'),
    ('${U.cashier2}',  'admin', '${T}',   false, '{pos}',              '${A1}', 'Cy'),
    ('${U.manager}',   'admin', '${T}',   false, '{cash_manage,pos}',  null,    'Mara'),
    ('${U.branchMgr}', 'admin', '${T}',   false, '{cash_manage}',      '${A2}', 'Bran'),
    ('${U.lead}',      'admin', '${T}',   false, '{pos,reports}',      '${A1}', 'Lea'),
    ('${U.ownerC}',    'admin', '${T_C}', true,  '{}',                 null,    'Cole');
  insert into categories values ('99999999-0000-4000-8000-000000000001', '${T}', 'Mains');
  insert into menu_items values ('${MENU.adobo}', '${T}', '99999999-0000-4000-8000-000000000001'), ('${MENU.rice}', '${T}', null);
`

// [id, outlet, at, total, status, payment_status, source, customer_data, discount, method, daily]
const ORDERS = [
  [O(1), A1, IN(5), 350, 'delivered', 'paid', 'pos', pos(U.cashier), null, 'Cash', 1],
  [O(2), A1, IN(30), 520.5, 'delivered', 'paid', 'pos', pos(U.cashier), { total: 50, type: 'voucher' }, 'GCash', 2],
  [O(3), A1, IN(60), 210, 'cancelled', 'pending', 'pos', pos(U.cashier), null, 'Cash', 3],
  [O(4), A1, IN(70), 999, 'delivered', 'pending', 'pos', pos(U.cashier2), null, 'Cash', 4], // a colleague's sale
  [O(5), A1, IN(80), 444, 'delivered', 'paid', 'web', pos(U.cashier), null, 'GCash', 5], // online, she confirmed it
  [O(6), A1, IN(90), 123, 'delivered', 'paid', 'pos', { pos: {} }, null, 'Cash', 6], // no cashier on it
  [O(7), A1, IN(120), 300, 'delivered', 'paid', 'pos', pos(U.cashier), null, 'Cash', 7], // edited down from 350
  [O(8), A2, IN(130), 777, 'delivered', 'paid', 'pos', pos(U.cashier), null, 'Cash', 8], // another branch
  [O(9), A1, IN(601), 888, 'delivered', 'paid', 'pos', pos(U.cashier), null, 'Cash', 9], // after her shift
  [O(10), A1, IN(-5), 666, 'delivered', 'paid', 'pos', pos(U.cashier), null, 'Cash', 10], // before it
  // Open shifts (opened 3 h ago).
  [O(20), A1, "now() - interval '1 hour'", 180, 'delivered', 'paid', 'pos', pos(U.cashier), null, 'Cash', 20],
  [O(21), A1, "now() - interval '50 minutes'", 95.5, 'preparing', 'pending', 'pos', pos(U.cashier2), null, 'Cash', 21],
  [O(22), A1, "now() - interval '40 minutes'", 75, 'delivered', 'paid', 'pos', pos(U.lead), null, 'Cash', 22],
]
const q = (v) => (v === null ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const ORDER_SQL = `insert into orders (id, tenant_id, outlet_id, created_at, total, status, payment_status, source, customer_data, discount_data, payment_method_name, daily_number) values ${ORDERS.map(
  ([id, outlet, at, total, status, pay, source, data, discount, method, daily]) =>
    `('${id}', '${T}', ${q(outlet)}, ${at}, ${total}, ${q(status)}, ${q(pay)}, ${q(source)}, ${q(JSON.stringify(data))}::jsonb, ${discount ? `${q(JSON.stringify(discount))}::jsonb` : 'null'}, ${q(method)}, ${daily})`,
).join(',\n')};`

const LINES = `
  insert into order_items (order_id, menu_item_id, menu_item_name, category_name, quantity, subtotal) values
    ('${O(1)}', '${MENU.adobo}', 'Adobo', 'Mains', 2, 300), ('${O(1)}', '${MENU.rice}', 'Rice', null, 2, 50),
    ('${O(2)}', '${MENU.adobo}', 'Adobo', null, 3, 450), ('${O(2)}', null, 'Iced tea', 'Drinks', 1, 100.5),
    ('${O(3)}', '${MENU.rice}', 'Rice', null, 1, 210),
    ('${O(4)}', '${MENU.adobo}', 'Adobo', 'Mains', 6, 999),
    ('${O(5)}', null, 'Pancit', 'Mains', 1, 444),
    ('${O(6)}', null, 'Kape', 'Drinks', 1, 123),
    ('${O(7)}', null, 'Halo-halo', 'Desserts', 2, 300),
    ('${O(8)}', null, 'Lumpia', 'Mains', 1, 777),
    ('${O(20)}', '${MENU.adobo}', 'Adobo', 'Mains', 1, 180),
    ('${O(21)}', null, 'Kape', 'Drinks', 1, 95.5),
    ('${O(22)}', null, 'Kape', 'Drinks', 1, 75);
  -- O(2) paid GCash in two parts; O(7) charged 350 before an edit, 50 change handed back;
  -- she collected the colleague's O(4) (recorded_by = her) inside her window.
  insert into order_payments (tenant_id, order_id, kind, amount, payment_method_name, recorded_by, created_at) values
    ('${T}', '${O(2)}', 'charge', 300, 'GCash', '${U.cashier}', ${IN(31)}),
    ('${T}', '${O(2)}', 'charge', 220.5, 'GCash', '${U.cashier}', ${IN(32)}),
    ('${T}', '${O(7)}', 'charge', 350, 'Cash', '${U.cashier}', ${IN(121)}),
    ('${T}', '${O(7)}', 'refund', 50, 'Cash', '${U.cashier}', ${IN(125)}),
    ('${T}', '${O(4)}', 'charge', 999, 'Cash', '${U.cashier}', ${IN(200)});
`

const SHIFTS = `
  insert into staff_shifts (id, tenant_id, outlet_id, staff_user_id, staff_name, drawer_name, opening_float, opened_at) values
    ('${S.closed}',    '${T}', '${A1}', '${U.cashier}',  'Loly Cashier', 'Cashier 1', 500, '${FROM}'),
    ('${S.colleague}', '${T}', '${A1}', '${U.cashier2}', 'Cy',           'Cashier 2', 0,   '${FROM}');
  update staff_shifts set status = 'closed', closed_at = '${TO}', expected_cash = 1650, closing_count = 1600 where id = '${S.closed}';
  update staff_shifts set status = 'closed', closed_at = '${TO}', expected_cash = 0, closing_count = 0 where id = '${S.colleague}';
  insert into staff_shifts (id, tenant_id, outlet_id, staff_user_id, staff_name, opening_float, opened_at) values
    ('${S.busy}', '${T}', '${A1}', '${U.cashier}', 'Loly Cashier', 0, '2026-09-01T09:00:00+08:00');
  update staff_shifts set status = 'closed', closed_at = '2026-09-01T20:00:00+08:00', expected_cash = 0, closing_count = 0 where id = '${S.busy}';
  insert into staff_shifts (id, tenant_id, outlet_id, staff_user_id, staff_name, drawer_name, opening_float, opened_at) values
    ('${S.open}',      '${T}', '${A1}', '${U.cashier}',  'Loly Cashier', 'Cashier 1', 500, now() - interval '3 hours'),
    ('${S.lead}',      '${T}', '${A1}', '${U.lead}',     'Lea',          null,        0,   now() - interval '3 hours');
  insert into shift_cash_movements (tenant_id, shift_id, kind, amount, reason, recorded_by_name) values
    ('${T}', '${S.open}', 'pay_in', 100, 'More change', 'Loly Cashier'),
    ('${T}', '${S.open}', 'pay_out', 40, 'Ice', 'Loly Cashier');
  insert into tenant_cash_settings (tenant_id, blind_close) values ('${T}', true);
  insert into staff_shifts (id, tenant_id, outlet_id, staff_user_id, staff_name, opening_float, opened_at) values
    ('${S.blind}', '${T}', '${A1}', '${U.cashier2}', 'Cy', 500, now() - interval '3 hours');
  update tenant_cash_settings set blind_close = false where tenant_id = '${T}';
  insert into staff_shifts (id, tenant_id, outlet_id, staff_user_id, staff_name, opening_float, opened_at) values
    ('${S.convex}', '${T_C}', null, '${U.ownerC}', 'Cole', 0, now() - interval '1 hour');
`

let checks = 0
const dumped = {}
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
async function asUser(db, uid) {
  if (uid === 'anon') return asAnon(db)
  return as(db, 'authenticated', uid)
}
const oldCall = async (db, uid, id) => { await asUser(db, uid); return scalar(db, 'select public.report_shift_sales($1)', [id]) }
const scoped = async (db, uid, id, scope) => { await asUser(db, uid); return scalar(db, 'select public.report_shift_sales($1, $2)', [id, scope]) }
const nets = async (db, uid, ids) => { await asUser(db, uid); return scalar(db, 'select public.report_shift_nets($1::uuid[])', [ids]) }

/** Answers that must not move: [label, uid, shift]. */
const WINDOW_CALLS = [
  ['closed shift, manager', U.manager, S.closed],
  ['closed shift, owner', U.owner, S.closed],
  ['colleague shift, manager', U.manager, S.colleague],
  ['blind shift, manager', U.manager, S.blind],
  ['lead (reports) own shift', U.lead, S.lead],
  ['busy shift, owner', U.owner, S.busy],
  ['convex store, owner', U.ownerC, S.convex],
]
// Volatile: an open shift's window ends at now().
const stable = (report) => (report && report.window ? { ...report, window: { from: report.window.from } } : report)

async function reportsAnswers(db) {
  await as(db, 'authenticated', U.owner)
  const args = [T, '2026-10-19T00:00:00+08:00', '2026-10-28T00:00:00+08:00']
  const payments = (await db.query('select * from public.report_payments($1, $2::timestamptz, $3::timestamptz) order by method_key', args)).rows
  const items = (await db.query('select * from public.report_sales_by_item($1, $2::timestamptz, $3::timestamptz) order by item_key', args)).rows
  await reset(db)
  return { payments, items }
}

async function captureBefore(db) {
  const answers = []
  for (const [label, uid, id] of WINDOW_CALLS) answers.push([label, stable(await oldCall(db, uid, id))])
  // The plain cashier's answer before the owner decision (her shift's whole branch).
  const cashierBefore = await oldCall(db, U.cashier, S.closed)
  await reset(db)
  return { answers, reports: await reportsAnswers(db), cashierBefore }
}

async function checkWindowUnchanged(db, before) {
  for (const [index, [label, uid, id]] of WINDOW_CALLS.entries()) {
    eq(stable(await oldCall(db, uid, id)), before.answers[index][1], `window, one-argument call, unchanged: ${label}`)
    eq(stable(await scoped(db, uid, id, 'window')), before.answers[index][1], `window, p_scope 'window', unchanged: ${label}`)
  }
  await reset(db)
  const after = await reportsAnswers(db)
  eq(after.payments, before.reports.payments, 'report_payments answers exactly as before (payment_buckets_of with p_only null)')
  eq(after.items, before.reports.items, 'report_sales_by_item answers exactly as before (item_rollup_of with p_only null)')
  eq(before.reports.payments.length > 1 && before.reports.items.length > 1, true, 'the regression window is not empty')
  eq(before.cashierBefore.receipts.length > 3, true, 'before: a plain cashier read her whole branch (the gap being closed)')
}

async function checkCashierScope(db) {
  const report = await scoped(db, U.cashier, S.closed, 'cashier')
  dumped.cashier = report
  eq([report.source, report.scope, report.hidden], ['server', 'cashier', false], 'the holder reads her own sales')
  eq(report.shift.staffName, 'Loly Cashier', 'with the shift header')
  eq(report.receipts.map((r) => r.orderId), [O(7), O(3), O(2), O(1)],
    "only her POS sales in her window at her branch, newest first (colleague's, online, no-cashier, other branch, outside the window: out)")
  eq(report.summary.orders, 3, 'three sales (the cancelled one is a void)')
  // O1 350 + O2 520.50 (gross 570.50 − 50 voucher) + O7 300 (its current total) = 1,170.50.
  eq([report.summary.grossCents, report.summary.discountCents, report.summary.netCents], [122050, 5000, 117050], 'gross, discounts, net in centavos')
  eq([report.summary.voidCount, report.summary.voidCents], [1, 21000], 'the cancelled sale is a void')
  eq(report.voids, [{ orderId: O(3), number: '#03', placedAt: '2026-10-20T03:00:00.000Z', totalCents: 21000, status: 'void' }], 'the voids list: number, time, amount')
  eq(report.voidsTruncated, false, 'every void listed')
  eq(report.items.map((i) => [i.label, i.quantity]), [['Adobo', 5], ['Halo-halo', 2], ['Rice', 2], ['Iced tea', 1]],
    'every item she sold, most sold first, then by sales (the cancelled Rice and the colleague\'s Adobo are not hers)')
  eq(report.items.reduce((sum, i) => sum + i.netCents, 0), report.summary.netCents, 'Σ items = net, to the centavo (discount scaled across lines)')
  eq(report.items.find((i) => i.label === 'Halo-halo').netCents, 30000, 'the edited order counts its current lines at its current total')
  eq(report.itemsTruncated, false, 'not truncated')
  eq(report.payments.reduce((sum, p) => sum + p.cents, 0), report.summary.collectedCents, 'Σ PAID BY = collected')
  eq(report.payments.map((p) => [p.label, p.cents]).sort(), [['Cash', 65000], ['GCash', 52050]], 'PAID BY: her sales, by method (refunded change netted)')
  eq([report.summary.refundCents, report.firstNumber, report.lastNumber], [5000, '#01', '#07'], 'refund reported, receipt range over her sales')
  eq(report.otherCollections, { count: 1, cents: 99900 }, "the ₱999 she collected on a colleague's bill is reported apart")
  eq(report.channels.map((c) => c.key), ['counter'], 'counter sales only')
  eq(report.cash, {
    floatCents: 50000, cashSalesCents: 115000, payInCents: 0, payOutCents: 0, collectedCents: 0,
    expectedCents: 165000, expectedSource: 'device', countedCents: 160000, differenceCents: -5000,
  }, 'cash block: float, cash sales (expected − float), expected frozen at close, counted, short ₱50')

  eq(await scoped(db, U.manager, S.closed, 'cashier'), report, 'a cash manager reads the same cashier report')
  eq(await scoped(db, U.owner, S.closed, 'cashier'), report, 'so does the owner')
  eq(await scoped(db, U.cashier, S.closed, ' CASHIER '), report, 'the scope is read trimmed, any case')
}

async function checkAccess(db) {
  await refused(oldCall(db, U.cashier, S.closed), '42501', 'owner decision: a plain cashier cannot read the store window of her own shift (old call)')
  await refused(scoped(db, U.cashier, S.closed, 'window'), '42501', "nor with p_scope 'window'")
  await refused(scoped(db, U.cashier2, S.closed, 'cashier'), '42501', "another cashier cannot read a colleague's report")
  await refused(scoped(db, U.cashier2, S.closed, 'window'), '42501', 'nor its window')
  await refused(scoped(db, U.branchMgr, S.closed, 'cashier'), '42501', "a branch-locked cash manager cannot read another branch's shift")
  await refused(scoped(db, U.lead, S.closed, 'cashier'), '42501', '`reports` alone does not open someone else\'s shift')
  eq((await scoped(db, U.lead, S.lead, 'window')).source, 'server', 'a holder who also holds reports may read her shift\'s window')
  eq((await scoped(db, U.lead, S.lead, 'cashier')).receipts.map((r) => r.orderId), [O(22)], 'and her own sales')
  await refused(scoped(db, 'anon', S.closed, 'cashier'), '42501', 'anon is refused')
  await refused(scoped(db, U.cashier, S.closed, 'everything'), '22023', 'an unknown scope is refused')
  await refused(scoped(db, U.cashier, '5a000000-0000-4000-8000-0000000000ff', 'cashier'), 'P0002', 'an unknown shift is P0002')
  await asUser(db, U.cashier)
  await refused(db.query("select cash.cashier_sales(s, now()) from staff_shifts s limit 1"), '42501', 'cash.cashier_sales is internal')
  await refused(db.query('select cash.cashier_cash(s) from staff_shifts s limit 1'), '42501', 'cash.cashier_cash is internal')
  await refused(db.query("select cash.cashier_order_ids(s, now()) from staff_shifts s limit 1"), '42501', 'cash.cashier_order_ids is internal')
  await reset(db)
}

async function checkOpenAndBlind(db) {
  const open = await scoped(db, U.cashier, S.open, 'cashier')
  eq([open.hidden, open.shift.closedAt, open.receipts.map((r) => r.orderId)], [false, null, [O(20)]], 'a running shift, live: her sales so far')
  eq([open.cash.floatCents, open.cash.payInCents, open.cash.payOutCents, open.cash.expectedCents, open.cash.cashSalesCents, open.cash.countedCents, open.cash.differenceCents],
    [50000, 10000, 4000, 74000, 18000, null, null], 'open, not blind: the server\'s live expected (₱500 + ₱180 + ₱100 − ₱40), nothing counted yet')

  const hidden = await scoped(db, U.cashier2, S.blind, 'cashier')
  dumped.hidden = hidden
  eq(hidden.hidden, true, 'blind + open + uncounted: hidden')
  eq([hidden.summary, hidden.payments, hidden.items, hidden.cash, hidden.otherCollections, hidden.itemsTruncated], [null, null, null, null, null, false], 'no money section at all')
  eq(hidden.receipts.map((r) => [r.orderId, r.totalCents]), [[O(21), null]], 'her receipt list stays, totals null')
  eq((await scoped(db, U.manager, S.blind, 'cashier')).hidden, false, 'a cash manager sees it')
  await asUser(db, U.cashier2)
  await db.query('select public.count_shift($1, $2, null, null)', [S.blind, 50000])
  const counted = await scoped(db, U.cashier2, S.blind, 'cashier')
  eq([counted.hidden, counted.cash.countedCents, counted.cash.expectedCents, counted.cash.differenceCents], [false, 50000, 59550, -9550],
    'once counted, her report opens: counted ₱500 against the ₱595.50 she was judged on (float + her unpaid ₱95.50 sale, the drawer rule)')
  eq((await scoped(db, U.manager, S.blind, 'window')).hidden, false, 'window scope for a manager unchanged')
  await reset(db)
}

async function checkTruncation(db) {
  await reset(db)
  const id = O(90)
  await db.query(`insert into orders (id, tenant_id, outlet_id, created_at, total, status, payment_status, source, customer_data, payment_method_name, daily_number)
    values ($1, $2, $3, '2026-09-01T10:00:00+08:00', 5050, 'delivered', 'paid', 'pos', $4::jsonb, 'Cash', 1)`, [id, T, A1, JSON.stringify(pos(U.cashier))])
  await db.query(`insert into order_items (order_id, menu_item_name, quantity, subtotal)
    select $1, 'Dish ' || lpad(g::text, 3, '0'), case when g <= 5 then 3 else 1 end, 10 from generate_series(1, 505) g`, [id])
  const busy = await scoped(db, U.cashier, S.busy, 'cashier')
  eq([busy.items.length, busy.itemsTruncated, busy.summary.orders], [500, true, 1], 'at most 500 items, flagged; totals still whole')
  eq(busy.items.slice(0, 5).every((i) => i.quantity === 3), true, 'the most-sold items are the ones kept')
  dumped.truncated = busy
  await reset(db)
}

async function checkNets(db) {
  const answer = await nets(db, U.cashier, [S.closed, S.open, S.colleague, S.blind, '5a000000-0000-4000-8000-0000000000ff'])
  eq(answer.shifts.map((s) => [s.shiftId, s.status, s.orders, s.netCents]), [
    [S.open, 'ok', 1, 18000],
    [S.closed, 'ok', 3, 117050],
  ], 'My shifts: her own shifts only, newest first, net = the cashier report\'s net')
  const mgr = await nets(db, U.manager, [S.colleague, S.blind])
  eq(mgr.shifts.map((s) => s.status), ['ok', 'ok'], 'a cash manager may ask for anyone\'s')
  eq((await nets(db, U.ownerC, [S.convex])).shifts[0].status, 'unavailable', 'a Convex store: unavailable')
  await refused(nets(db, U.cashier, Array.from({ length: 32 }, () => S.closed)), '22023', 'at most 31 shifts')
  await refused(nets(db, 'anon', [S.closed]), '42501', 'anon is refused')
  eq((await nets(db, U.cashier, [])).shifts, [], 'no shifts, no rows')
  await reset(db)
}

async function checkUnavailable(db) {
  const report = await scoped(db, U.ownerC, S.convex, 'cashier')
  eq([report.source, report.scope, report.shift.id, report.summary], ['unavailable', 'cashier', S.convex, undefined], 'a Convex store: unavailable, never ₱0')
  dumped.unavailable = report
  await reset(db)
}

async function main() {
  const db = await buildCashDb({
    through: '20261027200000_report_cash_functions.sql',
    beforeCashier: (d) => d.exec(PEOPLE),
  })
  try {
    await db.exec(ORDER_SQL)
    await db.exec(LINES)
    await db.exec(SHIFTS)
    const before = await captureBefore(db)
    await db.exec(readMigration(MIGRATION))
    await db.exec(readMigration(MIGRATION))
    await checkWindowUnchanged(db, before)
    await checkCashierScope(db)
    await checkAccess(db)
    await checkOpenAndBlind(db)
    await checkNets(db)
    await checkUnavailable(db)
    await checkTruncation(db)
    if (process.env.SHIFT_REPORT_DUMP) require('node:fs').writeFileSync(process.env.SHIFT_REPORT_DUMP, JSON.stringify(dumped, null, 2))
    console.log(`Shift report per cashier: ${checks} checks passed (window scope + Reports unchanged, her sales only, voids, items = net, cash block, blind, roles, truncation, nets, unavailable).`)
  } finally {
    await db.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
