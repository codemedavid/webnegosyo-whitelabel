// Cost secrecy (20261107130000 reader + 20261107130100 revoke), pinned in PGlite
// on the live inventory slice + the 2026-11-03 hardening + the transfer functions.
// Asserts per role, before and after the revoke, that `select *` is refused,
// explicit non-cost columns still read, the costs-gated readers answer, and every
// writer path (receive average, frozen costs, counts, transfers) still works.
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
const READER = '20261107130000_inventory_cost_reader.sql'
const REVOKE = '20261107130100_revoke_inventory_cost_columns.sql'

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
  costsA: '00000000-0000-4000-8000-000000000009',
  costsBranchA1: '00000000-0000-4000-8000-00000000000a',
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
    ('${U.superadmin}', 'superadmin', null, false, null,              null),
    ('${U.costsA}',     'admin', '${T_A}', false, '{inventory,costs,menu}', null),
    ('${U.costsBranchA1}', 'admin', '${T_A}', false, '{inventory,costs,menu}', '${OUT_A1}');
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



const DENIED = (outcome) => isRefused(outcome)
const ok = (name, isOk, detail) => record('compat', name, isOk, detail)
const closed = (name, isOk, detail) => record('hole', name, isOk, detail)
let TABLES = {}
async function loadNonCostColumns(db) {
  const { rows } = await db.query(`select table_name, string_agg(column_name, ', ' order by ordinal_position) cols from information_schema.columns where table_schema = 'public' and table_name = any($1) and column_name <> 'unit_cost' group by 1`, [['inventory_items', 'stock_movements', 'stock_transfer_lines']])
  TABLES = Object.fromEntries(rows.map((r) => [r.table_name, r.cols]))
}
const ACTORS = ['ownerA', 'invA', 'branchA1', 'costsA', 'superadmin']
const rpc = (fn, args) => [`select * from ${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')})`, args]

async function rows(db, actor, sql, params) {
  const outcome = await attempt(db, actor, sql, params)
  return outcome
}

async function seedLedger(db) {
  // Item A: cost 0 -> receive 10 @20 (cost 20) -> receive 10 @30 (cost 25).
  await commitAs(db, 'costsA', [
    movement('receive', 10, null, { unit_cost: 20 }),
    movement('receive', 10, null, { unit_cost: 30 }),
  ])
  await commitAs(db, 'invA', [movement('waste', -1, null)])
  await commitAs(db, 'branchA1', [movement('waste', -1, OUT_A1)])
  await commitAs(db, 'branchA2', [movement('waste', -2, OUT_A2)])
}

async function leakChecks(db, label, isRevoked) {
  for (const [table, columns] of Object.entries(TABLES)) {
    for (const actor of ACTORS.filter((a) => a !== 'superadmin' || table !== 'stock_transfer_lines')) {
      const star = await attempt(db, actor, `select * from ${table} limit 1`)
      const costOnly = await attempt(db, actor, `select unit_cost from ${table} limit 1`)
      if (isRevoked) {
        closed(`${label} ${actor} cannot select * from ${table}`, DENIED(star), star)
        closed(`${label} ${actor} cannot select unit_cost from ${table}`, DENIED(costOnly), costOnly)
        const explicit = await attempt(db, actor, `select ${columns} from ${table}`)
        ok(`${label} ${actor} still reads ${table} by explicit columns`, !DENIED(explicit), explicit)
      } else {
        // Baseline: the leak this migration closes is open before the revoke.
        if (actor === 'invA') closed(`${label} (baseline) invA can read ${table}.unit_cost`, !DENIED(costOnly), costOnly)
      }
    }
    const svc = await attempt(db, 'service', `select * from ${table} limit 1`)
    ok(`${label} service role still select * from ${table}`, !DENIED(svc), svc)
  }
}

async function readerChecks(db) {
  const costOf = async (actor, sql, params) => {
    await actAs(db, actor)
    try { return (await db.query(sql, params)).rows } catch (e) { return `refused: ${e.message}` } finally { await reset(db) }
  }
  for (const actor of ['ownerA', 'costsA', 'costsBranchA1', 'superadmin']) {
    const r = await costOf(actor, ...rpc('public.inventory_costs_for_tenant', [T_A]))
    ok(`${actor} reads ingredient costs`, Array.isArray(r) && r.length === 4 && r.some((x) => x.inventory_item_id === ITEM.a), r)
  }
  const blended = await costOf('ownerA', ...rpc('public.inventory_costs_for_tenant', [T_A, [ITEM.a]]))
  ok('receive blended the average under the lock (20 then 30 -> 25)', Array.isArray(blended) && Number(blended[0]?.unit_cost) === 25, blended)
  for (const actor of ['invA', 'menuA', 'branchA1', 'registerA', 'ownerB']) {
    const r = await costOf(actor, ...rpc('public.inventory_costs_for_tenant', [T_A]))
    closed(`${actor} is refused ingredient costs`, typeof r === 'string' && /refused/.test(r), r)
  }
  const anon = await attempt(db, 'anon', 'select * from public.inventory_costs_for_tenant($1)', [T_A])
  closed('anon cannot call the ingredient cost reader', DENIED(anon), anon)
  const paged = await costOf('ownerA', ...rpc('public.inventory_costs_for_tenant', [T_A, null, ITEM.aUnit]))
  ok('the reader pages by id (after)', Array.isArray(paged) && paged.every((x) => x.inventory_item_id > ITEM.aUnit), paged)

  const ids = await scalar(db, `select array_agg(id::text) from stock_movements where tenant_id = $1`, [T_A])
  const mine = await costOf('ownerA', ...rpc('public.inventory_movement_costs', [T_A, ids]))
  ok('owner reads the cost of every movement', Array.isArray(mine) && mine.length === ids.length, mine)
  const waste = await costOf('ownerA', `select m.id from stock_movements m where m.reason = 'waste' and m.outlet_id is null`, [])
  const wasteCost = await costOf('ownerA', ...rpc('public.inventory_movement_costs', [T_A, [waste[0].id]]))
  ok('a waste leg froze today\'s average (25)', Array.isArray(wasteCost) && Number(wasteCost[0]?.unit_cost) === 25, wasteCost)
  const branchRows = await costOf('costsBranchA1', ...rpc('public.inventory_movement_costs', [T_A, ids]))
  const a2Ids = await scalar(db, `select array_agg(id::text) from stock_movements where outlet_id = $1`, [OUT_A2])
  ok('a branch account with costs sees its own branch\'s movement costs', Array.isArray(branchRows) && branchRows.length > 0, branchRows)
  closed('...but none of the other branch\'s', Array.isArray(branchRows) && !branchRows.some((r) => a2Ids.includes(r.movement_id)), branchRows)
  const noKey = await costOf('invA', ...rpc('public.inventory_movement_costs', [T_A, ids]))
  closed('no costs key, no movement costs', typeof noKey === 'string' && /refused/.test(noKey), noKey)
  const tooMany = await costOf('ownerA', ...rpc('public.inventory_movement_costs', [T_A, Array.from({ length: 1001 }, () => ITEM.a)]))
  closed('movement cost reader is bounded to 1000 ids', typeof tooMany === 'string' && /1000/.test(tooMany), tooMany)
  const other = await costOf('ownerB', ...rpc('public.inventory_movement_costs', [T_A, ids]))
  closed('another store\'s owner is refused', typeof other === 'string' && /refused/.test(other), other)
}

async function writerChecks(db, label) {
  // Writers send unit_cost; only SELECT was revoked.
  const create = await attempt(db, 'costsA', `insert into inventory_items (tenant_id, name, stock_unit_id, unit_cost) values ($1, 'Cheese', $2, 7) returning id`, [T_A, UNIT.aKg])
  ok(`${label} a priced ingredient can be created`, create === 1, create)
  const star = await attempt(db, 'costsA', `insert into inventory_items (tenant_id, name, stock_unit_id) values ($1, 'Salt', $2) returning *`, [T_A, UNIT.aKg])
  if (label === 'after') closed(`${label} insert ... returning * is refused (name the columns)`, DENIED(star), star)
  const named = await attempt(db, 'costsA', `insert into inventory_items (tenant_id, name, stock_unit_id) values ($1, 'Pepper', $2) returning ${TABLES.inventory_items}`, [T_A, UNIT.aKg])
  ok(`${label} insert returning explicit columns works`, named === 1, named)
  ok(`${label} owner reprices an ingredient`, (await attempt(db, 'ownerA', `update inventory_items set unit_cost = 26 where id = $1`, [ITEM.a])) === 1)
  ok(`${label} menu staff renames an ingredient`, (await attempt(db, 'menuA', `update inventory_items set name = 'Beef!' where id = $1`, [ITEM.a])) === 1)
  closed(`${label} no-costs staff still cannot reprice (guard)`, DENIED(await attempt(db, 'menuA', `update inventory_items set unit_cost = 1 where id = $1`, [ITEM.a])))
  ok(`${label} stocktake as inventory staff works`, (await attempt(db, 'invA', ...movement('stocktake', 0, null, { target_qty: 5 }))) === 1)
  ok(`${label} branch receive without costs key works (price dropped)`, (await attempt(db, 'branchA1', ...movement('receive', 3, OUT_A1, { unit_cost: 99 }))) === 1)

  // Transfers end to end (legs, frozen costs, definer helpers).
  const draft = await commitAs(db, 'branchA1', [[
    `insert into stock_transfers (tenant_id, from_outlet_id, to_outlet_id) values ($1, $2, $3) returning id`, [T_A, OUT_A1, OUT_A2]]])
  const t = draft.rows[0].id
  await commitAs(db, 'branchA1', [[
    `insert into stock_transfer_lines (tenant_id, transfer_id, inventory_item_id, sent_quantity) values ($1, $2, $3, 2)`, [T_A, t, ITEM.a]]])
  try {
    await commitAs(db, 'branchA1', [send(t, [jleg('transfer_out', -2, OUT_A1)])])
    await commitAs(db, 'branchA2', [receive(t, [jleg('transfer_in', 2, OUT_A2)], { [ITEM.a]: 2 })])
    ok(`${label} a transfer sends and is counted in`, true)
  } catch (error) {
    ok(`${label} a transfer sends and is counted in`, false, error.message)
  }
  const legCosts = await scalar(db, `select count(*)::int from stock_movements where stock_transfer_id = $1 and unit_cost is not null`, [t])
  ok(`${label} transfer legs were costed by the ledger`, legCosts === 2, legCosts)
}

const jleg = (reason, qty, outlet) => ({ inventory_item_id: ITEM.a, outlet_id: outlet, reason, quantity_delta: qty })
const send = (id, legs) => [`select public.send_stock_transfer($1, $2::jsonb)`, [id, JSON.stringify(legs)]]
const receive = (id, legs, counts) => [`select public.receive_stock_transfer($1, $2::jsonb, $3::jsonb)`, [id, JSON.stringify(legs), JSON.stringify(counts)]]

async function main() {
  const db = new PGlite()
  try {
    await installPlatformAuth(db)
    await installInventorySchema(db)
    await db.exec(SEED)
    for (const name of MIGRATIONS) await db.exec(readMigration(name))
    await db.exec(readMigration(READER))
    await db.exec(readMigration(READER)) // idempotent

    // The slice's frozen-cost function is a stub; use the real shape: a DEFINER
    // reading the ingredient's current cost (this is what keeps working after the revoke).
    await db.exec(`create or replace function public.stock_movement_frozen_cost(p_tenant_id uuid, p_item_id uuid, p_reason text, p_outlet_id uuid, p_order_id text, p_transfer_id uuid)
      returns numeric language sql security definer set search_path = '' as $$
        select i.unit_cost from public.inventory_items i where i.id = p_item_id and i.tenant_id = p_tenant_id $$`)
    await loadNonCostColumns(db)
    await seedLedger(db)
    await leakChecks(db, 'before', false)
    await readerChecks(db)
    await writerChecks(db, 'before')

    await db.exec(readMigration(REVOKE))
    await db.exec(readMigration(REVOKE)) // idempotent
    await leakChecks(db, 'after', true)
    await readerChecks(db)
    await writerChecks(db, 'after')
  } finally {
    await db.close()
  }
  const failed = results.filter((r) => !r.isOk)
  for (const r of results) console.log(`${r.isOk ? 'ok  ' : 'FAIL'} [${r.kind}] ${r.name}${r.isOk ? '' : ` -> ${JSON.stringify(r.detail)}`}`)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length > 0) process.exitCode = 1
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
