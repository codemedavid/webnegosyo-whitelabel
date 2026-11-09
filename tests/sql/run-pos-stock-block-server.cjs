// Server-enforced 'block' stock policy (20261110120000), pinned in PGlite as
// the role that really runs each query.
//
// Loads the REAL migration over a stub of the tables it reads (tenants,
// app_users, orders, order_items, order_revisions, inventory_items,
// stock_movements, store_activity) with simplified member policies, then
// asserts per role:
//   - a cashier's online sale on a block store without a clearance: 42501;
//   - a clearance (fits, or approved by a manager) bound to store + branch +
//     cashier + order id + per-dish quantities lets exactly that sale in;
//   - reuse on another order, another cashier, another branch or another store
//     is refused, and so are items beyond what was cleared (also split up);
//   - clients can neither read nor write clearances (no forgery);
//   - an offline-marked sale is accepted, and flagged `oversold_offline` in
//     Store Activity once its sale movement leaves a shelf below zero; an
//     approved one is recorded with the approver and no flag; an unapproved one
//     is flagged `oversold_unapproved`;
//   - 'warn' stores, the service role and the anon web checkout are untouched.
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')

const MIGRATION = '20261110120000_pos_stock_block_server.sql'

const T = 'aaaaaaaa-0000-4000-8000-000000000001' // block
const T_WARN = 'bbbbbbbb-0000-4000-8000-000000000001'
const OUTLET = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const OUTLET_2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const U = {
  cashier: '00000000-0000-4000-8000-000000000001',
  cashier2: '00000000-0000-4000-8000-000000000002',
  manager: '00000000-0000-4000-8000-000000000003',
  warnCashier: '00000000-0000-4000-8000-000000000004',
}
const DISH = '11111111-0000-4000-8000-000000000001'
const DISH_2 = '11111111-0000-4000-8000-000000000002'
const FLOUR = '22222222-0000-4000-8000-000000000001'
const OFF_FLOUR = '22222222-0000-4000-8000-000000000002'

let n = 0
const orderId = () => `cccccccc-0000-4000-8000-${String(++n).padStart(12, '0')}`

const STUB = `
  create table public.tenants (
    id uuid primary key, name text, is_active boolean not null default true,
    pos_stock_policy text not null default 'warn'
  );
  create table public.app_users (
    user_id uuid not null, tenant_id uuid, role text not null,
    is_owner boolean default false, outlet_id uuid, permissions text[]
  );
  create table public.orders (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id),
    outlet_id uuid,
    source text not null default 'web',
    order_number text,
    customer_data jsonb,
    created_at timestamptz not null default now()
  );
  create table public.order_items (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    menu_item_id uuid,
    quantity integer not null
  );
  create table public.order_revisions (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null,
    order_id uuid not null references public.orders(id) on delete cascade,
    revision_number integer not null
  );
  create table public.inventory_items (
    id uuid primary key, tenant_id uuid not null, name text not null, is_active boolean not null default true
  );
  create table public.stock_movements (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null,
    inventory_item_id uuid not null,
    outlet_id uuid,
    order_id text,
    reason text not null,
    quantity_delta numeric(16,4) not null,
    balance_after numeric(16,4) not null default 0,
    created_at timestamptz not null default now()
  );
  create table public.store_activity (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null,
    outlet_id uuid,
    occurred_at timestamptz not null default now(),
    category text not null,
    kind text not null,
    is_routine boolean not null default false,
    actor_user_id uuid, actor_name text, approved_by uuid, approved_by_name text,
    amount numeric(14,2), quantity numeric, unit text, reason text, note text,
    subject_type text, subject_ref text, order_number text, backend text, external_order_id text,
    before jsonb, after jsonb,
    summary jsonb not null default '{}'::jsonb,
    flags text[] not null default '{}'::text[],
    source_table text not null, source_id text not null, event_key text not null,
    created_at timestamptz not null default now(),
    constraint store_activity_event_key_uq unique (event_key)
  );
  revoke all on public.store_activity from anon, authenticated;

  -- Members of a store may write its orders (simplified orders_insert_staff).
  alter table public.orders enable row level security;
  create policy orders_staff on public.orders for all to authenticated
    using (exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.tenant_id = orders.tenant_id))
    with check (exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.tenant_id = orders.tenant_id));
  create policy orders_insert_customer on public.orders for insert to anon with check (source = 'web');
  alter table public.order_items enable row level security;
  create policy order_items_staff on public.order_items for all to authenticated using (true) with check (true);
  create policy order_items_anon on public.order_items for insert to anon with check (true);
  alter table public.order_revisions enable row level security;
  create policy order_revisions_staff on public.order_revisions for all to authenticated using (true) with check (true);
`

const SEED = `
  insert into public.tenants (id, name, pos_stock_policy) values
    ('${T}', 'Sofias', 'block'), ('${T_WARN}', 'Warn store', 'warn');
  insert into public.app_users (user_id, tenant_id, role, is_owner, outlet_id, permissions) values
    ('${U.cashier}', '${T}', 'admin', false, '${OUTLET}', array['pos']),
    ('${U.cashier2}', '${T}', 'admin', false, '${OUTLET}', array['pos']),
    ('${U.manager}', '${T}', 'admin', false, null, array['pos', 'inventory']),
    ('${U.warnCashier}', '${T_WARN}', 'admin', false, null, array['pos']);
  insert into public.inventory_items (id, tenant_id, name, is_active) values
    ('${FLOUR}', '${T}', 'Flour', true), ('${OFF_FLOUR}', '${T}', 'Old flour', false);
`

let checks = 0
function eq(actual, expected, message) {
  checks += 1
  assert.deepEqual(actual, expected, message)
}

/** Run `sql` as role/uid; answers rows affected, or the SQLSTATE it raised. */
async function run(db, role, uid, sql, params = []) {
  if (role === 'anon') await asAnon(db)
  else if (role === 'service_role') await as(db, 'service_role', null)
  else await as(db, role, uid)
  try {
    const result = await db.query(sql, params)
    return result.affectedRows ?? result.rows.length
  } catch (error) {
    return error.code ?? String(error.message)
  } finally {
    await reset(db)
  }
}

async function errorOf(db, role, uid, sql, params = []) {
  await as(db, role, uid)
  try {
    await db.query(sql, params)
    return null
  } catch (error) {
    return error
  } finally {
    await reset(db)
  }
}

const INSERT_ORDER =
  'insert into public.orders (id, tenant_id, outlet_id, source, customer_data) values ($1, $2, $3, $4, $5::jsonb)'
const POS_DATA = JSON.stringify({ pos: { method: 'cash', cashierId: U.cashier } })
const OFFLINE_DATA = JSON.stringify({ pos: { method: 'cash', cashierId: U.cashier, stockCheck: 'offline' } })

const insertItems = (order, rows) => [
  `insert into public.order_items (order_id, menu_item_id, quantity) values ${rows
    .map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`)
    .join(', ')}`,
  [order, ...rows.flatMap(([dish, qty]) => [dish, qty])],
]

async function clear(db, { tenant = T, outlet = OUTLET, order, cashier = U.cashier, quantities, approver = null, shortfalls = [] }) {
  await reset(db)
  await as(db, 'service_role', null)
  await db.query(
    `insert into public.pos_stock_clearances
       (tenant_id, outlet_id, order_id, cashier_user_id, cashier_name, approver_user_id, approver_name, quantities, shortfalls)
     values ($1, $2, $3, $4, 'Ana', $5, $6, $7::jsonb, $8::jsonb)`,
    [tenant, outlet, order, cashier, approver, approver ? 'Mgr Lito' : null, JSON.stringify(quantities), JSON.stringify(shortfalls)],
  )
  await reset(db)
}

async function sell(db, order, delta, balance, { item = FLOUR, tenant = T } = {}) {
  await as(db, 'service_role', null)
  await db.query(
    `insert into public.stock_movements (tenant_id, inventory_item_id, outlet_id, order_id, reason, quantity_delta, balance_after)
     values ($1, $2, $3, $4, 'sale', $5, $6)`,
    [tenant, item, OUTLET, order, delta, balance],
  )
  await reset(db)
}

async function activityFor(db, order) {
  await reset(db)
  const { rows } = await db.query(
    `select kind, category, flags, approved_by, approved_by_name, actor_user_id, subject_ref, is_routine
       from public.store_activity where subject_ref = $1 order by created_at`,
    [order],
  )
  return rows
}

async function main() {
  const db = new PGlite()
  await installPlatformAuth(db)
  await db.exec(STUB)
  await db.exec(SEED)
  await db.exec(readMigration(MIGRATION))
  // Applied by hand, maybe twice.
  await db.exec(readMigration(MIGRATION))
  // The live kind CHECK calls the vocabulary function the migration replaces.
  await db.exec(`alter table public.store_activity add constraint store_activity_kind_ck check (
    public.store_activity_category_of(kind) is not null and category = public.store_activity_category_of(kind))`)

  // --- warn store: unchanged --------------------------------------------------
  const warnOrder = orderId()
  eq(await run(db, 'authenticated', U.warnCashier, INSERT_ORDER, [warnOrder, T_WARN, null, 'pos', POS_DATA]), 1,
    'warn store: a cashier sale without any clearance is written')
  eq(await run(db, 'authenticated', U.warnCashier, ...insertItems(warnOrder, [[DISH, 50]])), 1,
    'warn store: its items are written')

  // --- block store: no clearance ----------------------------------------------
  const bare = orderId()
  const refused = await errorOf(db, 'authenticated', U.cashier, INSERT_ORDER, [bare, T, OUTLET, 'pos', POS_DATA])
  eq(refused?.code, '42501', 'block store: an online sale without a clearance is refused (42501)')
  checks += 1
  assert.match(refused.message, /POS_STOCK_NEEDS_APPROVAL/, 'the refusal names the reason')
  eq(await run(db, 'authenticated', U.cashier, INSERT_ORDER, [bare, T, OUTLET, 'qr_handoff', '{}']), '42501',
    'block store: switching the source to qr_handoff does not dodge it')
  eq(await run(db, 'authenticated', U.cashier, INSERT_ORDER, [bare, T, OUTLET, 'web', '{}']), '42501',
    'block store: nor does posing as a web order from a staff session')

  // --- forgery: clients cannot touch clearances ---------------------------------
  eq(await run(db, 'authenticated', U.cashier,
    `insert into public.pos_stock_clearances (tenant_id, outlet_id, order_id, cashier_user_id, quantities)
     values ($1, $2, $3, $4, '{}'::jsonb)`, [T, OUTLET, bare, U.cashier]), '42501',
    'a cashier cannot write (forge) a clearance')
  eq(await run(db, 'authenticated', U.manager,
    `insert into public.pos_stock_clearances (tenant_id, outlet_id, order_id, cashier_user_id, approver_user_id, quantities, shortfalls)
     values ($1, $2, $3, $4, $5, '{}'::jsonb, '[{"menuItemId":"x"}]'::jsonb)`, [T, OUTLET, bare, U.cashier, U.manager]), '42501',
    'a manager cannot write an approval directly either')
  eq(await run(db, 'authenticated', U.cashier, 'select * from public.pos_stock_clearances'), '42501',
    'a cashier cannot read clearances')
  eq(await run(db, 'anon', null, 'select * from public.pos_stock_clearances'), '42501', 'anon cannot read clearances')
  // The helpers live in pos_private, which PostgREST does not expose; anon has
  // no way in at all, and the service role is never judged by them.
  eq(await run(db, 'anon', null, 'select pos_private.order_insert_allowed($1, $2, $3, $4::jsonb)',
    [T, bare, OUTLET, '{}']), '42501', 'anon cannot reach the guard helpers')

  // --- a fits clearance -------------------------------------------------------
  const fits = orderId()
  await clear(db, { order: fits, quantities: { [DISH]: 2, [DISH_2]: 1 } })
  eq(await run(db, 'authenticated', U.cashier, INSERT_ORDER, [fits, T, OUTLET, 'pos', POS_DATA]), 1,
    'block store: the sale its clearance names is written')
  eq(await run(db, 'authenticated', U.cashier, ...insertItems(fits, [[DISH, 1], [DISH, 1], [DISH_2, 1]])), 3,
    'its items within the cleared quantities are written')
  eq(await run(db, 'authenticated', U.cashier, ...insertItems(fits, [[DISH, 1]])), '42501',
    'one more of a cleared dish in a second insert is refused')
  eq(await run(db, 'authenticated', U.cashier, ...insertItems(fits, [['11111111-0000-4000-8000-000000000009', 1]])), '42501',
    'a dish the clearance never judged is refused')
  eq(await run(db, 'authenticated', U.cashier, 'insert into public.order_items (order_id, menu_item_id, quantity) values ($1, null, 3)', [fits]), 1,
    'a custom line with no menu item (nothing to stock) is fine')

  const tooMany = orderId()
  await clear(db, { order: tooMany, quantities: { [DISH]: 1 } })
  eq(await run(db, 'authenticated', U.cashier, INSERT_ORDER, [tooMany, T, OUTLET, 'pos', POS_DATA]), 1, 'order with a 1-dish clearance')
  eq(await run(db, 'authenticated', U.cashier, ...insertItems(tooMany, [[DISH, 50]])), '42501',
    'a clearance for one cannot carry fifty')
  eq(await run(db, 'service_role', null, ...insertItems(tooMany, [[DISH, 50]])), 1,
    'the service role is never limited by a clearance')

  // --- wrong sale / reuse -----------------------------------------------------
  const other = orderId()
  eq(await run(db, 'authenticated', U.cashier, INSERT_ORDER, [other, T, OUTLET, 'pos', POS_DATA]), '42501',
    "reuse: another order cannot ride an existing order's clearance")
  const forAna = orderId()
  await clear(db, { order: forAna, quantities: { [DISH]: 1 } })
  eq(await run(db, 'authenticated', U.cashier2, INSERT_ORDER, [forAna, T, OUTLET, 'pos', POS_DATA]), '42501',
    "wrong cashier: another cashier cannot use Ana's clearance")
  eq(await run(db, 'authenticated', U.manager, INSERT_ORDER, [forAna, T, OUTLET_2, 'pos', POS_DATA]), '42501',
    'wrong branch: the clearance is for its own branch only')
  const crossStore = orderId()
  await clear(db, { tenant: T_WARN, outlet: OUTLET, order: crossStore, quantities: { [DISH]: 1 } })
  eq(await run(db, 'authenticated', U.cashier, INSERT_ORDER, [crossStore, T, OUTLET, 'pos', POS_DATA]), '42501',
    "wrong store: another store's clearance does not count")

  // Shape: an oversell needs an approver, a fit must not claim one.
  await as(db, 'service_role', null)
  await assert.rejects(
    db.query(`insert into public.pos_stock_clearances (tenant_id, outlet_id, order_id, cashier_user_id, quantities, shortfalls)
              values ($1, $2, $3, $4, '{}'::jsonb, '[{"menuItemId":"x"}]'::jsonb)`, [T, OUTLET, orderId(), U.cashier]),
    /pos_stock_clearances_approval_ck/, 'a short sale without an approver cannot be cleared',
  )
  checks += 1
  await reset(db)

  // --- approved oversell --------------------------------------------------------
  const approved = orderId()
  await clear(db, { order: approved, quantities: { [DISH]: 5 }, approver: U.manager, shortfalls: [{ menuItemId: DISH, requested: 5, producible: 2 }] })
  eq(await run(db, 'authenticated', U.cashier, INSERT_ORDER, [approved, T, OUTLET, 'pos', POS_DATA]), 1,
    'an approved oversell is written')
  eq(await run(db, 'authenticated', U.cashier, ...insertItems(approved, [[DISH, 5]])), 1, 'with its approved quantity')
  await sell(db, approved, -5, -3)
  await sell(db, approved, -1, -4)
  eq(await activityFor(db, approved), [{
    kind: 'stock.oversold', category: 'stock', flags: [], approved_by: U.manager, approved_by_name: 'Mgr Lito',
    actor_user_id: U.cashier, subject_ref: approved, is_routine: false,
  }], 'an approved oversell is recorded once, with the approver and no flag')

  // --- offline ------------------------------------------------------------------
  const offline = orderId()
  eq(await run(db, 'authenticated', U.cashier, INSERT_ORDER, [offline, T, OUTLET, 'pos', OFFLINE_DATA]), 1,
    'a sale taken offline is accepted without a clearance')
  eq(await run(db, 'authenticated', U.cashier, ...insertItems(offline, [[DISH, 40]])), 1, 'with all its items')
  await sell(db, offline, -2, 3)
  eq(await activityFor(db, offline), [], 'nothing is flagged while the shelf covers it')
  await sell(db, offline, -10, -7)
  eq((await activityFor(db, offline)).map((row) => [row.kind, row.flags, row.approved_by]),
    [['stock.oversold', ['oversold_offline'], null]], 'an offline sale that oversold is flagged oversold_offline')

  // --- unapproved (an edit, a race) ----------------------------------------------
  const raced = orderId()
  await clear(db, { order: raced, quantities: { [DISH]: 1 } })
  eq(await run(db, 'authenticated', U.cashier, INSERT_ORDER, [raced, T, OUTLET, 'pos', POS_DATA]), 1, 'raced sale written')
  await sell(db, raced, -1, -1)
  eq((await activityFor(db, raced)).map((row) => row.flags), [['oversold_unapproved']],
    'a sale that oversold without an approval is flagged oversold_unapproved')

  const inactive = orderId()
  eq(await run(db, 'authenticated', U.cashier, INSERT_ORDER, [inactive, T, OUTLET, 'pos', OFFLINE_DATA]), 1, 'offline order')
  await sell(db, inactive, -1, -1, { item: OFF_FLOUR })
  eq(await activityFor(db, inactive), [], 'an inactive ingredient is not judged (as producible.ts)')

  // --- edits are flagged, not refused --------------------------------------------
  await reset(db)
  await db.query('insert into public.order_revisions (tenant_id, order_id, revision_number) values ($1, $2, 1)', [T, fits])
  eq(await run(db, 'authenticated', U.cashier, ...insertItems(fits, [[DISH, 3], [DISH_2, 1]])), 2,
    'an edit (revision claimed first) re-inserts its items; the ledger flags an oversell instead')

  // --- service role + web checkout untouched ---------------------------------------
  const svc = orderId()
  eq(await run(db, 'service_role', null, INSERT_ORDER, [svc, T, OUTLET, 'web', '{}']), 1,
    'the service role (web checkout) writes on a block store without a clearance')
  eq(await run(db, 'service_role', null, ...insertItems(svc, [[DISH, 9]])), 1, 'and its items')
  await sell(db, svc, -9, -9)
  eq(await activityFor(db, svc), [], 'a web order is never reported as a register oversell')
  const anonOrder = orderId()
  eq(await run(db, 'anon', null, INSERT_ORDER, [anonOrder, T, null, 'web', '{}']), 1,
    'anon checkout writes on a block store')
  eq(await run(db, 'anon', null, ...insertItems(anonOrder, [[DISH, 9]])), 1, 'and its items')

  const warnSale = orderId()
  eq(await run(db, 'authenticated', U.warnCashier, INSERT_ORDER, [warnSale, T_WARN, null, 'pos', POS_DATA]), 1, 'warn sale')
  await sell(db, warnSale, -4, -4, { tenant: T_WARN })
  eq(await activityFor(db, warnSale), [], 'a warn store is never flagged')

  // --- vocabulary --------------------------------------------------------------------
  await reset(db)
  eq((await db.query("select public.store_activity_category_of('stock.oversold') as c")).rows, [{ c: 'stock' }],
    'stock.oversold is a stock kind')
  eq((await db.query("select public.store_activity_category_of('day.closed') as c")).rows, [{ c: 'cash' }],
    'every earlier kind keeps its category')

  console.log(`pos stock block server: ${checks} checks passed`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
