// Atomic transfer send / receive (20261107130200), pinned in PGlite on top of the
// 2026-11-03 hardening migrations. Same slice and harness as
// run-inventory-permission-hardening.cjs.
//
// Loads the inventory slice of the live platform schema with the policies,
// triggers and function bodies EXACTLY as live had them
// (tests/sql/lib/inventory-live-schema.cjs), then the REAL migrations
//   20261103130000_inventory_permission_hardening.sql      (M1 M2 L5)
//   20261103130100_inventory_transfer_count_lifecycle.sql  (M3 L1)
//   20261103130200_inventory_tenant_consistency.sql        (M5)
//   20261103130300_inventory_unit_and_delete_guards.sql    (L3 L4)
// and checks, as the role that really runs the query, who may write what:
// affected rows for UPDATE / DELETE (RLS refusals are silent), refusals for
// the rest. Every check is tagged:
//   hole    a write the audit found open; must be refused after the migrations
//   compat  a write the deployed web/app makes; must keep working
//
//   node tests/sql/run-inventory-permission-hardening.cjs             must pass
//   node tests/sql/run-inventory-permission-hardening.cjs --baseline  live schema only:
//        passes only if EVERY hole check is open there (so each check bites)
//        and every compat check already worked.
const { PGlite } = require('@electric-sql/pglite')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')
const { installInventorySchema } = require('./lib/inventory-live-schema.cjs')

const MIGRATIONS = [
  '20261103130000_inventory_permission_hardening.sql',
  '20261103130100_inventory_transfer_count_lifecycle.sql',
  '20261103130200_inventory_tenant_consistency.sql',
  '20261103130300_inventory_unit_and_delete_guards.sql',
  '20261107130200_stock_transfer_atomic_steps.sql',
]

const T_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_B = 'bbbbbbbb-0000-4000-8000-000000000001'
const OUT_A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const OUT_A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const OUT_B1 = 'bbbbbbbb-0000-4000-8000-0000000000b1'

const U = {
  ownerA: '00000000-0000-4000-8000-000000000001',
  invA: '00000000-0000-4000-8000-000000000002',
  menuA: '00000000-0000-4000-8000-000000000003',
  branchA1: '00000000-0000-4000-8000-000000000004',
  branchA2: '00000000-0000-4000-8000-000000000005',
  registerA: '00000000-0000-4000-8000-000000000006',
  ownerB: '00000000-0000-4000-8000-000000000007',
  superadmin: '00000000-0000-4000-8000-000000000008',
}

const id = (group, n) => `cccccccc-${String(group).padStart(4, '0')}-4000-8000-${String(n).padStart(12, '0')}`
const UNIT = { aKg: id(1, 1), aG: id(1, 2), aPack: id(1, 3), aSpare: id(1, 4), bKg: id(1, 5) }
const ITEM = { a: id(2, 1), aUnused: id(2, 2), aUnit: id(2, 3), b: id(2, 4), aSquat: id(2, 5) }
const MENU = { a: id(3, 1), b: id(3, 2) }
const RECIPE = { a: id(4, 1), b: id(4, 2) }
const ALERT = { aStore: id(5, 1), aA1: id(5, 2), aA2: id(5, 3) }
const TRANSFER_B = id(6, 1)

const SEED = `
  insert into tenants values ('${T_A}'), ('${T_B}');
  insert into outlets (id, tenant_id, name) values ('${OUT_A1}', '${T_A}', 'A1'), ('${OUT_A2}', '${T_A}', 'A2'), ('${OUT_B1}', '${T_B}', 'B1');
  insert into auth.users select unnest(array[${Object.values(U).map((u) => `'${u}'::uuid`).join(',')}]);
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id) values
    ('${U.ownerA}',     'admin', '${T_A}', true,  '{}',               null),
    ('${U.invA}',       'admin', '${T_A}', false, '{inventory}',      null),
    ('${U.menuA}',      'admin', '${T_A}', false, '{menu}',           null),
    ('${U.branchA1}',   'admin', '${T_A}', false, '{inventory,menu}', '${OUT_A1}'),
    ('${U.branchA2}',   'admin', '${T_A}', false, '{inventory,menu}', '${OUT_A2}'),
    ('${U.registerA}',  'admin', '${T_A}', false, '{pos}',            null),
    ('${U.ownerB}',     'admin', '${T_B}', true,  '{}',               null),
    ('${U.superadmin}', 'superadmin', null, false, null,              null);
  insert into inventory_units (id, tenant_id, name, abbreviation, dimension, to_base_factor) values
    ('${UNIT.aKg}', '${T_A}', 'Kilogram', 'kg', 'weight', 1000),
    ('${UNIT.aG}', '${T_A}', 'Gram', 'g', 'weight', 1),
    ('${UNIT.aPack}', '${T_A}', 'Pack', 'pack', 'count', 12),
    ('${UNIT.aSpare}', '${T_A}', 'Box', 'box', 'count', 24),
    ('${UNIT.bKg}', '${T_B}', 'Kilogram', 'kg', 'weight', 1000);
  insert into inventory_items (id, tenant_id, name, stock_unit_id) values
    ('${ITEM.a}', '${T_A}', 'Beef', '${UNIT.aKg}'),
    ('${ITEM.aUnused}', '${T_A}', 'Saffron', '${UNIT.aG}'),
    ('${ITEM.aUnit}', '${T_A}', 'Buns', '${UNIT.aPack}'),
    ('${ITEM.b}', '${T_B}', 'Pork', '${UNIT.bKg}'),
    ('${ITEM.aSquat}', '${T_A}', 'Garlic', '${UNIT.aG}');
  insert into menu_items (id, tenant_id) values ('${MENU.a}', '${T_A}'), ('${MENU.b}', '${T_B}');
  insert into recipes (id, tenant_id, target_type, menu_item_id) values
    ('${RECIPE.a}', '${T_A}', 'menu_item', '${MENU.a}'), ('${RECIPE.b}', '${T_B}', 'menu_item', '${MENU.b}');
  insert into recipe_components (tenant_id, recipe_id, inventory_item_id, quantity, unit_id) values
    ('${T_A}', '${RECIPE.a}', '${ITEM.a}', 150, '${UNIT.aG}');
  insert into presell_stock (tenant_id, menu_item_id, presell_date, stock_qty, sold_qty) values
    ('${T_A}', '${MENU.a}', '2026-12-24', 20, 5);
  insert into stock_transfers (id, tenant_id, from_outlet_id, to_outlet_id) values ('${TRANSFER_B}', '${T_B}', null, '${OUT_B1}');
`

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------
const results = []

function actAs(db, actor) {
  if (actor === 'anon') return asAnon(db)
  if (actor === 'service') return as(db, 'service_role', null)
  return as(db, 'authenticated', U[actor])
}

/** One statement as `actor` in a rolled-back transaction: affected rows, or 'refused: <message>'. */
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

/** Statements as `actor`, committed; throws on failure. Returns the last result. */
async function commitAs(db, actor, statements) {
  await db.exec('begin')
  try {
    await actAs(db, actor)
    let last
    for (const [sql, params] of statements) last = await db.query(sql, params ?? [])
    await reset(db)
    await db.exec('commit')
    return last
  } catch (error) {
    await db.exec('rollback')
    await reset(db)
    throw error
  }
}

const isRefused = (outcome) => typeof outcome === 'string' && outcome.startsWith('refused')

function record(kind, name, isOk, detail) {
  results.push({ kind, name, isOk, detail })
}

/** A write that must be refused (or touch 0 rows) after the migrations. */
async function hole(db, name, actor, sql, params) {
  const outcome = await attempt(db, actor, sql, params)
  record('hole', name, isRefused(outcome) || outcome === 0, outcome)
}

/** A write that was already refused live and must stay refused. */
async function staysRefused(db, name, actor, sql, params) {
  const outcome = await attempt(db, actor, sql, params)
  record('compat', name, isRefused(outcome) || outcome === 0, outcome)
}

/** A write the product makes; must still touch `rows` rows. */
async function compat(db, name, actor, sql, params, rows = 1) {
  const outcome = await attempt(db, actor, sql, params)
  record('compat', name, outcome === rows, outcome)
}

async function scalar(db, sql, params = []) {
  await reset(db)
  const { rows } = await db.query(sql, params)
  return rows[0] ? Object.values(rows[0])[0] : undefined
}

const movement = (reason, qty, outlet, extra = {}) => {
  const cols = { tenant_id: T_A, inventory_item_id: ITEM.a, reason, quantity_delta: qty, outlet_id: outlet, ...extra }
  const keys = Object.keys(cols)
  return [`insert into stock_movements (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')})`, keys.map((k) => cols[k])]
}


const jleg = (reason, qty, outlet) => ({ inventory_item_id: ITEM.a, outlet_id: outlet, reason, quantity_delta: qty })
const send = (id, legs) => [`select public.send_stock_transfer($1, $2::jsonb)`, [id, JSON.stringify(legs)]]
const receive = (id, legs, counts) => [`select public.receive_stock_transfer($1, $2::jsonb, $3::jsonb)`, [id, JSON.stringify(legs), JSON.stringify(counts)]]

async function newDraft(db) {
  const result = await commitAs(db, 'branchA1', [[
    `insert into stock_transfers (tenant_id, from_outlet_id, to_outlet_id, status) values ($1, $2, $3, 'draft') returning id`, [T_A, OUT_A1, OUT_A2]]])
  const id = result.rows[0].id
  await commitAs(db, 'branchA1', [[
    `insert into stock_transfer_lines (tenant_id, transfer_id, inventory_item_id, sent_quantity) values ($1, $2, $3, 4)`, [T_A, id, ITEM.a]]])
  return id
}
const legCount = (db, id) => scalar(db, `select count(*)::int from stock_movements where stock_transfer_id = $1`, [id])
const statusOf = (db, id) => scalar(db, `select status from stock_transfers where id = $1`, [id])
const shelf = (db, outlet) => scalar(db, `select coalesce(sum(current_qty), 0)::float from inventory_stock where inventory_item_id = $1 and outlet_id = $2`, [ITEM.a, outlet])

async function run(db, name, actor, statements, expectOk) {
  try {
    await commitAs(db, actor, statements)
    record('compat', name, expectOk, expectOk ? 'ok' : 'unexpectedly allowed')
  } catch (error) {
    record(expectOk ? 'compat' : 'hole', name, !expectOk, error.message)
  }
}

async function check(db) {
  const a1Before = await shelf(db, OUT_A1)
  const t1 = await newDraft(db)

  // A failure part-way (the second leg is larger than what was sent) leaves
  // NOTHING behind: no leg, still a draft, so the retry is possible.
  await run(db, 'send with a bad second leg is refused', 'branchA1',
    [send(t1, [jleg('transfer_out', -4, OUT_A1), jleg('transfer_out', -400, OUT_A1)])], false)
  record('compat', 'a refused send wrote no leg', (await legCount(db, t1)) === 0, await legCount(db, t1))
  record('compat', 'a refused send leaves the transfer a draft', (await statusOf(db, t1)) === 'draft', await statusOf(db, t1))

  await run(db, 'the receiving branch cannot send the sender\'s draft', 'branchA2', [send(t1, [jleg('transfer_out', -4, OUT_A1)])], false)
  await run(db, 'a register-only account cannot send', 'registerA', [send(t1, [jleg('transfer_out', -4, OUT_A1)])], false)
  await run(db, 'another store\'s owner cannot send', 'ownerB', [send(t1, [jleg('transfer_out', -4, OUT_A1)])], false)
  record('compat', 'refused sends left the draft untouched', (await legCount(db, t1)) === 0 && (await statusOf(db, t1)) === 'draft')

  // A caller cannot smuggle another reason through the send.
  await run(db, 'a send cannot write a receive leg on the receiving shelf', 'branchA1', [send(t1, [jleg('transfer_in', 4, OUT_A2)])], false)

  await run(db, 'the retry after the failure sends', 'branchA1', [send(t1, [jleg('transfer_out', -4, OUT_A1)])], true)
  record('compat', 'send wrote one leg and flipped to sent', (await legCount(db, t1)) === 1 && (await statusOf(db, t1)) === 'sent')
  record('compat', 'send stamped who and when', (await scalar(db, `select sent_by::text || sent_at is not null from stock_transfers where id = $1`, [t1])) !== null)
  record('compat', 'send took the stock off the sender\'s shelf', (await shelf(db, OUT_A1)) === a1Before - 4, await shelf(db, OUT_A1))

  // The second tab / a replay is refused and writes nothing.
  await run(db, 'a second send of the same transfer is refused', 'branchA1', [send(t1, [jleg('transfer_out', -4, OUT_A1)])], false)
  record('compat', 'the replay added no leg', (await legCount(db, t1)) === 1, await legCount(db, t1))

  // Receive: wrong branch, unknown count, then the real one with a shortfall.
  await run(db, 'the sender cannot count its own delivery in', 'branchA1',
    [receive(t1, [jleg('transfer_in', 3, OUT_A2)], { [ITEM.a]: 3 })], false)
  await run(db, 'a count for something not on the transfer is refused', 'branchA2',
    [receive(t1, [jleg('transfer_in', 3, OUT_A2)], { [ITEM.aUnit]: 3 })], false)
  record('compat', 'refused receives wrote nothing', (await legCount(db, t1)) === 1 && (await statusOf(db, t1)) === 'sent')

  // A branch-locked receiver cannot write the shortfall legs on the SENDER's
  // shelf (RLS). Before this migration the transfer_in leg had already landed
  // by then, stranding a half-received transfer; now the whole receipt rolls back.
  await run(db, 'branch receiver with a shortfall is refused as a whole', 'branchA2', [receive(t1, [
    jleg('transfer_in', 3, OUT_A2), jleg('transfer_in', 1, OUT_A1), jleg('waste', -1, OUT_A1),
  ], { [ITEM.a]: 3 })], false)
  record('compat', 'that refusal stranded no receiving leg', (await legCount(db, t1)) === 1 && (await statusOf(db, t1)) === 'sent')

  const a2Before = await shelf(db, OUT_A2)
  await run(db, 'store-wide account counts in 3 of 4 (shortfall written off at the sender)', 'ownerA', [receive(t1, [
    jleg('transfer_in', 3, OUT_A2), jleg('transfer_in', 1, OUT_A1), jleg('waste', -1, OUT_A1),
  ], { [ITEM.a]: 3 })], true)
  record('compat', 'receive flipped to received', (await statusOf(db, t1)) === 'received')
  record('compat', 'receive recorded what arrived', Number(await scalar(db, `select received_quantity from stock_transfer_lines where transfer_id = $1`, [t1])) === 3)
  record('compat', 'receiver\'s shelf gained 3', (await shelf(db, OUT_A2)) === a2Before + 3, await shelf(db, OUT_A2))
  record('compat', 'sender is down exactly 4 overall (out 4, back 1, written off 1)', (await shelf(db, OUT_A1)) === a1Before - 4, await shelf(db, OUT_A1))
  await run(db, 'a second receive is refused', 'ownerA', [receive(t1, [jleg('transfer_in', 3, OUT_A2)], { [ITEM.a]: 3 })], false)

  // Failure during receive (bad second leg) rolls the whole receipt back.
  const t2 = await newDraft(db)
  await commitAs(db, 'branchA1', [send(t2, [jleg('transfer_out', -4, OUT_A1)])])
  await run(db, 'receive with a bad leg is refused', 'branchA2',
    [receive(t2, [jleg('transfer_in', 4, OUT_A2), jleg('transfer_in', 400, OUT_A2)], { [ITEM.a]: 4 })], false)
  record('compat', 'refused receive left the transfer sent with only its send leg', (await statusOf(db, t2)) === 'sent' && (await legCount(db, t2)) === 1)
  record('compat', 'refused receive left received_quantity uncounted', (await scalar(db, `select received_quantity is null from stock_transfer_lines where transfer_id = $1`, [t2])) === true)
  await run(db, 'the retry after a refused receive succeeds', 'branchA2', [receive(t2, [jleg('transfer_in', 4, OUT_A2)], { [ITEM.a]: 4 })], true)

  // Execution grants.
  for (const [name, sql] of [['send', send(t2, [])], ['receive', receive(t2, [], {})]]) {
    const outcome = await attempt(db, 'anon', ...sql)
    record('hole', `anon cannot execute ${name}`, isRefused(outcome), outcome)
  }
}

async function main() {
  const db = new PGlite()
  try {
    await installPlatformAuth(db)
    await installInventorySchema(db)
    await db.exec(SEED)
    for (const name of MIGRATIONS) await db.exec(readMigration(name))
    await db.exec(readMigration(MIGRATIONS[MIGRATIONS.length - 1])) // idempotent
    await check(db)
  } finally {
    await db.close()
  }
  const failed = results.filter((r) => !r.isOk)
  for (const r of results) console.log(`${r.isOk ? 'ok  ' : 'FAIL'} [${r.kind}] ${r.name}${r.isOk ? '' : ` -> ${JSON.stringify(r.detail)}`}`)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length > 0) process.exitCode = 1
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
