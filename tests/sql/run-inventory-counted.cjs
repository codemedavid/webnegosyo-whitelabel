// Stock tracking starts at the first count (20261103120000), pinned in PGlite
// as the role that really runs each query.
//
// Loads the REAL migration over a stub of the three inventory tables (columns
// the migration reads, no RLS — the guards under test are triggers). Asserts:
//   - a delivery / count / transfer arrival marks the ingredient AND that shelf
//     counted, once (the first instant stays); a sale or waste never does;
//   - the marker is written as the definer even when the caller is a client;
//   - a client can neither set nor clear counted_at, on insert or update;
//   - the backfill: first counting movement, else "holds stock", else NULL.
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, reset, readMigration } = require('./lib/platform-auth.cjs')

const T = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_B = 'bbbbbbbb-0000-4000-8000-000000000001'
const OUT = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const I = {
  received: '10000000-0000-4000-8000-000000000001',
  soldOnly: '10000000-0000-4000-8000-000000000002',
  opening: '10000000-0000-4000-8000-000000000003',
  fresh: '10000000-0000-4000-8000-000000000004',
  other: '10000000-0000-4000-8000-000000000005',
}
const USER = '00000000-0000-4000-8000-000000000001'

const STUB = `
  create table tenants (id uuid primary key);
  create table outlets (id uuid primary key, tenant_id uuid);
  create table menu_items (id uuid primary key, tenant_id uuid);
  create table inventory_items (
    id uuid primary key, tenant_id uuid not null, name text, current_qty numeric(16,4) not null default 0,
    created_at timestamptz not null default now()
  );
  create table inventory_stock (
    id uuid primary key default gen_random_uuid(), tenant_id uuid not null, inventory_item_id uuid not null,
    outlet_id uuid, current_qty numeric(16,4) not null default 0, created_at timestamptz not null default now()
  );
  create table stock_movements (
    id uuid primary key default gen_random_uuid(), tenant_id uuid not null, inventory_item_id uuid not null,
    outlet_id uuid, reason text not null, quantity_delta numeric(16,4) not null,
    created_at timestamptz not null default now()
  );
`

// History BEFORE the migration, so the backfill has something to read.
const HISTORY = `
  insert into tenants values ('${T}'), ('${T_B}');
  insert into outlets values ('${OUT}', '${T}');
  insert into inventory_items (id, tenant_id, name, current_qty, created_at) values
    ('${I.received}', '${T}', 'Egg',   -1,  '2026-10-01T00:00:00Z'),
    ('${I.soldOnly}', '${T}', 'Straw', -56, '2026-10-01T00:00:00Z'),
    ('${I.opening}',  '${T}', 'Rice',  20,  '2026-10-02T00:00:00Z'),
    ('${I.fresh}',    '${T}', 'Cup',   0,   '2026-10-03T00:00:00Z'),
    ('${I.other}',    '${T_B}', 'Flour', 0, '2026-10-03T00:00:00Z');
  insert into inventory_stock (tenant_id, inventory_item_id, outlet_id, current_qty, created_at) values
    ('${T}', '${I.received}', null, -1, '2026-10-01T00:00:00Z'),
    ('${T}', '${I.received}', '${OUT}', 0, '2026-10-01T00:00:00Z'),
    ('${T}', '${I.soldOnly}', null, -56, '2026-10-01T00:00:00Z');
  insert into stock_movements (tenant_id, inventory_item_id, outlet_id, reason, quantity_delta, created_at) values
    ('${T}', '${I.received}', null, 'sale',    -1, '2026-10-04T00:00:00Z'),
    ('${T}', '${I.received}', null, 'receive', 12, '2026-10-05T00:00:00Z'),
    ('${T}', '${I.received}', null, 'receive', 12, '2026-10-06T00:00:00Z'),
    ('${T}', '${I.soldOnly}', null, 'sale',   -56, '2026-10-05T00:00:00Z');
`

let checks = 0
function eq(actual, expected, message) {
  checks += 1
  assert.deepEqual(actual, expected, message)
}
async function counted(db, table, where, params) {
  await reset(db)
  const { rows } = await db.query(`select counted_at from ${table} where ${where}`, params)
  return rows.length === 0 ? 'missing' : rows[0].counted_at === null ? null : new Date(rows[0].counted_at).toISOString()
}
const item = (db, id) => counted(db, 'inventory_items', 'id = $1', [id])
const shelf = (db, id, outlet) =>
  counted(db, 'inventory_stock', 'inventory_item_id = $1 and outlet_id is not distinct from $2', [id, outlet])

async function checkBackfill(db) {
  eq(await item(db, I.received), '2026-10-05T00:00:00.000Z', 'first delivery, not the earlier sale')
  eq(await shelf(db, I.received, null), '2026-10-05T00:00:00.000Z', 'store pool shelf: same first delivery')
  eq(await shelf(db, I.received, OUT), null, 'a branch that never received it stays uncounted')
  eq(await item(db, I.soldOnly), null, 'sold but never received: no limit')
  eq(await shelf(db, I.soldOnly, null), null, 'its shelf too')
  eq(await item(db, I.opening), '2026-10-02T00:00:00.000Z', 'opening stock with no movement counts from creation')
  eq(await item(db, I.fresh), null, 'zero and no history: uncounted')
}

async function checkLedgerMarks(db) {
  // A sale and a waste never start tracking.
  await as(db, 'authenticated', USER)
  await db.query(
    `insert into stock_movements (tenant_id, inventory_item_id, reason, quantity_delta) values ($1, $2, 'sale', -1), ($1, $2, 'waste', -1)`,
    [T, I.fresh],
  )
  eq(await item(db, I.fresh), null, 'sale/waste do not count an ingredient')

  // A client's stocktake does — written as the definer although the caller is
  // `authenticated` (the shelf exists because apply_stock_movement made it).
  await reset(db)
  await db.query(`insert into inventory_stock (tenant_id, inventory_item_id, outlet_id) values ($1, $2, $3)`, [T, I.fresh, OUT])
  await as(db, 'authenticated', USER)
  await db.query(
    `insert into stock_movements (tenant_id, inventory_item_id, outlet_id, reason, quantity_delta, created_at)
     values ($1, $2, $3, 'stocktake', 0, '2026-11-03T01:00:00Z')`,
    [T, I.fresh, OUT],
  )
  eq(await item(db, I.fresh), '2026-11-03T01:00:00.000Z', 'a count of zero still starts tracking (it is a real zero)')
  eq(await shelf(db, I.fresh, OUT), '2026-11-03T01:00:00.000Z', 'and marks that branch shelf')
  eq(await shelf(db, I.fresh, null), 'missing', 'no other shelf is touched')

  // A later transfer arrival keeps the first instant.
  await as(db, 'authenticated', USER)
  await db.query(
    `insert into stock_movements (tenant_id, inventory_item_id, outlet_id, reason, quantity_delta, created_at)
     values ($1, $2, $3, 'transfer_in', 4, '2026-11-04T01:00:00Z')`,
    [T, I.fresh, OUT],
  )
  eq(await item(db, I.fresh), '2026-11-03T01:00:00.000Z', 'first count stays')

  // Another tenant's movement never marks this tenant's row (tenant predicate).
  await reset(db)
  await db.query(
    `insert into stock_movements (tenant_id, inventory_item_id, reason, quantity_delta) values ($1, $2, 'receive', 1)`,
    [T_B, I.soldOnly],
  )
  eq(await item(db, I.soldOnly), null, 'a movement filed under another tenant does not count this ingredient')
}

async function checkClientCannotWrite(db) {
  await as(db, 'authenticated', USER)
  await db.query(`update inventory_items set counted_at = null, name = 'Egg (large)' where id = $1`, [I.received])
  eq(await item(db, I.received), '2026-10-05T00:00:00.000Z', 'a client cannot clear counted_at (the rest of the edit lands)')
  await reset(db)
  const { rows } = await db.query(`select name from inventory_items where id = $1`, [I.received])
  eq(rows[0].name, 'Egg (large)', 'the ordinary edit was not refused')

  await as(db, 'authenticated', USER)
  await db.query(`update inventory_items set counted_at = now() where id = $1`, [I.soldOnly])
  eq(await item(db, I.soldOnly), null, 'a client cannot set counted_at')

  const newId = '10000000-0000-4000-8000-000000000099'
  await as(db, 'authenticated', USER)
  await db.query(`insert into inventory_items (id, tenant_id, name, counted_at) values ($1, $2, 'Lid', now())`, [newId, T])
  eq(await item(db, newId), null, 'a client insert starts uncounted')

  await as(db, 'authenticated', USER)
  await db.query(`update inventory_stock set counted_at = null where inventory_item_id = $1 and outlet_id is null`, [I.received])
  eq(await shelf(db, I.received, null), '2026-10-05T00:00:00.000Z', 'a client cannot clear a shelf counted_at')

  await as(db, 'service_role', null)
  await db.query(`update inventory_items set counted_at = null where id = $1`, [newId])
  await db.query(`update inventory_items set counted_at = '2026-11-01T00:00:00Z' where id = $1`, [newId])
  eq(await item(db, newId), '2026-11-01T00:00:00.000Z', 'the service role may set it (repairs, imports)')
}

async function checkGrants(db) {
  await reset(db)
  const { rows } = await db.query(`
    select has_function_privilege('authenticated', 'public.stock_movements_mark_counted()', 'execute') as auth_exec,
           has_function_privilege('anon', 'public.inventory_counted_at_guard()', 'execute') as anon_exec`)
  eq(rows[0], { auth_exec: false, anon_exec: false }, 'trigger functions are not callable by API roles')
}

async function main() {
  const db = new PGlite()
  await installPlatformAuth(db)
  await db.exec(STUB)
  await db.exec(HISTORY)
  await db.exec(readMigration('20261103120000_inventory_counted_and_sell_anyway.sql'))

  await checkBackfill(db)
  await checkLedgerMarks(db)
  await checkClientCannotWrite(db)
  await checkGrants(db)
  console.log(`inventory counted_at: ${checks} checks passed`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
