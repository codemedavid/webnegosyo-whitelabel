// Dropping direct anon order inserts (20261107120200), pinned in PGlite over the
// order policies AS LIVE HAS THEM — not a hand-written stand-in.
//
// run-inventory-flags-and-policies.cjs already drops the two policies, but over
// a stub whose staff insert policy is `to authenticated`. Live, the staff
// policies `orders_insert_admin` and `order_items_write_admin` have NO role
// clause (they apply to PUBLIC, anon included), so the question this runner
// answers is: once the customer policies are gone, is there still ANY permissive
// policy that lets the anon key write an order or an order line?
//
// Loads, in live order:
//   lib/platform-orders-stub.cjs       orders policies + RLS helpers copied from live
//   20261013120050_staff_permission_keys.sql
//   PRE_0D_POLICIES, 20261013120200_order_reads_need_permission.sql
//   order_items + its live policies (20260829130000 customer insert,
//     20260926131000 order_items_write_admin / order_items_select_by_order bodies)
//   20261107120100_anon_order_line_limits.sql   (applied live 2026-11-08)
// then the REAL 20261107120200_drop_anon_order_inserts.sql, and checks per role:
//   hole    must be refused (or touch 0 rows) after the migration
//   compat  a write the product makes; must keep working
//
//   node tests/sql/run-drop-anon-order-inserts.cjs             must pass
//   node tests/sql/run-drop-anon-order-inserts.cjs --baseline  live schema only:
//        passes only if EVERY hole is open there (so each check bites) and
//        every compat check already works.
const { PGlite } = require('@electric-sql/pglite')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')
const { STUB_SCHEMA, PRE_0D_POLICIES } = require('./lib/platform-orders-stub.cjs')

const DROP_ANON_ORDERS = '20261107120200_drop_anon_order_inserts.sql'
const IS_BASELINE = process.argv.includes('--baseline')

const T_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_B = 'bbbbbbbb-0000-4000-8000-000000000001'
const T_OFF = 'cccccccc-0000-4000-8000-000000000001'
const OUT_A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const OTYPE_A = 'aaaaaaaa-2222-4000-8000-000000000001'
const ORDER_A = 'aaaaaaaa-1111-4000-8000-000000000001'
const ORDER_A1 = 'aaaaaaaa-1111-4000-8000-000000000002'
const MENU_A = 'aaaaaaaa-3333-4000-8000-000000000001'

const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  pos: '00000000-0000-4000-8000-000000000002',
  menu: '00000000-0000-4000-8000-000000000003',
  branchPos: '00000000-0000-4000-8000-000000000004',
  ownerB: '00000000-0000-4000-8000-000000000005',
  superadmin: '00000000-0000-4000-8000-000000000006',
  stranger: '00000000-0000-4000-8000-000000000007',
}

// order_items and menu_items as far as the policies, the 120100 trigger and
// its definer helper read them. Policy bodies are the migration texts above.
const ORDER_ITEMS_SCHEMA = String.raw`
  create table menu_items (id uuid primary key, tenant_id uuid not null);
  create table order_items (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references orders(id) on delete cascade,
    menu_item_id uuid, quantity integer not null, price numeric not null default 0
  );
  alter table order_items enable row level security;
  grant select, insert, update, delete on order_items to anon, authenticated;

  create policy order_items_select_by_order on order_items for select using (
    exists (select 1 from orders o where o.id = order_items.order_id
      and ((select app_user_is_superadmin())
           or (o.tenant_id = (select app_user_admin_tenant_id())
               and ((select app_user_admin_outlet_id()) is null
                    or o.outlet_id = (select app_user_admin_outlet_id()))))));
  create policy order_items_write_admin on order_items using (
    exists (select 1 from orders o where o.id = order_items.order_id
      and ((select app_user_is_superadmin())
           or (o.tenant_id = (select app_user_admin_tenant_id())
               and ((select app_user_admin_outlet_id()) is null
                    or o.outlet_id = (select app_user_admin_outlet_id()))))))
  with check (
    exists (select 1 from orders o where o.id = order_items.order_id
      and ((select app_user_is_superadmin())
           or (o.tenant_id = (select app_user_admin_tenant_id())
               and ((select app_user_admin_outlet_id()) is null
                    or o.outlet_id = (select app_user_admin_outlet_id()))))));

  -- 20260829130000_tighten_customer_order_insert_rls.sql (live), order_items half.
  alter table orders add column created_at timestamptz not null default now();
  create or replace function public.order_accepts_anon_items(p_order_id uuid)
  returns boolean language sql stable security definer set search_path = public, pg_temp
  as $$
    select exists (select 1 from public.orders o where o.id = p_order_id
      and o.status = 'pending' and o.created_at > (now() - interval '15 minutes'));
  $$;
  revoke all on function public.order_accepts_anon_items(uuid) from public;
  grant execute on function public.order_accepts_anon_items(uuid) to anon;
  create policy order_items_insert_customer on order_items for insert to anon
    with check (public.order_accepts_anon_items(order_id));
`

const SEED = String.raw`
  insert into tenants values ('${T_A}', true, false), ('${T_B}', true, false), ('${T_OFF}', false, false);
  insert into outlets values ('${OUT_A1}', '${T_A}');
  insert into order_types (id, tenant_id, type) values ('${OTYPE_A}', '${T_A}', 'pickup');
  insert into menu_items values ('${MENU_A}', '${T_A}');
  insert into auth.users select unnest(array[${Object.values(U).map((u) => `'${u}'::uuid`).join(',')}]);
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id) values
    ('${U.owner}',      'admin', '${T_A}', true,  '{}',      null),
    ('${U.pos}',        'admin', '${T_A}', false, '{pos}',   null),
    ('${U.menu}',       'admin', '${T_A}', false, '{menu}',  null),
    ('${U.branchPos}',  'admin', '${T_A}', false, '{pos}',   '${OUT_A1}'),
    ('${U.ownerB}',     'admin', '${T_B}', true,  '{}',      null),
    ('${U.superadmin}', 'superadmin', null, false, null,     null);
  insert into orders (id, tenant_id, total) values ('${ORDER_A}', '${T_A}', 100);
  insert into orders (id, tenant_id, total, outlet_id) values ('${ORDER_A1}', '${T_A}', 100, '${OUT_A1}');
`

// ---------------------------------------------------------------------------
// Harness (same contract as the other runners)
// ---------------------------------------------------------------------------
const results = []

function actAs(db, actor) {
  if (actor === 'anon') return asAnon(db)
  if (actor === 'service') return as(db, 'service_role', null)
  return as(db, 'authenticated', U[actor])
}

/** One statement as `actor` in a rolled-back transaction: affected rows, or 'refused: <message>'. */
async function attempt(db, actor, sql) {
  await db.exec('begin')
  try {
    await actAs(db, actor)
    const result = await db.query(sql)
    return result.affectedRows ?? result.rows.length
  } catch (error) {
    return `refused: ${error.message}`
  } finally {
    await db.exec('rollback')
    await reset(db)
  }
}

const isRefused = (outcome) => typeof outcome === 'string' && outcome.startsWith('refused')

async function hole(db, name, actor, sql) {
  const outcome = await attempt(db, actor, sql)
  results.push({ kind: 'hole', name, isOk: isRefused(outcome) || outcome === 0, detail: outcome })
}

async function compat(db, name, actor, sql) {
  const outcome = await attempt(db, actor, sql)
  results.push({ kind: 'compat', name, isOk: outcome === 1, detail: outcome })
}

const order = (tenant, extra = '') =>
  `insert into orders (tenant_id, total, status, payment_status${extra ? ', outlet_id' : ''}) values ('${tenant}', 50, 'pending', 'pending'${extra ? `, '${extra}'` : ''})`
const orderWithType = (tenant) =>
  `insert into orders (tenant_id, total, order_type_id) values ('${tenant}', 50, '${OTYPE_A}')`
const line = (orderId, qty = 1) =>
  `insert into order_items (order_id, menu_item_id, quantity, price) values ('${orderId}', '${MENU_A}', ${qty}, 10)`
// The shape a pre-#110 customer-app build sent: the app generates the id (anon
// has no SELECT policy, so INSERT..RETURNING is refused), inserts the order,
// then its lines. Counts 1 only when BOTH land.
const OLD_APP_ORDER = 'aaaaaaaa-1111-4000-8000-0000000000ff'
const anonCheckoutLine = line(OLD_APP_ORDER)

/** The old app's two requests in one rolled-back transaction: 1 if both land, else the refusal. */
async function attemptOldAppCheckout(db) {
  await db.exec('begin')
  try {
    await asAnon(db)
    await db.query(`insert into orders (id, tenant_id, total) values ('${OLD_APP_ORDER}', '${T_A}', 50)`)
    const lines = await db.query(anonCheckoutLine)
    return lines.affectedRows ?? 0
  } catch (error) {
    return `refused: ${error.message}`
  } finally {
    await db.exec('rollback')
    await reset(db)
  }
}

async function checks(db) {
  // anon: every write path into orders / order_items is closed.
  await hole(db, 'anon cannot insert a pending order', 'anon', order(T_A))
  await hole(db, 'anon cannot insert an order with an order type', 'anon', orderWithType(T_A))
  await hole(db, 'anon cannot insert an order on a branch', 'anon', order(T_A, OUT_A1))
  await hole(db, 'anon cannot add a line to a fresh pending order', 'anon', line(ORDER_A))
  await hole(db, 'anon cannot add a line inside the 99-quantity cap', 'anon', line(ORDER_A, 2))

  // Staff (merchant app register, web admin) keep writing as `authenticated`.
  await compat(db, 'owner inserts an order', 'owner', order(T_A))
  await compat(db, 'pos staff insert an order', 'pos', order(T_A))
  await compat(db, 'branch pos inserts on its own branch', 'branchPos', order(T_A, OUT_A1))
  await compat(db, 'owner adds a line', 'owner', line(ORDER_A))
  await compat(db, 'pos staff add a line', 'pos', line(ORDER_A))
  await compat(db, 'branch pos adds a line to its own branch order', 'branchPos', line(ORDER_A1))
  await compat(db, 'superadmin inserts an order', 'superadmin', order(T_A))

  // Never open, before or after (the staff policies stay tenant-scoped).
  for (const [name, actor, sql] of [
    ['another store\'s owner cannot insert into this store', 'ownerB', order(T_A)],
    ['another store\'s owner cannot add a line here', 'ownerB', line(ORDER_A)],
    ['a signed-in user with no staff row cannot insert an order', 'stranger', order(T_A)],
    ['a signed-in user with no staff row cannot add a line', 'stranger', line(ORDER_A)],
    ['anon cannot insert into an inactive store', 'anon', order(T_OFF)],
  ]) {
    const outcome = await attempt(db, actor, sql)
    results.push({ kind: 'compat', name, isOk: isRefused(outcome) || outcome === 0, detail: outcome })
  }

  // The web checkout and the customer-app route write as the service role.
  await compat(db, 'service role inserts an order', 'service', order(T_A))
  await compat(db, 'service role adds a line', 'service', line(ORDER_A, 500))
}

async function main() {
  const db = new PGlite()
  try {
    await installPlatformAuth(db)
    await db.exec(STUB_SCHEMA)
    await db.exec(readMigration('20261013120050_staff_permission_keys.sql'))
    await db.exec(PRE_0D_POLICIES)
    await db.exec(readMigration('20261013120200_order_reads_need_permission.sql'))
    await db.exec(ORDER_ITEMS_SCHEMA)
    await db.exec(readMigration('20261107120100_anon_order_line_limits.sql'))
    await db.exec(SEED)

    // The pre-#110 customer app's checkout, as anon, against today's live policies.
    const before = await attemptOldAppCheckout(db)
    results.push({ kind: 'compat', name: 'before the drop: an old customer-app checkout still lands', isOk: before === 1, detail: before })

    if (!IS_BASELINE) {
      await db.exec(readMigration(DROP_ANON_ORDERS))
      await db.exec(readMigration(DROP_ANON_ORDERS)) // idempotent
      const after = await attemptOldAppCheckout(db)
      results.push({ kind: 'hole', name: 'after the drop: an old customer-app checkout is refused', isOk: isRefused(after), detail: after })
    }
    await checks(db)
  } finally {
    await db.close()
  }

  const compatFails = results.filter((r) => r.kind === 'compat' && !r.isOk)
  const holes = results.filter((r) => r.kind === 'hole')
  if (IS_BASELINE) {
    const notOpen = holes.filter((r) => r.isOk)
    for (const r of notOpen) console.log(`NOT OPEN on live schema (check does not bite): ${r.name} -> ${JSON.stringify(r.detail)}`)
    for (const r of compatFails) console.log(`COMPAT FAIL on live schema: ${r.name} -> ${JSON.stringify(r.detail)}`)
    console.log(`baseline: ${holes.length - notOpen.length}/${holes.length} holes open, ${compatFails.length} compat failures`)
    if (notOpen.length > 0 || compatFails.length > 0) process.exitCode = 1
    return
  }
  const failed = results.filter((r) => !r.isOk)
  for (const r of results) console.log(`${r.isOk ? 'ok  ' : 'FAIL'} [${r.kind}] ${r.name}${r.isOk ? '' : ` -> ${JSON.stringify(r.detail)}`}`)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length > 0) process.exitCode = 1
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
