// Phase 0d permission keys, pinned in an isolated PostgreSQL (PGlite).
//
// Loads the REAL migrations
//   20261013120050_staff_permission_keys.sql      app_user_has_permission (applied live 2026-10-13)
//   20261013120200_order_reads_need_permission.sql HIGH-3: order reads/writes need an order key
// over a stub of the live platform schema, then checks every rule as the role
// that really runs the query: anon, owner, legacy full access, scoped staff,
// branch-locked staff, superadmin.
//
// 20261013120100_inventory_costs_permission_gates.sql is NOT loaded: it needs
// the whole inventory schema (ingredients, stock, movements, counts, transfers).
//
// Stub provenance — read from the live platform DB (SELECT only) on 2026-10-14:
//   functions  app_user_is_superadmin, app_user_admin_tenant_id,
//              app_user_admin_outlet_id, app_user_may_see_order,
//              app_user_platform_can, order_child_inherit_branch,
//              orders_client_status_guard (bodies copied verbatim)
//   policies   orders: orders_select_by_tenant, orders_insert_admin,
//              orders_update_admin, orders_insert_customer,
//              orders_require_server_lalamove_quote (restrictive), platform_staff_*;
//              order_payments: order_payments_select, order_payments_insert_admin,
//              platform_staff_*; order_revisions: order_revisions_select,
//              order_revisions_insert_admin, platform_staff_*;
//              app_users_select_self; tenants_read_active; order_types_read_active
//   grants     table ACLs as live (orders: no DELETE; payments/revisions: SELECT+INSERT)
// Only the columns those policies/functions read exist. Other live triggers
// (refund amount guard, ledger append-only, actor stamps, push, activity) are
// not stubbed: they do not decide RLS.
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')
const { STUB_SCHEMA, PRE_0D_POLICIES } = require('./lib/platform-orders-stub.cjs')

const T_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_B = 'bbbbbbbb-0000-4000-8000-000000000001'
const OUT_A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const OUT_A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const OUT_B1 = 'bbbbbbbb-0000-4000-8000-0000000000b1'
const ORD_A1 = 'aaaaaaaa-1111-4000-8000-000000000001'
const ORD_A2 = 'aaaaaaaa-1111-4000-8000-000000000002'
const ORD_A_NULL = 'aaaaaaaa-1111-4000-8000-000000000003'
const ORD_B1 = 'bbbbbbbb-1111-4000-8000-000000000001'
const OTYPE_A = 'aaaaaaaa-2222-4000-8000-000000000001'

const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  legacy: '00000000-0000-4000-8000-000000000002',
  pos: '00000000-0000-4000-8000-000000000003',
  kitchen: '00000000-0000-4000-8000-000000000004',
  analytics: '00000000-0000-4000-8000-000000000005',
  menu: '00000000-0000-4000-8000-000000000006',
  customers: '00000000-0000-4000-8000-000000000007',
  orders: '00000000-0000-4000-8000-000000000008',
  branchPos: '00000000-0000-4000-8000-000000000009',
  posRefund: '00000000-0000-4000-8000-00000000000a',
  superadmin: '00000000-0000-4000-8000-00000000000b',
}

const SEED = `
  insert into tenants values ('${T_A}', true, false), ('${T_B}', true, false);
  insert into outlets values ('${OUT_A1}', '${T_A}'), ('${OUT_A2}', '${T_A}'), ('${OUT_B1}', '${T_B}');
  insert into order_types (id, tenant_id, type) values ('${OTYPE_A}', '${T_A}', 'pickup');
  insert into auth.users select unnest(array[${Object.values(U).map((id) => `'${id}'::uuid`).join(',')}]);
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id) values
    ('${U.owner}',      'admin', '${T_A}', true,  '{}',                    null),
    ('${U.legacy}',     'admin', '${T_A}', false, null,                    null),
    ('${U.pos}',        'admin', '${T_A}', false, '{pos}',                 null),
    ('${U.kitchen}',    'admin', '${T_A}', false, '{kitchen}',             null),
    ('${U.analytics}',  'admin', '${T_A}', false, '{analytics}',           null),
    ('${U.menu}',       'admin', '${T_A}', false, '{menu}',                null),
    ('${U.customers}',  'admin', '${T_A}', false, '{customers}',           null),
    ('${U.orders}',     'admin', '${T_A}', false, '{orders}',              null),
    ('${U.branchPos}',  'admin', '${T_A}', false, '{pos}',                 '${OUT_A1}'),
    ('${U.posRefund}',  'admin', '${T_A}', false, '{pos,order_refund}',    null),
    ('${U.superadmin}', 'superadmin', null, false, null,                   null);
  insert into orders (id, tenant_id, total, outlet_id) values
    ('${ORD_A1}', '${T_A}', 100, '${OUT_A1}'),
    ('${ORD_A2}', '${T_A}', 100, '${OUT_A2}'),
    ('${ORD_A_NULL}', '${T_A}', 100, null),
    ('${ORD_B1}', '${T_B}', 100, '${OUT_B1}');
  insert into order_payments (tenant_id, order_id, kind, amount, outlet_id)
    select tenant_id, id, 'charge', 100, outlet_id from orders;
  insert into order_revisions (tenant_id, order_id, outlet_id)
    select tenant_id, id, outlet_id from orders;
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
  return Object.values(rows[0])[0]
}

// Rows each table shows the current caller: [orders, payments, revisions].
async function visible(db) {
  const counts = []
  for (const table of ['orders', 'order_payments', 'order_revisions']) {
    counts.push(await scalar(db, `select count(*)::int from ${table}`))
  }
  return counts
}

async function readsAs(db, uid) {
  await as(db, 'authenticated', uid)
  return visible(db)
}

async function checkBaseline(db) {
  // Pre-0d, any staff account of the store reads every order and payment.
  eq(await readsAs(db, U.menu), [3, 3, 3], 'baseline: menu-only staff read all store orders before HIGH-3')
  eq(await readsAs(db, U.customers), [3, 3, 3], 'baseline: customers-only staff read all store orders before HIGH-3')
  await reset(db)
}

async function checkHasPermission(db) {
  const has = (tenant, key) => scalar(db, 'select public.app_user_has_permission($1, $2)', [tenant, key])
  const holdsAny = (tenant, keys) => scalar(db, 'select public.app_user_holds_any_permission($1, $2)', [tenant, keys])

  await as(db, 'authenticated', U.analytics)
  eq(await has(T_A, 'reports'), true, 'analytics implies reports')
  eq(await has(T_A, 'analytics'), true, 'analytics holder holds analytics')
  eq(await has(T_A, 'activity_view'), false, 'analytics holder lacks opt-in activity_view')
  eq(await has(T_B, 'reports'), false, 'reports does not cross to another store')

  await as(db, 'authenticated', U.pos)
  eq(await has(T_A, 'reports'), false, 'scoped account without analytics lacks reports')
  eq(await holdsAny(T_A, ['analytics', 'reports']), false, 'pos holds none of analytics/reports')

  await as(db, 'authenticated', U.legacy)
  eq(await has(T_A, 'reports'), true, 'legacy NULL grants reports')
  eq(await has(T_A, 'inventory'), true, 'legacy NULL grants inventory')
  eq(await has(T_A, 'activity_view'), false, 'legacy NULL does not grant opt-in activity_view')
  eq(await has(T_A, 'approve_requests'), false, 'legacy NULL does not grant opt-in approve_requests')
  eq(await has(T_B, 'reports'), false, 'legacy NULL is still store-bound')

  await as(db, 'authenticated', U.orders)
  eq(await has(T_A, 'kitchen'), true, 'orders implies kitchen')
  eq(await has(T_A, 'tables'), true, 'orders implies tables')
  eq(await has(T_A, 'reports'), false, 'orders does not imply reports')

  await as(db, 'authenticated', U.kitchen)
  eq(await holdsAny(T_A, ['pos', 'kitchen']), true, 'holds_any: one key is enough')
  eq(await holdsAny(T_A, ['pos', 'tables']), false, 'kitchen does not imply tables')

  await as(db, 'authenticated', U.owner)
  eq(await has(T_A, 'costs'), true, 'owner holds every key (empty permissions array)')
  eq(await has(T_B, 'costs'), false, 'owner of A holds nothing at B')

  await as(db, 'authenticated', U.superadmin)
  eq(await has(T_B, 'reports'), true, 'superadmin holds every key at every store')
  eq(await holdsAny(null, ['pos']), true, 'superadmin passes holds_any with a NULL tenant (no admin row)')

  await asAnon(db)
  await refused(has(T_A, 'reports'), '42501', 'anon cannot EXECUTE app_user_has_permission')
  eq(await holdsAny(T_A, ['orders', 'pos']), false, 'anon may EXECUTE app_user_holds_any_permission and gets false')
  await reset(db)
}

async function checkReads(db) {
  await as(db, 'authenticated', U.owner)
  eq(await visible(db), [3, 3, 3], 'owner sees every order/payment/revision of the store')
  eq(await scalar(db, 'select count(*)::int from orders where tenant_id = $1', [T_B]), 0, 'owner sees none of another store')
  eq(await readsAs(db, U.legacy), [3, 3, 3], 'legacy NULL staff sees everything of the store')
  eq(await readsAs(db, U.pos), [3, 3, 3], 'pos sees orders + payments + revisions')
  eq(await readsAs(db, U.kitchen), [3, 0, 0], 'kitchen sees orders, no payments, no revisions')
  eq(await readsAs(db, U.analytics), [3, 3, 3], 'analytics sees orders + payments')
  eq(await readsAs(db, U.orders), [3, 3, 3], 'orders sees orders + payments')
  eq(await readsAs(db, U.menu), [0, 0, 0], 'menu-only sees nothing, without an error')
  eq(await readsAs(db, U.customers), [0, 0, 0], 'customers-only sees nothing')
  // Live behaviour (pre- and post-0d): a branch-locked account matches
  // outlet_id = its branch, so NULL-outlet (unattributed) rows stay hidden.
  eq(await readsAs(db, U.branchPos), [1, 1, 1], 'branch-locked pos sees only its branch (not the other, not NULL-outlet)')
  eq(await scalar(db, 'select count(*)::int from orders where outlet_id is null'), 0, 'branch-locked pos does not see NULL-outlet orders')
  eq(await readsAs(db, U.superadmin), [4, 4, 4], 'superadmin sees every store')
  await asAnon(db)
  eq(await visible(db), [0, 0, 0], 'anon reads nothing, without an error')
  await reset(db)
}

async function insertOrder(db, outlet = null) {
  return db.query('insert into orders (tenant_id, total, outlet_id) values ($1, 50, $2)', [T_A, outlet])
}
async function insertPayment(db, orderId, kind = 'charge') {
  return db.query('insert into order_payments (tenant_id, order_id, kind, amount, outlet_id) values ($1, $2, $3, 10, null)', [T_A, orderId, kind])
}

async function checkWrites(db) {
  await as(db, 'authenticated', U.menu)
  await refused(insertOrder(db), '42501', 'menu-only INSERT into orders (no RETURNING) is refused')
  await refused(insertPayment(db, ORD_A_NULL), '42501', 'menu-only INSERT into order_payments is refused')
  await refused(db.query('insert into order_revisions (tenant_id, order_id) values ($1, $2)', [T_A, ORD_A_NULL]), '42501', 'menu-only INSERT into order_revisions is refused')
  eq((await db.query("update orders set status = 'preparing' where id = $1", [ORD_A1])).affectedRows, 0, 'menu-only UPDATE touches 0 rows')

  await as(db, 'authenticated', U.pos)
  eq((await insertOrder(db)).affectedRows, 1, 'pos INSERT order succeeds')
  eq((await insertPayment(db, ORD_A_NULL)).affectedRows, 1, 'pos INSERT charge succeeds')
  await refused(insertPayment(db, ORD_A_NULL, 'refund'), '42501', 'pos refund without order_refund is refused')
  eq((await db.query('insert into order_revisions (tenant_id, order_id) values ($1, $2)', [T_A, ORD_A_NULL])).affectedRows, 1, 'pos INSERT revision succeeds')

  await as(db, 'authenticated', U.posRefund)
  eq((await insertPayment(db, ORD_A_NULL, 'refund')).affectedRows, 1, 'pos + order_refund refund succeeds')

  await as(db, 'authenticated', U.kitchen)
  eq((await db.query("update orders set status = 'preparing' where id = $1", [ORD_A1])).affectedRows, 1, 'kitchen bump UPDATE touches 1 row')
  await refused(insertPayment(db, ORD_A1), '42501', 'kitchen cannot write the till')

  await as(db, 'authenticated', U.branchPos)
  eq((await insertOrder(db, OUT_A1)).affectedRows, 1, 'branch pos INSERT at its own branch succeeds')
  await refused(insertOrder(db, OUT_A2), '42501', 'branch pos INSERT at another branch is refused')
  // order_child_inherit_branch stamps the parent's branch BEFORE the check.
  eq((await insertPayment(db, ORD_A1)).affectedRows, 1, 'branch pos payment inherits its branch and passes')
  await refused(insertPayment(db, ORD_A2), '42501', 'branch pos payment on another branch order is refused')

  await as(db, 'authenticated', U.superadmin)
  eq((await insertPayment(db, ORD_A2)).affectedRows, 1, 'superadmin (no admin tenant) still writes payments')

  await asAnon(db)
  eq((await db.query("insert into orders (tenant_id, total, order_type_id) values ($1, 80, $2)", [T_A, OTYPE_A])).affectedRows, 1, 'anon checkout INSERT still works through its own policy')
  await refused(db.query("insert into orders (tenant_id, total, status) values ($1, 80, 'completed')", [T_A]), '42501', 'anon checkout cannot post a non-pending order')
  await reset(db)
}

async function checkInitPlan(db) {
  await as(db, 'authenticated', U.pos)
  const { rows } = await db.query('explain (verbose, costs off) select id from orders')
  await reset(db)
  const plan = rows.map((row) => row['QUERY PLAN']).join('\n')
  if (!/InitPlan/.test(plan)) {
    console.log('  (EXPLAIN shows no InitPlan in this PGlite build; once-per-statement check skipped)')
    return
  }
  const filter = plan.split('\n').filter((line) => /Filter:/.test(line)).join('\n')
  eq(/app_user_holds_any_permission/.test(plan), true, 'the permission check is in the plan')
  eq(/app_user_holds_any_permission/.test(filter), false, 'the permission check is an InitPlan, not a per-row filter call')
}

async function main() {
  const db = new PGlite()
  try {
    await installPlatformAuth(db)
    await db.exec(STUB_SCHEMA)
    await db.exec(readMigration('20261013120050_staff_permission_keys.sql'))
    await db.exec(PRE_0D_POLICIES)
    await db.exec(SEED)
    await checkBaseline(db)
    await db.exec(readMigration('20261013120200_order_reads_need_permission.sql'))
    await checkHasPermission(db)
    await checkReads(db)
    await checkWrites(db)
    await checkInitPlan(db)
    console.log(`Permission keys (0d): ${checks} checks passed (has_permission, order reads, staff writes, anon checkout, InitPlan).`)
  } finally {
    await db.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
