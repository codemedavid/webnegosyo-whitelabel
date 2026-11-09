// Inventory sweep, database half (2026-11-07), pinned in PGlite.
//
// Loads the inventory slice of the live platform schema
// (tests/sql/lib/inventory-live-schema.cjs) plus the tenants / menu_items /
// orders / order_items pieces these migrations touch (policies and function
// bodies as live had them), then the REAL migrations
//   20261107120000_inventory_flags_and_policies.sql
//   20261107120100_anon_order_line_limits.sql
//   20261107120200_drop_anon_order_inserts.sql   (last: it removes anon checkout)
// and checks, as the role that really runs the query, affected rows per role.
//   hole    must be refused (or touch 0 rows) after the migrations
//   compat  a write/read the product makes; must keep working
//
//   node tests/sql/run-inventory-flags-and-policies.cjs             must pass
//   node tests/sql/run-inventory-flags-and-policies.cjs --baseline  live schema only:
//        passes only if EVERY hole is open there and every compat check works.
const { PGlite } = require('@electric-sql/pglite')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')
const { installInventorySchema } = require('./lib/inventory-live-schema.cjs')

const MIGRATIONS = [
  '20261107120000_inventory_flags_and_policies.sql',
  '20261107120100_anon_order_line_limits.sql',
]
const DROP_ANON_ORDERS = '20261107120200_drop_anon_order_inserts.sql'
const IS_BASELINE = process.argv.includes('--baseline')

const T_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_B = 'bbbbbbbb-0000-4000-8000-000000000001'
const OUT_A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const OUT_A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const OUT_B1 = 'bbbbbbbb-0000-4000-8000-0000000000b1'

const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  inv: '00000000-0000-4000-8000-000000000002',
  menu: '00000000-0000-4000-8000-000000000003',
  branchA1: '00000000-0000-4000-8000-000000000004',
  analytics: '00000000-0000-4000-8000-000000000005',
  settings: '00000000-0000-4000-8000-000000000006',
  ownerB: '00000000-0000-4000-8000-000000000007',
  superadmin: '00000000-0000-4000-8000-000000000008',
  orders: '00000000-0000-4000-8000-000000000009',
}
const id = (group, n) => `cccccccc-${String(group).padStart(4, '0')}-4000-8000-${String(n).padStart(12, '0')}`
const UNIT = id(1, 1)
const ITEM = id(2, 1)
const ITEM2 = id(2, 2)
const MENU = { a: id(3, 1), b: id(3, 2), a2: id(3, 3) }
const COUNT = id(4, 1)
const TRANSFER = id(5, 1)
const ORDER = { a: id(6, 1), b: id(6, 2), full: id(6, 3), almost: id(6, 4) }

// ---------------------------------------------------------------------------
// Pieces of the live schema the shared inventory slice does not carry.
// ---------------------------------------------------------------------------
const EXTRA_SCHEMA = String.raw`
  alter table tenants add column note text, add column is_active boolean default true,
    add column auto_86_enabled boolean not null default false,
    add column low_stock_alerts_enabled boolean not null default false;
  alter table menu_items add column name text default 'Dish', add column price numeric default 1,
    add column is_available boolean default true, add column is_featured boolean default false,
    add column badge_text text, add column bcg_classification text,
    add column show_in_checkout_upsell boolean default false, add column updated_at timestamptz default now();

  -- guard_tenant_privileged_columns: the LIVE list before this migration.
  CREATE OR REPLACE FUNCTION public.guard_tenant_privileged_columns()
   RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
  AS $function$
  declare
    privileged constant text[] := array['id', 'created_at', 'slug', 'is_active', 'assistant_enabled'];
    old_row jsonb; new_row jsonb; col text;
  begin
    if current_user not in ('authenticated', 'anon') then return new; end if;
    if exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin') then
      return new;
    end if;
    old_row := to_jsonb(old); new_row := to_jsonb(new);
    foreach col in array privileged loop
      if (new_row -> col) is distinct from (old_row -> col) then
        raise exception 'Only a platform administrator can change tenants.%', col using errcode = '42501';
      end if;
    end loop;
    return new;
  end;
  $function$;
  create trigger tenants_guard before update on tenants for each row execute function guard_tenant_privileged_columns();

  alter table tenants enable row level security;
  create policy tenants_read on tenants for select using (true);
  create policy tenants_write_staff on tenants for update to authenticated
    using (app_user_has_permission(id, 'store_setup') or app_user_has_permission(id, 'settings') or app_user_has_permission(id, 'analytics'))
    with check (app_user_has_permission(id, 'store_setup') or app_user_has_permission(id, 'settings') or app_user_has_permission(id, 'analytics'));

  alter table menu_items enable row level security;
  create policy menu_items_select_all on menu_items for select using (true);
  create policy menu_items_delete_staff on menu_items for delete to authenticated
    using (app_user_has_permission(tenant_id, 'menu'::text) OR app_user_has_permission(tenant_id, 'analytics'::text));
  create policy menu_items_insert_staff on menu_items for insert to authenticated
    with check (app_user_has_permission(tenant_id, 'menu'::text) OR app_user_has_permission(tenant_id, 'analytics'::text));
  create policy menu_items_update_staff on menu_items for update to authenticated
    using (app_user_has_permission(tenant_id, 'menu'::text) OR app_user_has_permission(tenant_id, 'analytics'::text))
    with check (app_user_has_permission(tenant_id, 'menu'::text) OR app_user_has_permission(tenant_id, 'analytics'::text));

  create table orders (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
    status text not null default 'pending', payment_status text not null default 'pending',
    created_at timestamptz not null default now());
  create table order_items (id uuid primary key default gen_random_uuid(),
    order_id uuid not null references orders(id) on delete cascade, menu_item_id uuid,
    quantity integer not null, price numeric not null default 0);
  alter table orders enable row level security;
  alter table order_items enable row level security;

  CREATE OR REPLACE FUNCTION public.order_accepts_anon_items(p_order_id uuid)
   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
  AS $function$
    select exists (
      select 1 from public.orders o
      where o.id = p_order_id and o.status = 'pending' and o.created_at > (now() - interval '15 minutes')
    );
  $function$;
  revoke execute on function public.order_accepts_anon_items(uuid) from public, authenticated;
  grant execute on function public.order_accepts_anon_items(uuid) to anon;

  create policy orders_insert_customer on orders for insert to anon
    with check (status = 'pending' and payment_status = 'pending');
  create policy orders_select_staff on orders for select to authenticated using (app_user_has_permission(tenant_id, 'orders'));
  create policy orders_insert_admin on orders for insert to authenticated
    with check (app_user_has_permission(tenant_id, 'orders'));
  create policy order_items_insert_customer on order_items for insert to anon
    with check (order_accepts_anon_items(order_id));
  create policy order_items_write_admin on order_items for all to authenticated
    using (exists (select 1 from orders o where o.id = order_items.order_id and app_user_has_permission(o.tenant_id, 'orders')))
    with check (exists (select 1 from orders o where o.id = order_items.order_id and app_user_has_permission(o.tenant_id, 'orders')));
`

const SEED = String.raw`
  insert into tenants (id) values ('${T_A}'), ('${T_B}');
  insert into outlets (id, tenant_id, name) values ('${OUT_A1}', '${T_A}', 'A1'), ('${OUT_A2}', '${T_A}', 'A2'), ('${OUT_B1}', '${T_B}', 'B1');
  insert into auth.users select unnest(array[${Object.values(U).map((u) => `'${u}'::uuid`).join(',')}]);
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id) values
    ('${U.owner}',      'admin', '${T_A}', true,  '{}',                null),
    ('${U.inv}',        'admin', '${T_A}', false, '{inventory}',       null),
    ('${U.menu}',       'admin', '${T_A}', false, '{menu}',            null),
    ('${U.branchA1}',   'admin', '${T_A}', false, '{inventory,menu}',  '${OUT_A1}'),
    ('${U.analytics}',  'admin', '${T_A}', false, '{analytics}',       null),
    ('${U.settings}',   'admin', '${T_A}', false, '{store_setup,settings}', null),
    ('${U.orders}',     'admin', '${T_A}', false, '{orders}',          null),
    ('${U.ownerB}',     'admin', '${T_B}', true,  '{}',                null),
    ('${U.superadmin}', 'superadmin', null, false, null,               null);
  insert into inventory_units (id, tenant_id, name, abbreviation, dimension, to_base_factor) values ('${UNIT}', '${T_A}', 'Kilogram', 'kg', 'weight', 1000);
  insert into inventory_items (id, tenant_id, name, stock_unit_id) values ('${ITEM}', '${T_A}', 'Beef', '${UNIT}');
  insert into inventory_items (id, tenant_id, name, stock_unit_id) values ('${ITEM2}', '${T_A}', 'Pork', '${UNIT}');
  insert into inventory_stock (tenant_id, inventory_item_id, outlet_id) values ('${T_A}', '${ITEM}', '${OUT_A1}');
  insert into menu_items (id, tenant_id) values ('${MENU.a}', '${T_A}'), ('${MENU.a2}', '${T_A}'), ('${MENU.b}', '${T_B}');
  insert into inventory_counts (id, tenant_id, outlet_id) values ('${COUNT}', '${T_A}', '${OUT_A1}');
  insert into stock_transfers (id, tenant_id, from_outlet_id, to_outlet_id) values ('${TRANSFER}', '${T_A}', '${OUT_A1}', '${OUT_A2}');
  insert into stock_transfer_lines (tenant_id, transfer_id, inventory_item_id, sent_quantity) values ('${T_A}', '${TRANSFER}', '${ITEM}', 3);
  insert into orders (id, tenant_id) values ('${ORDER.a}', '${T_A}'), ('${ORDER.b}', '${T_B}'), ('${ORDER.full}', '${T_A}'), ('${ORDER.almost}', '${T_A}');
  insert into order_items (order_id, menu_item_id, quantity) select '${ORDER.full}', '${MENU.a}', 1 from generate_series(1, 100);
  insert into order_items (order_id, menu_item_id, quantity) select '${ORDER.almost}', '${MENU.a}', 1 from generate_series(1, 99);
`

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------
const results = []
const actAs = (db, actor) => (actor === 'anon' ? asAnon(db) : actor === 'service' ? as(db, 'service_role', null) : as(db, 'authenticated', U[actor]))

async function attempt(db, actor, sql, params = []) {
  await db.exec('begin')
  try {
    await actAs(db, actor)
    const result = await db.query(sql, params)
    return result.affectedRows || result.rows.length
  } catch (error) {
    return `refused: ${error.message}`
  } finally {
    await db.exec('rollback')
    await reset(db)
  }
}
const isRefused = (o) => typeof o === 'string' && o.startsWith('refused')
const record = (kind, name, isOk, detail) => results.push({ kind, name, isOk, detail })

/** Must be refused or touch 0 rows; optionally the refusal must match `pattern`. */
async function hole(db, name, actor, sql, pattern) {
  const outcome = await attempt(db, actor, sql)
  const isMatch = pattern ? isRefused(outcome) && pattern.test(outcome) : isRefused(outcome) || outcome === 0
  record('hole', name, isMatch, outcome)
}
/** Already refused live and must stay refused. */
async function staysRefused(db, name, actor, sql) {
  const outcome = await attempt(db, actor, sql)
  record('compat', name, isRefused(outcome) || outcome === 0, outcome)
}
async function compat(db, name, actor, sql, rows = 1) {
  const outcome = await attempt(db, actor, sql)
  record('compat', name, outcome === rows, outcome)
}
const setup = async (db, sql) => { await reset(db); await db.exec(sql) }

// ---------------------------------------------------------------------------
// a. privileged tenant flags
// ---------------------------------------------------------------------------
async function checkFlags(db) {
  for (const col of ['auto_86_enabled', 'low_stock_alerts_enabled']) {
    const sql = `update tenants set ${col} = true where id = '${T_A}'`
    await hole(db, `a. store_setup/settings staff cannot flip ${col}`, 'settings', sql, /platform administrator/)
    await hole(db, `a. analytics staff cannot flip ${col}`, 'analytics', sql, /platform administrator/)
    await hole(db, `a. owner cannot flip ${col}`, 'owner', sql, /platform administrator/)
    await compat(db, `a. superadmin can flip ${col}`, 'superadmin', sql)
    await compat(db, `a. service role (superadmin form) can flip ${col}`, 'service', sql)
  }
  await compat(db, 'a. staff can still write a non-privileged tenant column', 'settings', `update tenants set note = 'hi' where id = '${T_A}'`)
}

// ---------------------------------------------------------------------------
// b. read/write split on the branch policies
// ---------------------------------------------------------------------------
const WRITES = {
  inventory_counts: {
    insert: (outlet) => `insert into inventory_counts (tenant_id, outlet_id, business_day) values ('${T_A}', '${outlet}', '2026-11-07')`,
    update: `update inventory_counts set note = 'n' where id = '${COUNT}'`,
    del: `delete from inventory_counts where id = '${COUNT}'`,
    read: `select id from inventory_counts`,
  },
  stock_transfers: {
    insert: () => `insert into stock_transfers (tenant_id, from_outlet_id, to_outlet_id) values ('${T_A}', '${OUT_A1}', '${OUT_A2}')`,
    update: `update stock_transfers set note = 'n' where id = '${TRANSFER}'`,
    del: `delete from stock_transfers where id = '${TRANSFER}'`,
    read: `select id from stock_transfers`,
  },
  stock_transfer_lines: {
    insert: () => `insert into stock_transfer_lines (tenant_id, transfer_id, inventory_item_id, sent_quantity) values ('${T_A}', '${TRANSFER}', '${ITEM2}', 1)`,
    update: `update stock_transfer_lines set sent_quantity = 2 where transfer_id = '${TRANSFER}'`,
    del: `delete from stock_transfer_lines where transfer_id = '${TRANSFER}'`,
    read: `select id from stock_transfer_lines`,
  },
  inventory_stock: {
    insert: () => `insert into inventory_stock (tenant_id, inventory_item_id, outlet_id) values ('${T_A}', '${ITEM}', '${OUT_A2}')`,
    update: `update inventory_stock set reorder_level = 1 where inventory_item_id = '${ITEM}'`,
    del: null,
    read: `select id from inventory_stock`,
  },
}

async function checkPolicies(db) {
  // Reads keep working for everyone who could read before.
  for (const [table, w] of Object.entries(WRITES)) {
    await compat(db, `b. ${table}: menu-only staff still reads`, 'menu', w.read, 1)
    await compat(db, `b. ${table}: owner still reads`, 'owner', w.read, 1)
    await compat(db, `b. ${table}: another store reads nothing`, 'ownerB', w.read, 0)
  }
  // The product's own writes (with the write triggers on, as live).
  await compat(db, 'b. inventory-key staff starts a count', 'inv', WRITES.inventory_counts.insert(OUT_A1))
  await compat(db, 'b. inventory-key staff drafts a transfer', 'inv', WRITES.stock_transfers.insert())
  await compat(db, 'b. inventory-key staff adds a transfer line', 'inv', WRITES.stock_transfer_lines.insert())
  await compat(db, 'b. inventory-key staff edits a shelf', 'inv', WRITES.inventory_stock.update)
  await compat(db, 'b. branch account counts its own branch', 'branchA1', WRITES.inventory_counts.insert(OUT_A1))
  await staysRefused(db, 'b. branch account cannot count another branch', 'branchA1', WRITES.inventory_counts.insert(OUT_A2))
  await compat(db, 'b. superadmin still writes', 'superadmin', WRITES.inventory_counts.insert(OUT_A1))
  // A delivery creates the branch shelf as the caller, one trigger level down.
  await compat(db, 'b. a receive creates the shelf through apply_stock_movement', 'owner',
    `insert into stock_movements (tenant_id, inventory_item_id, reason, quantity_delta, outlet_id) values ('${T_A}', '${ITEM}', 'receive', 5, '${OUT_A2}')`)
  await compat(db, 'b. a receive on an existing shelf updates it', 'branchA1',
    `insert into stock_movements (tenant_id, inventory_item_id, reason, quantity_delta, outlet_id) values ('${T_A}', '${ITEM}', 'receive', 5, '${OUT_A1}')`)

  // Policy level on its own: switch the 2026-11-03 write triggers off so only RLS decides.
  await setup(db, `
    alter table inventory_counts disable trigger user; alter table stock_transfers disable trigger user;
    alter table stock_transfer_lines disable trigger user; alter table inventory_stock disable trigger user;`)
  for (const [table, w] of Object.entries(WRITES)) {
    await hole(db, `b. ${table}: menu-only staff cannot insert (policy)`, 'menu', w.insert(OUT_A1), /row-level security/)
    await hole(db, `b. ${table}: menu-only staff cannot update (policy)`, 'menu', w.update)
    if (w.del) await hole(db, `b. ${table}: menu-only staff cannot delete (policy)`, 'menu', w.del)
    await compat(db, `b. ${table}: inventory-key staff can update (policy)`, 'inv', w.update, 1)
  }
  await setup(db, `
    alter table inventory_counts enable trigger user; alter table stock_transfers enable trigger user;
    alter table stock_transfer_lines enable trigger user; alter table inventory_stock enable trigger user;`)
}

// ---------------------------------------------------------------------------
// c. anon write grants
// ---------------------------------------------------------------------------
const ANON_TABLES = ['inventory_items', 'inventory_stock', 'inventory_units', 'stock_movements', 'recipes', 'recipe_components',
  'order_stock_applications', 'stock_alerts', 'stock_transfers', 'stock_transfer_lines', 'inventory_counts']

async function checkAnonGrants(db) {
  const { rows } = await db.query(`select to_regclass('public.order_stock_applications') as t`)
  for (const table of ANON_TABLES) {
    if (table === 'order_stock_applications' && !rows[0].t) continue
    await hole(db, `c. anon cannot insert into ${table}`, 'anon', `insert into ${table} default values`, /permission denied/)
    await hole(db, `c. anon cannot update ${table}`, 'anon', `update ${table} set tenant_id = tenant_id`, /permission denied/)
    await hole(db, `c. anon cannot delete from ${table}`, 'anon', `delete from ${table}`, /permission denied/)
  }
  for (const table of ['inventory_items', 'recipes', 'recipe_components', 'stock_movements']) {
    const outcome = await attempt(db, 'anon', `select 1 from ${table} limit 1`)
    record('compat', `c. anon can still select ${table}`, !isRefused(outcome), outcome)
  }
  await compat(db, 'c. service role still writes stock', 'service',
    `insert into stock_movements (tenant_id, inventory_item_id, reason, quantity_delta, outlet_id) values ('${T_A}', '${ITEM}', 'sale', -1, '${OUT_A1}')`)
}

// ---------------------------------------------------------------------------
// d. menu_items column guard
// ---------------------------------------------------------------------------
async function checkMenuItems(db) {
  const set = (assign) => `update menu_items set ${assign} where id = '${MENU.a}'`
  for (const assign of ['is_featured = true', `badge_text = 'Best'`, `bcg_classification = 'star'`, 'show_in_checkout_upsell = true']) {
    await compat(db, `d. analytics-only staff can set ${assign.split(' ')[0]}`, 'analytics', set(assign))
  }
  for (const assign of ['price = 0.01', `name = 'Free'`, 'is_available = false']) {
    await hole(db, `d. analytics-only staff cannot set ${assign.split(' ')[0]}`, 'analytics', set(assign), /Menu permission/)
  }
  await hole(db, 'd. analytics-only staff cannot mix a menu column into a Boost write', 'analytics', set(`is_featured = true, price = 0.01`), /Menu permission/)
  await hole(db, 'd. analytics-only staff cannot create a dish', 'analytics',
    `insert into menu_items (tenant_id) values ('${T_A}')`, /row-level security/)
  await hole(db, 'd. analytics-only staff cannot delete a dish', 'analytics', `delete from menu_items where id = '${MENU.a2}'`)
  await compat(db, 'd. menu staff still sets price', 'menu', set('price = 5'))
  await compat(db, 'd. menu staff still creates a dish', 'menu', `insert into menu_items (tenant_id) values ('${T_A}')`)
  await compat(db, 'd. menu staff still deletes a dish', 'menu', `delete from menu_items where id = '${MENU.a2}'`)
  await compat(db, 'd. owner still sets price', 'owner', set('price = 6'))
  await compat(db, 'd. superadmin still sets price', 'superadmin', set('price = 7'))
  await compat(db, 'd. service role still sets price', 'service', set('price = 8'))
  await staysRefused(db, 'd. another store cannot touch the dish', 'ownerB', set('price = 9'))
}

// ---------------------------------------------------------------------------
// Anonymous order lines (20261107120100)
// ---------------------------------------------------------------------------
async function checkAnonLines(db) {
  const line = (order, item, qty) => `insert into order_items (order_id, menu_item_id, quantity) values ('${order}', ${item ? `'${item}'` : 'null'}, ${qty})`
  await compat(db, 'anon adds a normal line', 'anon', line(ORDER.a, MENU.a, 2))
  await compat(db, 'anon adds a line at the quantity cap (99)', 'anon', line(ORDER.a, MENU.a, 99))
  await compat(db, 'anon adds a line with no dish id', 'anon', line(ORDER.a, null, 1))
  await compat(db, 'anon adds the 100th line of an order', 'anon', line(ORDER.almost, MENU.a, 1))
  await hole(db, 'anon cannot add quantity 0', 'anon', line(ORDER.a, MENU.a, 0), /quantity from 1 to 99/)
  await hole(db, 'anon cannot add quantity 100', 'anon', line(ORDER.a, MENU.a, 100), /quantity from 1 to 99/)
  await hole(db, 'anon cannot add a negative quantity', 'anon', line(ORDER.a, MENU.a, -3), /quantity from 1 to 99/)
  await hole(db, 'anon cannot put another store\'s dish on an order', 'anon', line(ORDER.a, MENU.b, 1), /cannot take that line/)
  await hole(db, 'anon cannot add the 101st line', 'anon', line(ORDER.full, MENU.a, 1), /cannot take that line/)
  await compat(db, 'staff are not limited by the anon trigger', 'orders', line(ORDER.a, MENU.a, 500))
  await compat(db, 'service role is not limited', 'service', line(ORDER.a, MENU.b, 500))
}

// ---------------------------------------------------------------------------
// Dropping direct anon order inserts (20261107120200)
// ---------------------------------------------------------------------------
async function checkDropAnonInserts(db) {
  const order = `insert into orders (tenant_id) values ('${T_A}')`
  const orderForStaff = `insert into orders (tenant_id) values ('${T_A}')`
  const line = `insert into order_items (order_id, menu_item_id, quantity) values ('${ORDER.a}', '${MENU.a}', 1)`
  await compat(db, 'orders: staff insert works', 'orders', orderForStaff)
  await compat(db, 'orders: service role insert works', 'service', order)
  await hole(db, 'orders: anon can no longer insert an order', 'anon', order, /row-level security/)
  await hole(db, 'orders: anon can no longer insert a line', 'anon', line, /row-level security/)
  await compat(db, 'orders: staff line insert works', 'orders', line)
}

async function main() {
  const db = new PGlite()
  try {
    await installPlatformAuth(db)
    await installInventorySchema(db)
    await db.exec(EXTRA_SCHEMA)
    await db.exec(SEED)
    // "Before" for the order-drop migration: anon checkout works today.
    await compat(db, 'before the drop: anon can insert an order', 'anon', `insert into orders (tenant_id) values ('${T_A}')`)
    if (!IS_BASELINE) {
      for (const name of MIGRATIONS) {
        await db.exec(readMigration(name))
        await db.exec(readMigration(name)) // idempotent
      }
    }
    await checkFlags(db)
    await checkPolicies(db)
    await checkAnonGrants(db)
    await checkMenuItems(db)
    await checkAnonLines(db)
    if (!IS_BASELINE) await db.exec(readMigration(DROP_ANON_ORDERS))
    await checkDropAnonInserts(db)
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
  for (const r of failed) console.log(`FAIL [${r.kind}] ${r.name} -> ${JSON.stringify(r.detail)}`)
  console.log(`${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length > 0) process.exitCode = 1
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
