// Shift sales (20261027121000), pinned in PGlite as the role that really calls.
//
// Loads the live order slice (lib/platform-orders-stub.cjs + the report
// columns, as tests/sql/report-sales-worker.cjs does) and the REAL chain:
// permission keys, discount sync, the four report migrations (110000, 130000,
// 140000, 150000), staff shifts + custody + server clock + drawers, and the
// cashier P0 migrations (120000–120300). It answers report_payments /
// report_sales_by_item BEFORE 121000, applies 121000, and checks:
//   * the two moved bodies answer exactly as before (one sales definition);
//   * report_shift_sales: holder sees own shift; another cashier → 42501;
//     cash manager sees any shift they reach; branch-locked manager cannot
//     read another branch (42501); blind + open + cashier → money hidden;
//     unknown shift → P0002; anon → 42501;
//   * every total equals report_sales_summary / report_payments /
//     report_sales_by_item over the same window, to the centavo;
//   * report_period_sales needs `reports` and branch reach; window rules;
//   * a non-platform store answers source 'unavailable';
//   * receipt numbers, statuses, newest-first truncation, first/last number.
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')
const { STUB_SCHEMA, PRE_0D_POLICIES } = require('./lib/platform-orders-stub.cjs')
// SHIFT_SALES_DUMP=<file>: also write real answers (shown, hidden, unavailable)
// there, so client parsers can be checked against what the RPC really returns.
const dumped = {}

const T_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_C = 'cccccccc-0000-4000-8000-000000000001' // a Convex store
const A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  cashier: '00000000-0000-4000-8000-000000000002',
  cashier2: '00000000-0000-4000-8000-000000000003',
  manager: '00000000-0000-4000-8000-000000000004',
  branchMgr: '00000000-0000-4000-8000-000000000005',
  reporter: '00000000-0000-4000-8000-000000000006',
  a2cashier: '00000000-0000-4000-8000-000000000007',
  ownerC: '00000000-0000-4000-8000-000000000008',
  superadmin: '00000000-0000-4000-8000-000000000009',
}
const S = {
  live: '5a000000-0000-4000-8000-000000000001', // cashier, A1, open (opened 3 h ago)
  closed: '5a000000-0000-4000-8000-000000000002', // cashier2, A1, 2026-10-20 10:00–20:00 Manila
  blind: '5a000000-0000-4000-8000-000000000003', // cashier2, A1, open, blind
  a2: '5a000000-0000-4000-8000-000000000004', // a2cashier, A2, open
  convex: '5a000000-0000-4000-8000-000000000005', // Convex store
}
const CASH_ID = '77777777-0000-4000-8000-000000000001'
const MENU = { adobo: '88888888-0000-4000-8000-000000000001', rice: '88888888-0000-4000-8000-000000000002' }
const CLOSED_FROM = '2026-10-20T10:00:00+08:00'
const CLOSED_TO = '2026-10-20T20:00:00+08:00'

// Columns the report functions read, on top of the RLS stub (as report-sales-worker.cjs).
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
    add column payment_method_name text,
    add column daily_number integer;
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
  create policy order_items_select_by_order on order_items for select using (EXISTS ( SELECT 1
     FROM orders o
    WHERE ((o.id = order_items.order_id) AND (( SELECT app_user_is_superadmin() AS app_user_is_superadmin) OR ((o.tenant_id = ( SELECT app_user_admin_tenant_id() AS app_user_admin_tenant_id)) AND ((( SELECT app_user_admin_outlet_id() AS app_user_admin_outlet_id) IS NULL) OR (o.outlet_id = ( SELECT app_user_admin_outlet_id() AS app_user_admin_outlet_id))))))));
  revoke all on order_items from anon, authenticated;
  grant select on order_items, categories, menu_items to authenticated;

  -- Columns the cashier migrations read (live types).
  alter table tenants add column order_backend text, add column convex_deployment_url text,
    add column timezone text not null default 'Asia/Manila';
  alter table app_users add column display_name text, add column email text;
  alter table outlets add constraint outlets_tenant_fk foreign key (tenant_id) references tenants(id);
  -- Copied from live on 2026-10-27 (pg_get_functiondef).
  CREATE OR REPLACE FUNCTION public.app_user_may_reach_branch(target_tenant_id uuid, target_outlet_id uuid)
   RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp'
  AS $function$
    SELECT EXISTS (
      SELECT 1
        FROM app_users au
       WHERE au.user_id = auth.uid()
         AND au.tenant_id = target_tenant_id
         AND au.role = ANY (ARRAY['admin','superadmin'])
         AND (
           au.outlet_id IS NULL
           OR COALESCE(au.is_owner, false)
           OR au.outlet_id = target_outlet_id
         )
    );
  $function$;
  CREATE OR REPLACE FUNCTION public.app_user_belongs_to_store(p_tenant_id uuid)
   RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp'
  AS $function$
    SELECT EXISTS (
      SELECT 1 FROM public.app_users au
       WHERE au.user_id = auth.uid()
         AND (au.role = 'superadmin' OR (au.role = 'admin' AND au.tenant_id = p_tenant_id))
    );
  $function$;
`

const PEOPLE = `
  insert into tenants (id) values ('${T_A}');
  insert into tenants (id, convex_deployment_url) values ('${T_C}', 'https://happy-otter-1.convex.cloud');
  insert into outlets (id, tenant_id) values ('${A1}', '${T_A}'), ('${A2}', '${T_A}');
  insert into auth.users select unnest(array[${Object.values(U).map((id) => `'${id}'::uuid`).join(',')}]);
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id, display_name) values
    ('${U.owner}',     'admin', '${T_A}', true,  '{}',                      null,   'Olivia'),
    ('${U.cashier}',   'admin', '${T_A}', false, '{pos}',                   '${A1}', 'Cara'),
    ('${U.cashier2}',  'admin', '${T_A}', false, '{pos}',                   '${A1}', 'Cy'),
    ('${U.manager}',   'admin', '${T_A}', false, '{cash_manage}',           null,   'Mara'),
    ('${U.branchMgr}', 'admin', '${T_A}', false, '{cash_manage,reports}',   '${A2}', 'Bran'),
    ('${U.reporter}',  'admin', '${T_A}', false, '{reports}',               null,   'Rita'),
    ('${U.a2cashier}', 'admin', '${T_A}', false, '{pos}',                   '${A2}', 'Ana'),
    ('${U.ownerC}',    'admin', '${T_C}', true,  '{}',                      null,   'Cole'),
    ('${U.superadmin}', 'superadmin', null, false, null,                    null,   'Support');
  insert into categories values ('99999999-0000-4000-8000-000000000001', '${T_A}', 'Mains');
  insert into menu_items values ('${MENU.adobo}', '${T_A}', '99999999-0000-4000-8000-000000000001'), ('${MENU.rice}', '${T_A}', null);
`

// Orders: [id, outlet, at, total, status, payment_status, source, order_type, service, delivery, discount, method, methodId, daily]
const O = (n) => `0a000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const IN = (minutes) => `('${CLOSED_FROM}'::timestamptz + interval '${minutes} minutes')`
const ORDERS = [
  // Inside the closed shift's window at A1.
  [O(1), A1, IN(5), 350, 'delivered', 'paid', 'pos', 'dine_in', 0, 0, null, 'Cash', null, 1],
  [O(2), A1, IN(30), 520.5, 'delivered', 'paid', 'pos', 'takeout', 20, 0, { total: 50, type: 'voucher' }, 'GCash', null, 2],
  [O(3), A1, IN(60), 899.99, 'preparing', 'pending', 'web', 'delivery', 0, 60, { total: 70, deliveryDiscount: 30 }, 'Cash', CASH_ID, 12],
  [O(4), A1, IN(90), 210, 'cancelled', 'pending', 'pos', 'dine_in', 0, 0, null, 'Cash', null, 13],
  [O(5), A1, IN(120), 455, 'refunded', 'paid', 'qr_handoff', 'pickup', 0, 0, null, 'Maya', null, null],
  [O(6), A1, IN(150), 300, 'delivered', 'paid', 'mobile', 'Walk-in', 0, 0, null, ' cash ', null, 14],
  [O(7), A1, IN(599), 125.25, 'delivered', null, 'pos', null, 0, 0, null, null, null, 15],
  // Edges and other places.
  [O(8), A1, IN(600), 999, 'delivered', 'paid', 'pos', 'dine_in', 0, 0, null, 'Cash', null, 16], // = closed_at: outside [from, to)
  [O(9), A1, IN(-1), 999, 'delivered', 'paid', 'pos', 'dine_in', 0, 0, null, 'Cash', null, 17], // before opening
  [O(10), A2, IN(10), 777, 'delivered', 'paid', 'pos', 'dine_in', 0, 0, null, 'Cash', null, 3], // other branch
  [O(11), null, IN(20), 444, 'delivered', 'paid', 'web', 'delivery', 0, 50, null, 'GCash', null, 4], // no branch
  // Inside the live shift's window (opened 3 h ago).
  [O(20), A1, "now() - interval '1 hour'", 180, 'delivered', 'paid', 'pos', 'dine_in', 0, 0, null, 'Cash', null, 1],
  [O(21), A1, "now() - interval '30 minutes'", 95.5, 'preparing', 'pending', 'pos', 'takeout', 0, 0, null, 'Cash', null, 2],
  [O(22), A2, "now() - interval '20 minutes'", 640, 'delivered', 'paid', 'pos', 'dine_in', 0, 0, null, 'GCash', null, 3],
]
function orderSql() {
  const values = ORDERS.map(([id, outlet, at, total, status, pay, source, type, service, delivery, discount, method, methodId, daily]) => {
    const q = (v) => (v === null ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
    return `('${id}', '${T_A}', ${q(outlet)}, ${at}, ${total}, ${q(status)}, ${q(pay)}, ${q(source)}, ${q(type)}, ${service}, ${delivery}, ${discount ? q(JSON.stringify(discount)) + '::jsonb' : 'null'}, ${q(method)}, ${q(methodId)}, ${daily === null ? 'null' : daily})`
  })
  return `insert into orders (id, tenant_id, outlet_id, created_at, total, status, payment_status, source, order_type, service_charge_amount, delivery_fee, discount_data, payment_method_name, payment_method_id, daily_number) values ${values.join(',\n')};`
}
const LINES = `
  insert into order_items (order_id, menu_item_id, menu_item_name, category_name, quantity, subtotal) values
    ('${O(1)}', '${MENU.adobo}', 'Adobo', 'Mains', 2, 300), ('${O(1)}', '${MENU.rice}', 'Rice', null, 2, 50),
    ('${O(2)}', '${MENU.adobo}', 'Adobo', null, 3, 450), ('${O(2)}', null, 'Iced tea', 'Drinks', 1, 100.5),
    ('${O(3)}', '${MENU.adobo}', 'Adobo', 'Mains', 6, 909.99),
    ('${O(4)}', '${MENU.rice}', 'Rice', null, 1, 210),
    ('${O(6)}', null, 'Halo-halo', 'Desserts', 2, 300),
    ('${O(20)}', '${MENU.adobo}', 'Adobo', 'Mains', 1, 180);
  -- O(7) has no lines ("Items not recorded"). Ledger: O(2) paid GCash in two parts,
  -- O(3) part-paid by id (Cash) — still unpaid; O(5) charged then refunded.
  insert into order_payments (tenant_id, order_id, kind, amount, payment_method_name, payment_method_id, created_at) values
    ('${T_A}', '${O(2)}', 'charge', 300, 'GCash', null, ${IN(31)}),
    ('${T_A}', '${O(2)}', 'charge', 220.5, 'gcash', null, ${IN(32)}),
    ('${T_A}', '${O(3)}', 'charge', 400, null, '${CASH_ID}', ${IN(61)}),
    ('${T_A}', '${O(5)}', 'charge', 455, 'Maya', null, ${IN(121)}),
    ('${T_A}', '${O(5)}', 'refund', 455, 'Maya', null, ${IN(125)}),
    ('${T_A}', '${O(1)}', 'charge', 400, 'Cash', null, ${IN(6)}),
    ('${T_A}', '${O(1)}', 'refund', 50, 'Cash', null, ${IN(7)});
`
// Shifts as the fixture owner (explicit clock), then the blind one with the setting on.
const SHIFTS = `
  insert into service_periods (id, tenant_id, name, starts_minutes, ends_minutes) values ('5b000000-0000-4000-8000-000000000001', '${T_A}', 'Day shift', 600, 1200);
  insert into staff_shifts (id, tenant_id, outlet_id, staff_user_id, staff_name, opening_float, opened_at, service_period_id) values
    ('${S.live}',   '${T_A}', '${A1}', '${U.cashier}',   'Cara', 500, now() - interval '3 hours', null),
    ('${S.closed}', '${T_A}', '${A1}', '${U.cashier2}',  'Cy',   500, '${CLOSED_FROM}', '5b000000-0000-4000-8000-000000000001'),
    ('${S.a2}',     '${T_A}', '${A2}', '${U.a2cashier}', 'Ana',  0,   now() - interval '3 hours', null);
  update staff_shifts set status = 'closed', closed_at = '${CLOSED_TO}', expected_cash = 1000, closing_count = 1000 where id = '${S.closed}';
  insert into tenant_cash_settings (tenant_id, blind_close) values ('${T_A}', true);
  insert into staff_shifts (id, tenant_id, outlet_id, staff_user_id, staff_name, opening_float, opened_at) values
    ('${S.blind}', '${T_A}', '${A1}', '${U.cashier2}', 'Cy', 500, now() - interval '3 hours');
  update tenant_cash_settings set blind_close = false where tenant_id = '${T_A}';
  insert into staff_shifts (id, tenant_id, outlet_id, staff_user_id, staff_name, opening_float, opened_at) values
    ('${S.convex}', '${T_C}', null, '${U.ownerC}', 'Cole', 0, now() - interval '1 hour');
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
const num = (v) => (v === null || v === undefined ? v : Number(v))
const shiftSales = (db, id) => scalar(db, 'select public.report_shift_sales($1)', [id])
const periodSales = (db, tenant, from, to, outlet = null) =>
  scalar(db, 'select public.report_period_sales($1, $2::timestamptz, $3::timestamptz, $4)', [tenant, from, to, outlet])

// The Reports answers for a window, read as the owner (reports key + RLS).
async function reportsFor(db, from, to, outlet) {
  await as(db, 'authenticated', U.owner)
  const args = [T_A, from, to, outlet]
  const summary = (await db.query('select * from public.report_sales_summary($1, $2::timestamptz, $3::timestamptz, $4)', args)).rows[0]
  const payments = (await db.query('select * from public.report_payments($1, $2::timestamptz, $3::timestamptz, $4) order by method_key', args)).rows
  const items = (await db.query('select * from public.report_sales_by_item($1, $2::timestamptz, $3::timestamptz, $4) order by item_key', args)).rows
  const count = Number(await scalar(db, 'select count(*) from orders where tenant_id = $1 and created_at >= $2::timestamptz and created_at < $3::timestamptz and ($4::uuid is null or outlet_id = $4)', args))
  await reset(db)
  return { summary, payments, items, count }
}

function expectMatchesReports(report, reports, label) {
  const s = reports.summary
  eq(report.summary, {
    orders: num(s.orders), grossCents: num(s.gross_cents), discountCents: num(s.discount_cents), netCents: num(s.net_cents),
    serviceChargeCents: num(s.service_cents), deliveryCents: num(s.delivery_cents), collectedCents: num(s.collected_cents),
    unpaidCents: num(s.unpaid_cents), overpaidCents: num(s.overpaid_cents), voidCount: num(s.void_orders),
    voidCents: num(s.void_billed_cents), refundCents: num(s.refund_cents),
  }, `${label}: summary = report_sales_summary over the same window, to the centavo`)
  eq([...report.payments].sort((a, b) => a.key.localeCompare(b.key)),
    reports.payments.map((p) => ({ key: p.method_key, label: p.label, cents: num(p.cents), count: num(p.orders) })).sort((a, b) => a.key.localeCompare(b.key)),
    `${label}: payments = report_payments`)
  eq(report.payments.reduce((sum, p) => sum + p.cents, 0), report.summary.collectedCents, `${label}: Σ payments = collected`)
  const items = [...reports.items].sort((a, b) => num(b.net_cents) - num(a.net_cents) || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0)).slice(0, 50)
  eq(report.items, items.map((i) => ({ label: i.label, quantity: num(i.quantity), netCents: num(i.net_cents) })), `${label}: items = report_sales_by_item, net desc`)
  eq(report.items.reduce((sum, i) => sum + i.netCents, 0), report.summary.netCents, `${label}: Σ items = net`)
  eq(report.orderTypes.reduce((sum, t) => sum + t.netCents, 0), report.summary.netCents, `${label}: Σ order types = net`)
  eq(report.channels.reduce((sum, c) => sum + c.netCents, 0), report.summary.netCents, `${label}: Σ channels = net`)
  eq(report.orderTypes.reduce((sum, t) => sum + t.orders, 0), report.summary.orders, `${label}: Σ order-type orders = orders`)
  eq(report.receipts.length, reports.count, `${label}: one receipt per order in the window (voids included)`)
}

async function checkClosedShift(db) {
  const reports = await reportsFor(db, CLOSED_FROM, CLOSED_TO, A1)
  await as(db, 'authenticated', U.cashier2)
  const report = await shiftSales(db, S.closed)
  dumped.shown = report
  eq([report.source, report.hidden], ['server', false], 'the holder reads their own closed shift')
  eq(report.window, { from: '2026-10-20T02:00:00.000Z', to: '2026-10-20T12:00:00.000Z' }, 'window = [opened_at, closed_at)')
  eq(report.shift, {
    id: S.closed, staffName: 'Cy', drawerName: null, openedAt: '2026-10-20T02:00:00.000Z', closedAt: '2026-10-20T12:00:00.000Z',
    businessDay: '2026-10-20', servicePeriodName: 'Day shift',
  }, 'shift header: who, when, business day, named shift')
  expectMatchesReports(report, reports, 'closed shift')
  eq(report.summary.orders, 5, 'five live orders at A1 inside the window (cancel + refund are voids; edges and other branches out)')
  eq(report.summary.voidCount, 2, 'the cancelled and the refunded order are voids')
  eq(report.receipts.map((r) => r.orderId), [O(7), O(6), O(5), O(4), O(3), O(2), O(1)], 'receipts are newest first, at the shift\'s branch, half-open window')
  const byId = Object.fromEntries(report.receipts.map((r) => [r.orderId, r]))
  eq([byId[O(1)].number, byId[O(3)].number, byId[O(5)].number], ['#01', '#12', `#${O(5).slice(0, 8).toUpperCase()}`], 'numbers print like formatDailyOrderNumber (#01, #12, short id)')
  eq([byId[O(1)].status, byId[O(3)].status, byId[O(4)].status, byId[O(5)].status, byId[O(7)].status], ['paid', 'unpaid', 'void', 'refunded', 'paid'], 'receipt statuses')
  eq([byId[O(2)].totalCents, byId[O(3)].totalCents], [52050, 89999], 'receipt totals in centavos')
  eq([byId[O(1)].orderTypeLabel, byId[O(2)].orderTypeLabel, byId[O(3)].orderTypeLabel, byId[O(6)].orderTypeLabel, byId[O(7)].orderTypeLabel], ['Dine In', 'Other', 'Delivery', 'Walk-in', 'Unspecified'], 'order type labels as the dashboard names them')
  eq([byId[O(6)].methodLabel, byId[O(7)].methodLabel], ['cash', 'Not recorded'], 'method label: the stored name trimmed, else Not recorded')
  eq(byId[O(1)].placedAt, '2026-10-20T02:05:00.000Z', 'placedAt is ISO UTC')
  eq([report.firstNumber, report.lastNumber, report.receiptsTruncated], ['#01', '#15', false], 'first and last receipt number of the window')
  eq(report.channels.map((c) => c.key).sort(), ['app', 'counter', 'online'], 'channels: counter / online / app (the refunded QR order is not live)')
  eq(report.channels.find((c) => c.key === 'counter').label, 'Counter (POS)', 'channel labels as the dashboard names them')
  eq(report.orderTypes.find((t) => t.label === 'Delivery').key, 'delivery', 'order type keys')

  await as(db, 'authenticated', U.manager)
  eq(await shiftSales(db, S.closed), report, 'a store-wide cash manager reads the same report')
  await as(db, 'authenticated', U.owner)
  eq(await shiftSales(db, S.closed), report, 'so does the owner')
  await as(db, 'authenticated', U.reporter)
  const { shift: _header, ...withoutHeader } = report
  eq(await periodSales(db, T_A, CLOSED_FROM, CLOSED_TO, A1), withoutHeader,
    'report_period_sales over the same window and branch = the shift report without its header')
}

async function checkLiveShift(db) {
  await as(db, 'authenticated', U.cashier)
  const report = await shiftSales(db, S.live)
  eq([report.source, report.hidden, report.shift.closedAt], ['server', false, null], 'the holder reads their running shift live')
  eq(report.receipts.map((r) => r.orderId), [O(21), O(20)], 'only this branch\'s orders since clock-in')
  eq([report.summary.orders, report.summary.unpaidCents, report.summary.netCents], [2, 9550, 27550], 'live totals')
  const to = report.window.to
  const reports = await reportsFor(db, report.window.from, to, A1)
  await as(db, 'authenticated', U.cashier)
  expectMatchesReports({ ...report, receipts: report.receipts }, reports, 'live shift')

  await as(db, 'authenticated', U.cashier2)
  await refused(shiftSales(db, S.live), '42501', 'another cashier cannot read a colleague\'s shift (42501, not an empty report)')
  await as(db, 'authenticated', U.a2cashier)
  await refused(shiftSales(db, S.live), '42501', 'a cashier at another branch cannot either')
  await as(db, 'authenticated', U.reporter)
  await refused(shiftSales(db, S.live), '42501', '`reports` alone does not open a shift report (use report_period_sales)')
  await as(db, 'authenticated', U.manager)
  eq((await shiftSales(db, S.live)).summary.netCents, 27550, 'a cash manager reads any shift they reach')
  await as(db, 'authenticated', U.branchMgr)
  await refused(shiftSales(db, S.live), '42501', 'a branch-locked cash manager cannot read another branch\'s shift')
  eq((await shiftSales(db, S.a2)).receipts.map((r) => r.orderId), [O(22)], 'but reads their own branch\'s')
  await as(db, 'authenticated', U.superadmin)
  await refused(shiftSales(db, S.live), '42501', 'superadmins follow staff_shifts (no branch reach): refused')
  await as(db, 'authenticated', U.ownerC)
  await refused(shiftSales(db, S.live), '42501', "another store's owner is refused")
  await as(db, 'authenticated', U.cashier)
  await refused(shiftSales(db, '5a000000-0000-4000-8000-0000000000ff'), 'P0002', 'an unknown shift is P0002')
  await asAnon(db)
  await refused(shiftSales(db, S.live), '42501', 'anon cannot call report_shift_sales')
  await refused(periodSales(db, T_A, CLOSED_FROM, CLOSED_TO), '42501', 'anon cannot call report_period_sales')
  await as(db, 'authenticated', U.cashier)
  await refused(db.query("select cash.window_sales($1, now() - interval '1 day', now(), null, 10)", [T_A]), '42501', 'cash.window_sales is internal')
}

async function checkBlind(db) {
  await as(db, 'authenticated', U.cashier2)
  const hidden = await shiftSales(db, S.blind)
  dumped.hidden = hidden
  eq(hidden.hidden, true, 'blind + open + the cashier: hidden')
  eq([hidden.summary, hidden.payments, hidden.orderTypes, hidden.channels, hidden.items], [null, null, null, null, null], 'every money section is null')
  eq(hidden.receipts.map((r) => r.orderId), [O(21), O(20)], 'the receipt list stays (number, time, type, method, status)')
  eq(hidden.receipts.every((r) => r.totalCents === null && typeof r.number === 'string' && r.status), true, 'receipt totals are null')
  await as(db, 'authenticated', U.manager)
  const seen = await shiftSales(db, S.blind)
  eq([seen.hidden, seen.summary.netCents], [false, 27550], 'a cash manager sees the blind shift\'s money')
  await reset(db)
  await db.query("update staff_shifts set status = 'closed', closed_at = now(), expected_cash = 500, closing_count = 500 where id = $1", [S.blind])
  await as(db, 'authenticated', U.cashier2)
  eq((await shiftSales(db, S.blind)).hidden, false, 'once counted (closed), the cashier sees the totals')
}

async function checkPeriod(db) {
  const from = '2026-10-20T00:00:00+08:00'
  const to = '2026-10-21T00:00:00+08:00'
  await as(db, 'authenticated', U.reporter)
  const store = await periodSales(db, T_A, from, to)
  eq([store.source, store.hidden, store.shift], ['server', false, undefined], 'reports holder: whole store, no shift header')
  expectMatchesReports(store, await reportsFor(db, from, to, null), 'whole-store day')
  await as(db, 'authenticated', U.branchMgr)
  await refused(periodSales(db, T_A, from, to), '42501', 'a branch-locked account cannot read the whole store')
  await refused(periodSales(db, T_A, from, to, A1), '42501', 'nor another branch')
  eq((await periodSales(db, T_A, from, to, A2)).receipts.map((r) => r.orderId), [O(10)], 'it reads its own branch')
  await as(db, 'authenticated', U.manager)
  await refused(periodSales(db, T_A, from, to), '42501', 'cash_manage without reports: refused (needs reports)')
  await as(db, 'authenticated', U.cashier)
  await refused(periodSales(db, T_A, from, to, A1), '42501', 'a pos-only cashier: refused')
  await as(db, 'authenticated', U.superadmin)
  eq((await periodSales(db, T_A, from, to)).summary.orders, store.summary.orders, 'a superadmin (support) may read any store')
  await as(db, 'authenticated', U.owner)
  await refused(periodSales(db, T_A, to, from), '22023', 'a window must end after it starts')
  await refused(periodSales(db, T_A, from, from), '22023', 'an empty window is refused')
  await refused(periodSales(db, T_A, '2026-01-01T00:00:00+08:00', '2026-04-05T00:00:00+08:00'), '22023', 'more than 93 days is refused')
  await refused(periodSales(db, T_A, from, to, '5a000000-0000-4000-8000-0000000000ee'), '42501', 'an unknown branch is refused')
}

async function checkUnavailable(db) {
  await as(db, 'authenticated', U.ownerC)
  const shift = await shiftSales(db, S.convex)
  dumped.unavailable = shift
  eq([shift.source, shift.shift.id, shift.summary], ['unavailable', S.convex, undefined], 'a Convex store: source unavailable (with window + shift header), never ₱0')
  const period = await periodSales(db, T_C, '2026-10-20T00:00:00+08:00', '2026-10-21T00:00:00+08:00')
  eq([period.source, period.receipts], ['unavailable', undefined], 'report_period_sales too')
}

async function checkTruncation(db) {
  await reset(db)
  await db.query(`insert into orders (tenant_id, outlet_id, created_at, total, status, payment_status, source, order_type, payment_method_name, daily_number)
    select $1, $2, '2026-09-01T09:00:00+08:00'::timestamptz + make_interval(secs => g), 10, 'delivered', 'paid', 'pos', 'dine_in', 'Cash', g
      from generate_series(1, 505) g`, [T_A, A1])
  await as(db, 'authenticated', U.reporter)
  const busy = await periodSales(db, T_A, '2026-09-01T00:00:00+08:00', '2026-09-02T00:00:00+08:00', A1)
  eq([busy.receipts.length, busy.receiptsTruncated, busy.summary.orders], [500, true, 505], 'at most 500 receipts, flagged; totals still cover all 505')
  eq([busy.receipts[0].number, busy.firstNumber, busy.lastNumber], ['#505', '#01', '#505'], 'newest first; first/last number over the whole window')
}

async function main() {
  const db = new PGlite()
  try {
    await installPlatformAuth(db)
    await db.exec(STUB_SCHEMA)
    await db.exec(readMigration('20261013120050_staff_permission_keys.sql'))
    await db.exec(readMigration('20261022130200_expenses_opt_in.sql'))
    await db.exec(PRE_0D_POLICIES)
    await db.exec(REPORT_COLUMNS)
    for (const file of [
      '20261013090000_orders_discount_total_sync.sql',
      '20261013090100_orders_discount_total_hardening.sql',
      '20261014110000_report_sales_functions.sql',
      '20261014130000_report_functions_index_paths.sql',
      '20261014140000_report_helpers_inline.sql',
      '20261014150000_report_payments_name_aliases.sql',
      '20260823120000_staff_shifts.sql',
      '20260916150000_staff_shift_custody.sql',
      '20260927120000_staff_shift_server_timestamps.sql',
      '20261001120000_cash_drawers.sql',
      '20261027120000_business_day_cutoffs.sql',
      '20261027120100_cash_manage_permission.sql',
      '20261027120200_cash_settings.sql',
      '20261027120300_staff_shift_business_day.sql',
    ]) {
      await db.exec(readMigration(file))
    }
    await db.exec(PEOPLE)
    await db.exec(orderSql())
    await db.exec(LINES)
    await db.exec(SHIFTS)

    // The moved bodies answer exactly as before, over several windows and branches.
    const windows = [[CLOSED_FROM, CLOSED_TO, A1], [CLOSED_FROM, CLOSED_TO, null], ['2026-10-19T00:00:00+08:00', '2026-10-28T00:00:00+08:00', null], ['2026-10-19T00:00:00+08:00', '2026-10-28T00:00:00+08:00', A2]]
    const before = []
    for (const [from, to, outlet] of windows) before.push(await reportsFor(db, from, to, outlet))
    await db.exec(readMigration('20261027121000_shift_sales.sql'))
    await db.exec(readMigration('20261027121000_shift_sales.sql'))
    for (const [index, [from, to, outlet]] of windows.entries()) {
      const after = await reportsFor(db, from, to, outlet)
      eq(after.payments, before[index].payments, `report_payments answers exactly as before 121000 (window ${index})`)
      eq(after.items, before[index].items, `report_sales_by_item answers exactly as before 121000 (window ${index})`)
    }
    eq(before[0].payments.length > 1 && before[0].items.length > 1, true, 'the regression windows are not empty')

    await checkClosedShift(db)
    await checkLiveShift(db)
    await checkBlind(db)
    await checkPeriod(db)
    await checkUnavailable(db)
    await checkTruncation(db)
    if (process.env.SHIFT_SALES_DUMP) require('node:fs').writeFileSync(process.env.SHIFT_SALES_DUMP, JSON.stringify(dumped))
    console.log(`Shift sales: ${checks} checks passed (moved report bodies unchanged, holder / colleague / manager / branch lock, blind masking, centavo parity with report_*, period sales access, unavailable, truncation).`)
  } finally {
    await db.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
