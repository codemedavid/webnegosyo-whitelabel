// Inventory follow-ups (20261105120000), pinned in PGlite as the role that
// really runs each query.
//
// Loads the live inventory slice (tests/sql/lib/inventory-live-schema.cjs),
// then the REAL, already-applied migrations
//   20261103120000 counted_at, 20261103130000..130300 permission hardening
// and then the new one. Checks:
//   1  the first delivery / transfer arrival on a never-counted shelf below
//      zero starts from 0 (correction stocktake, uncosted, same actor, 1 ms
//      earlier); counted / >= 0 / missing shelves are a plain add; sum of the
//      ledger = current_qty for every shelf and ingredient; clients cannot
//      forge the flag; a refused delivery leaves no correction behind.
//   2  the guard helpers are gone from `public`, answer the refusing constant
//      to another store, the truth to the store's own accounts, and every
//      guard that uses them still works.
//   3  a stocktake joins only an open count of its own branch; close-after-
//      stocktakes still works.
//   4  the five policies read (select auth.uid()); the merged SELECT policies
//      show the same rows as before.
//
//   node tests/sql/run-inventory-followups.cjs            must pass
//   node tests/sql/run-inventory-followups.cjs --before   live schema only (RED)
const { PGlite } = require('@electric-sql/pglite')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')
const { installInventorySchema } = require('./lib/inventory-live-schema.cjs')

const APPLIED = [
  '20261103120000_inventory_counted_and_sell_anyway.sql',
  '20261103130000_inventory_permission_hardening.sql',
  '20261103130100_inventory_transfer_count_lifecycle.sql',
  '20261103130200_inventory_tenant_consistency.sql',
  '20261103130300_inventory_unit_and_delete_guards.sql',
]
const MIGRATION = '20261105120000_inventory_followups.sql'
// --before: without the new migration; must FAIL (the RED run).
const IS_BEFORE = process.argv.includes('--before')

const T_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_B = 'bbbbbbbb-0000-4000-8000-000000000001'
const OUT_A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const OUT_A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const OUT_B1 = 'bbbbbbbb-0000-4000-8000-0000000000b1'

const U = {
  ownerA: '00000000-0000-4000-8000-000000000001',
  invA: '00000000-0000-4000-8000-000000000002',
  branchA1: '00000000-0000-4000-8000-000000000004',
  branchA2: '00000000-0000-4000-8000-000000000005',
  registerA: '00000000-0000-4000-8000-000000000006',
  ownerB: '00000000-0000-4000-8000-000000000007',
  superadmin: '00000000-0000-4000-8000-000000000008',
  staffPlatform: '00000000-0000-4000-8000-000000000009',
}

const id = (group, n) => `cccccccc-${String(group).padStart(4, '0')}-4000-8000-${String(n).padStart(12, '0')}`
const UNIT = { aPc: id(1, 1), aSpare: id(1, 2), bPc: id(1, 3) }
const ITEM = {
  cup: id(2, 1), // store shelf -65, never counted      (Loly's Cold cup)
  lid: id(2, 2), // store shelf -65, never counted      (inventory staff receives)
  counted: id(2, 3), // store shelf -65, COUNTED        (unchanged behaviour)
  straw: id(2, 4), // store shelf +3, never counted     (plain add)
  fresh: id(2, 5), // no shelf at all                   (plain add)
  branchCup: id(2, 6), // A1 shelf -20 uncounted, store shelf -7 uncounted
  moved: id(2, 7), // store shelf counted 10, A1 shelf -10 uncounted (transfer in)
  served: id(2, 8), // store shelf -30 uncounted        (service-role receive)
  sold: id(2, 9), // store shelf -4 uncounted           (sale/waste never open tracking)
  zero: id(2, 10), // 0 everywhere                      (stock unit change allowed)
  b: id(2, 11), // store B
}
const MENU = { a: id(3, 1), b: id(3, 2) }
const TRANSFER = { moved: id(4, 1), draftA: id(4, 2), sentA: id(4, 3) }
const COUNT = { openStore: id(5, 1), closedStore: id(5, 2), openA1: id(5, 3), emptyA: id(5, 4), b: id(5, 5) }
const ALERT = { aStore: id(6, 1), aA1: id(6, 2), aA2: id(6, 3) }

const FROZEN_COST = 2.5

const SEED = `
  insert into tenants values ('${T_A}'), ('${T_B}');
  insert into outlets (id, tenant_id, name) values ('${OUT_A1}', '${T_A}', 'A1'), ('${OUT_A2}', '${T_A}', 'A2'), ('${OUT_B1}', '${T_B}', 'B1');
  insert into auth.users select unnest(array[${Object.values(U).map((u) => `'${u}'::uuid`).join(',')}]);
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id, platform_permissions) values
    ('${U.ownerA}',     'admin', '${T_A}', true,  '{}',               null, null),
    ('${U.invA}',       'admin', '${T_A}', false, '{inventory}',      null, null),
    ('${U.branchA1}',   'admin', '${T_A}', false, '{inventory,menu}', '${OUT_A1}', null),
    ('${U.branchA2}',   'admin', '${T_A}', false, '{inventory,menu}', '${OUT_A2}', null),
    ('${U.registerA}',  'admin', '${T_A}', false, '{pos}',            null, null),
    ('${U.ownerB}',     'admin', '${T_B}', true,  '{}',               null, null),
    ('${U.superadmin}', 'superadmin', null, false, null,              null, null),
    ('${U.staffPlatform}', 'platform_staff', null, false, null,       null, '{stores.view,stores.edit,stores.delete}');
  insert into inventory_units (id, tenant_id, name, abbreviation, dimension, to_base_factor) values
    ('${UNIT.aPc}', '${T_A}', 'Piece', 'pc', 'count', 1),
    ('${UNIT.aSpare}', '${T_A}', 'Box', 'box', 'count', 24),
    ('${UNIT.bPc}', '${T_B}', 'Piece', 'pc', 'count', 1);
  insert into inventory_items (id, tenant_id, name, stock_unit_id, unit_cost) values
    ${Object.entries(ITEM)
      .filter(([key]) => key !== 'b')
      .map(([key, value]) => `('${value}', '${T_A}', '${key}', '${UNIT.aPc}', 2.5)`)
      .join(',\n    ')},
    ('${ITEM.b}', '${T_B}', 'b', '${UNIT.bPc}', 2.5);
  insert into menu_items (id, tenant_id) values ('${MENU.a}', '${T_A}'), ('${MENU.b}', '${T_B}');
  insert into presell_stock (tenant_id, menu_item_id, presell_date, stock_qty, sold_qty) values
    ('${T_A}', '${MENU.a}', '2026-12-24', 20, 5);
`

// History written the way live wrote it: sales by the service role (no
// counted_at), the counted ones by a delivery first.
const sale = (item, qty, outlet = null) =>
  `insert into stock_movements (tenant_id, inventory_item_id, outlet_id, reason, quantity_delta, order_id)
   values ('${T_A}', '${item}', ${outlet ? `'${outlet}'` : 'null'}, 'sale', ${-qty}, 'order-${item.slice(-4)}-${qty}')`
const HISTORY = [
  sale(ITEM.cup, 65),
  sale(ITEM.lid, 65),
  `insert into stock_movements (tenant_id, inventory_item_id, reason, quantity_delta) values ('${T_A}', '${ITEM.counted}', 'receive', 5)`,
  sale(ITEM.counted, 70),
  `insert into stock_movements (tenant_id, inventory_item_id, reason, quantity_delta, order_id) values ('${T_A}', '${ITEM.straw}', 'void', 3, 'void-straw')`,
  sale(ITEM.branchCup, 20, OUT_A1),
  sale(ITEM.branchCup, 7),
  `insert into stock_movements (tenant_id, inventory_item_id, reason, quantity_delta) values ('${T_A}', '${ITEM.moved}', 'receive', 10)`,
  sale(ITEM.moved, 10, OUT_A1),
  sale(ITEM.served, 30),
  sale(ITEM.sold, 4),
]

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------
const results = []
const record = (name, isOk, detail) => results.push({ name, isOk, detail })

function actAs(db, actor) {
  if (actor === 'anon') return asAnon(db)
  if (actor === 'service') return as(db, 'service_role', null)
  return as(db, 'authenticated', U[actor])
}

/** One statement as `actor`, rolled back: affected rows (or rows), or 'refused: …'. */
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

/** Statements as `actor`, committed: last result, or 'refused: …' (rolled back). */
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
    return `refused: ${error.message}`
  }
}

/** A scalar read as `actor` (default: fixture owner), rolled back. */
async function scalar(db, sql, params = [], actor = null) {
  await db.exec('begin')
  try {
    if (actor) await actAs(db, actor)
    const { rows } = await db.query(sql, params)
    return rows[0] ? Object.values(rows[0])[0] : undefined
  } catch (error) {
    return `refused: ${error.message}`
  } finally {
    await db.exec('rollback')
    await reset(db)
  }
}

const isRefused = (outcome) => typeof outcome === 'string' && outcome.startsWith('refused')
const num = (value) => (value === null || value === undefined ? value : Number(value))

function movement(item, reason, qty, outlet = null, extra = {}) {
  const cols = { tenant_id: T_A, inventory_item_id: item, reason, quantity_delta: qty, outlet_id: outlet, ...extra }
  const keys = Object.keys(cols)
  return [`insert into stock_movements (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')})`, keys.map((k) => cols[k])]
}

const shelfQty = (db, item, outlet = null) =>
  scalar(db, `select current_qty from inventory_stock where inventory_item_id = $1 and outlet_id is not distinct from $2::uuid`, [item, outlet]).then(num)
const itemQty = (db, item) => scalar(db, `select current_qty from inventory_items where id = $1`, [item]).then(num)
const corrections = (db, item) =>
  scalar(db, `select count(*)::int from stock_movements where inventory_item_id = $1 and opens_tracking`, [item])

// ---------------------------------------------------------------------------
// 1. Tracking starts at the first delivery
// ---------------------------------------------------------------------------
async function checkOpenTracking(db) {
  // Owner receives 5 Cold cups on a never-counted shelf at -65.
  const ownerReceive = await commitAs(db, 'ownerA', [movement(ITEM.cup, 'receive', 5, null, { unit_cost: 3 })])
  record('1 owner receive on uncounted -65 shelf is accepted', !isRefused(ownerReceive), ownerReceive)
  record('1 shelf reads the delivery (5), not -60', (await shelfQty(db, ITEM.cup)) === 5, await shelfQty(db, ITEM.cup))
  record('1 ingredient roll-up reads 5', (await itemQty(db, ITEM.cup)) === 5, await itemQty(db, ITEM.cup))
  const counted = await scalar(db, `select (i.counted_at is not null and s.counted_at is not null) from inventory_items i join inventory_stock s on s.inventory_item_id = i.id and s.outlet_id is null where i.id = $1`, [ITEM.cup])
  record('1 ingredient and shelf are now counted', counted === true, counted)

  const rows = (await db.query(
    `select reason, quantity_delta, balance_after, unit_cost, created_by, created_at, note, opens_tracking, target_qty
       from stock_movements where inventory_item_id = $1 and reason <> 'sale' order by created_at`,
    [ITEM.cup],
  )).rows
  const [fix, receive] = rows
  record('1 exactly one correction + the delivery', rows.length === 2 && fix?.opens_tracking === true && receive?.opens_tracking === false, rows.map((r) => r.reason))
  record('1 correction is a stocktake to 0 of +65', fix?.reason === 'stocktake' && num(fix.quantity_delta) === 65 && num(fix.balance_after) === 0 && num(fix.target_qty) === 0, fix)
  record('1 correction is uncosted (not a count gain in profit)', fix?.unit_cost === null, fix?.unit_cost)
  record('1 correction carries the note', /Tracking started/.test(fix?.note ?? ''), fix?.note)
  record('1 correction actor = the receiving owner', fix?.created_by === U.ownerA && receive?.created_by === U.ownerA, [fix?.created_by, receive?.created_by])
  record('1 correction sorts before the delivery', fix && receive && new Date(fix.created_at) < new Date(receive.created_at), [fix?.created_at, receive?.created_at])
  record('1 delivery balance_after = 5, its cost kept', num(receive?.balance_after) === 5 && num(receive?.unit_cost) === 3, receive)

  const again = await commitAs(db, 'ownerA', [movement(ITEM.cup, 'receive', 5)])
  record('1 second delivery is a plain add (10), no new correction', !isRefused(again) && (await shelfQty(db, ITEM.cup)) === 10 && (await corrections(db, ITEM.cup)) === 1, await shelfQty(db, ITEM.cup))

  // Inventory staff (client, not owner).
  await commitAs(db, 'invA', [movement(ITEM.lid, 'receive', 5)])
  record('1 inventory staff receive on uncounted -65 shelf -> 5', (await shelfQty(db, ITEM.lid)) === 5 && (await corrections(db, ITEM.lid)) === 1, await shelfQty(db, ITEM.lid))
  const lidActor = await scalar(db, `select created_by from stock_movements where inventory_item_id = $1 and opens_tracking`, [ITEM.lid])
  record('1 staff correction actor = that staff account', lidActor === U.invA, lidActor)

  // Already counted: unchanged behaviour.
  await commitAs(db, 'ownerA', [movement(ITEM.counted, 'receive', 5)])
  record('1 COUNTED -65 shelf + receive 5 -> -60 (unchanged)', (await shelfQty(db, ITEM.counted)) === -60 && (await corrections(db, ITEM.counted)) === 0, await shelfQty(db, ITEM.counted))

  // Uncounted but >= 0.
  await commitAs(db, 'ownerA', [movement(ITEM.straw, 'receive', 2)])
  record('1 uncounted +3 shelf + receive 2 -> 5 (plain add)', (await shelfQty(db, ITEM.straw)) === 5 && (await corrections(db, ITEM.straw)) === 0, await shelfQty(db, ITEM.straw))

  // No shelf yet.
  await commitAs(db, 'ownerA', [movement(ITEM.fresh, 'receive', 4)])
  record('1 no shelf + receive 4 -> 4 (plain add)', (await shelfQty(db, ITEM.fresh)) === 4 && (await corrections(db, ITEM.fresh)) === 0, await shelfQty(db, ITEM.fresh))

  // Branch shelf: only that shelf is corrected.
  await commitAs(db, 'branchA1', [movement(ITEM.branchCup, 'receive', 4, OUT_A1)])
  record('1 branch A1 shelf -20 + receive 4 -> 4', (await shelfQty(db, ITEM.branchCup, OUT_A1)) === 4, await shelfQty(db, ITEM.branchCup, OUT_A1))
  record('1 store shelf of the same ingredient untouched (-7, uncounted)', (await shelfQty(db, ITEM.branchCup)) === -7
    && (await scalar(db, `select counted_at from inventory_stock where inventory_item_id = $1 and outlet_id is null`, [ITEM.branchCup])) === null, await shelfQty(db, ITEM.branchCup))
  record('1 branch roll-up = 4 + (-7)', (await itemQty(db, ITEM.branchCup)) === -3, await itemQty(db, ITEM.branchCup))
  const branchFix = await scalar(db, `select outlet_id from stock_movements where inventory_item_id = $1 and opens_tracking`, [ITEM.branchCup])
  record('1 branch correction is on the A1 shelf', branchFix === OUT_A1, branchFix)

  // Transfer arrival on an uncounted -10 shelf at A1 (sender counted, 10 on hand).
  const setup = await commitAs(db, 'service', [
    [`insert into stock_transfers (id, tenant_id, from_outlet_id, to_outlet_id, status) values ('${TRANSFER.moved}', '${T_A}', null, '${OUT_A1}', 'draft')`],
    [`insert into stock_transfer_lines (tenant_id, transfer_id, inventory_item_id, sent_quantity) values ('${T_A}', '${TRANSFER.moved}', '${ITEM.moved}', 5)`],
    movement(ITEM.moved, 'transfer_out', -5, null, { stock_transfer_id: TRANSFER.moved }),
    [`update stock_transfers set status = 'sent' where id = '${TRANSFER.moved}'`],
  ])
  record('1 (setup) transfer sent', !isRefused(setup), setup)
  const arrival = await commitAs(db, 'branchA1', [movement(ITEM.moved, 'transfer_in', 5, OUT_A1, { stock_transfer_id: TRANSFER.moved })])
  record('1 receiving branch records the arrival', !isRefused(arrival), arrival)
  record('1 transfer_in on uncounted -10 shelf -> 5', (await shelfQty(db, ITEM.moved, OUT_A1)) === 5 && (await corrections(db, ITEM.moved)) === 1, await shelfQty(db, ITEM.moved, OUT_A1))
  record('1 sending shelf unchanged by the correction (10 - 5 = 5)', (await shelfQty(db, ITEM.moved)) === 5, await shelfQty(db, ITEM.moved))

  // Service role (server writer): actor and time as the server sent them.
  const at = '2026-11-05T02:00:00.000Z'
  await commitAs(db, 'service', [movement(ITEM.served, 'receive', 6, null, { created_by: U.ownerA, created_at: at })])
  record('1 service-role receive on uncounted -30 shelf -> 6', (await shelfQty(db, ITEM.served)) === 6, await shelfQty(db, ITEM.served))
  const servedFix = (await db.query(`select created_by, created_at from stock_movements where inventory_item_id = $1 and opens_tracking`, [ITEM.served])).rows[0]
  record('1 service correction actor = created_by sent, 1 ms before its time', servedFix?.created_by === U.ownerA
    && new Date(servedFix.created_at).toISOString() === '2026-11-05T01:59:59.999Z', servedFix)

  // Sales / waste / stocktake never open tracking.
  await commitAs(db, 'service', [sale(ITEM.sold, 1)].map((sql) => [sql]))
  await commitAs(db, 'ownerA', [movement(ITEM.sold, 'waste', -1)])
  record('1 sale and waste on uncounted negative shelf: no correction (-6)', (await shelfQty(db, ITEM.sold)) === -6 && (await corrections(db, ITEM.sold)) === 0, await shelfQty(db, ITEM.sold))

  // Forgery: a client cannot set the flag (it would hide a real count loss).
  await commitAs(db, 'ownerA', [movement(ITEM.sold, 'stocktake', 0, null, { target_qty: 0, opens_tracking: true })])
  const forged = (await db.query(`select opens_tracking, unit_cost, quantity_delta from stock_movements where inventory_item_id = $1 and reason = 'stocktake'`, [ITEM.sold])).rows
  record('1 client stocktake with opens_tracking=true is stored false and costed', forged.length === 1 && forged[0].opens_tracking === false && num(forged[0].unit_cost) === FROZEN_COST && num(forged[0].quantity_delta) === 6, forged)
  const serviceForged = await commitAs(db, 'service', [movement(ITEM.straw, 'waste', -1, null, { opens_tracking: true })])
  const serviceForgedRow = await scalar(db, `select opens_tracking from stock_movements where inventory_item_id = $1 and reason = 'waste'`, [ITEM.straw])
  record('1 service role cannot set the flag either', !isRefused(serviceForged) && serviceForgedRow === false, serviceForgedRow)

  // A refused delivery leaves no correction behind.
  const noGrant = await commitAs(db, 'registerA', [movement(ITEM.branchCup, 'receive', 5)])
  const otherBranch = await commitAs(db, 'branchA2', [movement(ITEM.branchCup, 'receive', 5)])
  record('1 receive without inventory permission refused', isRefused(noGrant), noGrant)
  record('1 branch A2 receive on the store shelf refused (RLS)', isRefused(otherBranch), otherBranch)
  record('1 ...and neither left a correction (store shelf still -7)', (await shelfQty(db, ITEM.branchCup)) === -7 && (await corrections(db, ITEM.branchCup)) === 1, await shelfQty(db, ITEM.branchCup))

  // The worker cannot be called outside the ledger.
  const direct = await scalar(db, `select inventory_private.open_shelf_tracking($1, $2, null, $3, now())`, [T_A, ITEM.branchCup, U.ownerA], 'ownerA')
  record('1 open_shelf_tracking refused outside a trigger', isRefused(direct), direct)
  const anonUsage = await scalar(db, `select has_schema_privilege('anon', 'inventory_private', 'USAGE')`)
  record('1 anon has no USAGE on inventory_private', anonUsage === false, anonUsage)

  // Ledger invariant: sum(delta) = current_qty, every shelf and every ingredient.
  const shelfDrift = await scalar(db, `
    select count(*)::int from inventory_stock s
     where s.current_qty <> coalesce((select sum(m.quantity_delta) from stock_movements m
       where m.inventory_item_id = s.inventory_item_id and m.outlet_id is not distinct from s.outlet_id), 0)`)
  const itemDrift = await scalar(db, `
    select count(*)::int from inventory_items i
     where i.current_qty <> coalesce((select sum(m.quantity_delta) from stock_movements m where m.inventory_item_id = i.id), 0)`)
  record('1 sum(ledger) = current_qty on every shelf', shelfDrift === 0, shelfDrift)
  record('1 sum(ledger) = current_qty on every ingredient', itemDrift === 0, itemDrift)
}

// ---------------------------------------------------------------------------
// 2. Guard helpers
// ---------------------------------------------------------------------------
const HELPERS = [
  'inventory_item_has_stock_on_any_shelf(uuid, uuid)',
  'inventory_units_in_use(uuid, uuid)',
  'stock_transfer_has_movements(uuid)',
  'inventory_count_has_movements(uuid)',
  'inventory_outlet_in_tenant(uuid, uuid)',
]

async function checkHelpers(db) {
  for (const signature of HELPERS) {
    const isPublic = await scalar(db, `select to_regprocedure($1) is not null`, [`public.${signature}`])
    const isPrivate = await scalar(db, `select to_regprocedure($1) is not null`, [`inventory_private.${signature}`])
    record(`2 ${signature.split('(')[0]} moved out of public`, isPublic === false && isPrivate === true, { isPublic, isPrivate })
  }
  const anonCall = await scalar(db, `select public.inventory_units_in_use($1, $2)`, [T_A, UNIT.aSpare], 'ownerB')
  record('2 the old public RPC name no longer answers another store', isRefused(anonCall), anonCall)

  await commitAs(db, 'service', [
    [`insert into stock_transfers (id, tenant_id, from_outlet_id, to_outlet_id, status) values ('${TRANSFER.draftA}', '${T_A}', null, '${OUT_A1}', 'draft')`],
    [`insert into inventory_counts (id, tenant_id, outlet_id) values ('${COUNT.emptyA}', '${T_A}', null)`],
  ])

  const ask = (actor, sql, params) => scalar(db, sql, params, actor)
  const questions = [
    ['unit in use (unused unit)', `select inventory_private.inventory_units_in_use($1, $2)`, [T_A, UNIT.aSpare], false, true],
    ['item stock on any shelf (zero item)', `select inventory_private.inventory_item_has_stock_on_any_shelf($1, $2)`, [T_A, ITEM.zero], false, true],
    ['transfer has movements (empty draft)', `select inventory_private.stock_transfer_has_movements($1)`, [TRANSFER.draftA], false, true],
    ['count has movements (empty count)', `select inventory_private.inventory_count_has_movements($1)`, [COUNT.emptyA], false, true],
    ['branch in store (A1 in A)', `select inventory_private.inventory_outlet_in_tenant($1, $2)`, [T_A, OUT_A1], true, false],
  ]
  for (const [label, sql, params, truth, refusing] of questions) {
    const own = await ask('ownerA', sql, params)
    const branch = await ask('branchA1', sql, params)
    const stranger = await ask('ownerB', sql, params)
    const superadmin = await ask('superadmin', sql, params)
    const platform = await ask('staffPlatform', sql, params)
    record(`2 ${label}: own store gets the truth`, own === truth && branch === truth, { own, branch })
    record(`2 ${label}: superadmin / platform staff get the truth`, superadmin === truth && platform === truth, { superadmin, platform })
    record(`2 ${label}: another store gets only the refusing constant`, stranger === refusing, stranger)
  }
  const strangerTrue = await ask('ownerB', `select inventory_private.inventory_units_in_use($1, $2)`, [T_A, UNIT.aPc])
  record('2 another store: same constant whether or not the unit is used', strangerTrue === true, strangerTrue)
  const foreignBranch = await ask('ownerA', `select inventory_private.inventory_outlet_in_tenant($1, $2)`, [T_A, OUT_B1])
  record('2 own store: a foreign branch is still not in the store', foreignBranch === false, foreignBranch)

  // The guards that call them still work for the store's own accounts.
  const unitWithStock = await attempt(db, 'ownerA', `update inventory_items set stock_unit_id = '${UNIT.aSpare}' where id = '${ITEM.cup}'`)
  record('2 stock unit change refused while a shelf holds stock', isRefused(unitWithStock), unitWithStock)
  const unitAtZero = await attempt(db, 'ownerA', `update inventory_items set stock_unit_id = '${UNIT.aSpare}' where id = '${ITEM.zero}'`)
  record('2 stock unit change allowed at zero', unitAtZero === 1, unitAtZero)
  const factorInUse = await attempt(db, 'ownerA', `update inventory_units set to_base_factor = 6 where id = '${UNIT.aPc}'`)
  record('2 unit size change refused while in use', isRefused(factorInUse), factorInUse)
  const factorUnused = await attempt(db, 'ownerA', `update inventory_units set to_base_factor = 6 where id = '${UNIT.aSpare}'`)
  record('2 unit size change allowed while unused', factorUnused === 1, factorUnused)
  const deleteDraft = await attempt(db, 'ownerA', `delete from stock_transfers where id = '${TRANSFER.draftA}'`)
  record('2 empty draft transfer can be deleted', deleteDraft === 1, deleteDraft)
  const deleteDraftSuper = await attempt(db, 'superadmin', `delete from stock_transfers where id = '${TRANSFER.draftA}'`)
  record('2 ...by a superadmin too', deleteDraftSuper === 1, deleteDraftSuper)
  const deleteSent = await attempt(db, 'ownerA', `delete from stock_transfers where id = '${TRANSFER.moved}'`)
  record('2 a transfer that moved stock cannot be deleted', isRefused(deleteSent), deleteSent)
  const deleteEmptyCount = await attempt(db, 'ownerA', `delete from inventory_counts where id = '${COUNT.emptyA}'`)
  record('2 an empty count can be deleted', deleteEmptyCount === 1, deleteEmptyCount)

  const audit = (outlet) =>
    `insert into inventory_audit_log (tenant_id, event, outcome, source, outlet_id, actor_user_id)
     values ('${T_A}', 'manual_movement', 'applied', 'web_admin', ${outlet ? `'${outlet}'` : 'null'}, '${U.invA}')`
  const auditOk = await attempt(db, 'invA', audit(null))
  record('2 audit-log insert by inventory staff still works', auditOk === 1, auditOk)
  const auditForeign = await attempt(db, 'invA', audit(OUT_B1))
  record('2 audit-log insert naming another store\'s branch refused', isRefused(auditForeign) || auditForeign === 0, auditForeign)
  const auditRegister = await attempt(db, 'registerA', audit(null).replace(U.invA, U.registerA))
  record('2 audit-log insert without inventory refused', isRefused(auditRegister) || auditRegister === 0, auditRegister)
}

// ---------------------------------------------------------------------------
// 3. Count sessions
// ---------------------------------------------------------------------------
async function checkCountSessions(db) {
  const setup = await commitAs(db, 'service', [
    [`insert into inventory_counts (id, tenant_id, outlet_id) values
       ('${COUNT.openStore}', '${T_A}', null), ('${COUNT.closedStore}', '${T_A}', null), ('${COUNT.openA1}', '${T_A}', '${OUT_A1}')`],
    [`update inventory_counts set status = 'closed', closed_at = now() where id = '${COUNT.closedStore}'`],
  ])
  record('3 (setup) counts', !isRefused(setup), setup)
  const stocktake = (item, count, outlet = null) => movement(item, 'stocktake', 0, outlet, { target_qty: 3, inventory_count_id: count })

  const intoOpen = await attempt(db, 'invA', ...stocktake(ITEM.straw, COUNT.openStore))
  record('3 stocktake joins an open count of its shelf', intoOpen === 1, intoOpen)
  const intoClosed = await attempt(db, 'invA', ...stocktake(ITEM.straw, COUNT.closedStore))
  record('3 stocktake into a CLOSED count refused', isRefused(intoClosed) && /closed/.test(intoClosed), intoClosed)
  const intoClosedService = await attempt(db, 'service', ...stocktake(ITEM.straw, COUNT.closedStore))
  record('3 ...for the service role too', isRefused(intoClosedService), intoClosedService)
  const wrongBranch = await attempt(db, 'invA', ...stocktake(ITEM.straw, COUNT.openA1))
  record('3 store-shelf stocktake into the A1 count refused', isRefused(wrongBranch) && /another branch/.test(wrongBranch), wrongBranch)
  const branchOwn = await attempt(db, 'branchA1', ...stocktake(ITEM.straw, COUNT.openA1, OUT_A1))
  record('3 A1 stocktake into the A1 count works', branchOwn === 1, branchOwn)
  const otherStore = await attempt(db, 'service', ...stocktake(ITEM.straw, COUNT.b))
  record('3 count of another store still refused', isRefused(otherStore), otherStore)
  const notStocktake = await attempt(db, 'invA', ...movement(ITEM.straw, 'receive', 1, null, { inventory_count_id: COUNT.openStore }))
  record('3 a delivery still cannot join a count', isRefused(notStocktake), notStocktake)

  // The real close flow: stocktakes first, then the status flip.
  const flow = await commitAs(db, 'invA', [
    stocktake(ITEM.straw, COUNT.openStore),
    [`update inventory_counts set status = 'closed', closed_at = now(), closed_by = '${U.invA}' where id = '${COUNT.openStore}' and status = 'open'`],
  ])
  record('3 stocktake then close (web/app order) works', !isRefused(flow) && flow.affectedRows === 1, isRefused(flow) ? flow : flow.affectedRows)
  const late = await attempt(db, 'invA', ...stocktake(ITEM.straw, COUNT.openStore))
  record('3 a stocktake after closing is refused', isRefused(late), late)
  const deleteCounted = await attempt(db, 'ownerA', `delete from inventory_counts where id = '${COUNT.openStore}'`)
  record('3 a count with stocktakes still cannot be deleted', isRefused(deleteCounted), deleteCounted)
}

// ---------------------------------------------------------------------------
// 4. Policies
// ---------------------------------------------------------------------------
async function checkPolicies(db) {
  const { rows } = await db.query(`
    select tablename, policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') as body
      from pg_policies
     where schemaname = 'public'
       and tablename in ('stock_alerts', 'presell_stock', 'inventory_audit_log')
       and policyname in ('stock_alerts_select_member', 'presell_stock_select_member', 'inventory_audit_log_insert_branch',
                          'stock_alerts_select_branch', 'stock_alerts_select_superadmin', 'presell_stock_select_superadmin')`)
  const names = rows.map((row) => row.policyname).sort()
  record('4 merged policies replace the old pairs', JSON.stringify(names) === JSON.stringify(['inventory_audit_log_insert_branch', 'presell_stock_select_member', 'stock_alerts_select_member']), names)
  for (const row of rows) {
    const bare = row.body.replace(/SELECT auth\.uid\(\)/gi, '').match(/auth\.uid\(\)/g)
    record(`4 ${row.policyname} reads auth.uid() through a sub-select only`, !bare && /SELECT auth\.uid\(\)/i.test(row.body), row.body.slice(0, 160))
  }
  const selectCounts = (await db.query(`
    select tablename, count(*)::int as n from pg_policies
     where schemaname = 'public' and tablename in ('stock_alerts', 'presell_stock') and cmd = 'SELECT' group by 1 order by 1`)).rows
  record('4 one member SELECT policy per table (+ the shared platform_staff one)', selectCounts.every((row) => row.n === 2), selectCounts)

  await commitAs(db, 'service', [[`insert into stock_alerts (id, tenant_id, inventory_item_id, level, quantity, outlet_id) values
    ('${ALERT.aStore}', '${T_A}', '${ITEM.cup}', 'low', 1, null),
    ('${ALERT.aA1}', '${T_A}', '${ITEM.cup}', 'low', 1, '${OUT_A1}'),
    ('${ALERT.aA2}', '${T_A}', '${ITEM.cup}', 'out', 0, '${OUT_A2}')`]])
  const reads = [
    ['owner reads every store alert', 'ownerA', 'stock_alerts', 3],
    ['branch account reads store-level + own branch', 'branchA1', 'stock_alerts', 2],
    ['another store reads no alert', 'ownerB', 'stock_alerts', 0],
    ['superadmin reads every alert', 'superadmin', 'stock_alerts', 3],
    ['anon reads no alert', 'anon', 'stock_alerts', 0],
    ['member reads pre-sell rows', 'registerA', 'presell_stock', 1],
    ['another store reads no pre-sell row', 'ownerB', 'presell_stock', 0],
    ['superadmin reads pre-sell rows', 'superadmin', 'presell_stock', 1],
  ]
  for (const [label, actor, table, rowsExpected] of reads) {
    const outcome = await attempt(db, actor, `select id from ${table}`)
    record(`4 ${label}`, outcome === rowsExpected || (rowsExpected === 0 && isRefused(outcome)), outcome)
  }
  const fakeAlert = await attempt(db, 'ownerA', `insert into stock_alerts (tenant_id, inventory_item_id, level, quantity) values ('${T_A}', '${ITEM.cup}', 'out', 0)`)
  record('4 clients still cannot write alerts', isRefused(fakeAlert) || fakeAlert === 0, fakeAlert)
}

// ---------------------------------------------------------------------------
async function main() {
  const db = new PGlite()
  await installPlatformAuth(db)
  await installInventorySchema(db)
  // A real frozen cost (the slice stubs NULL), so "uncosted" is observable.
  await db.exec(`create or replace function public.stock_movement_frozen_cost(p_tenant_id uuid, p_item_id uuid, p_reason text, p_outlet_id uuid, p_order_id text, p_transfer_id uuid)
    returns numeric language sql stable as $f$ select ${FROZEN_COST}::numeric $f$;`)
  for (const name of APPLIED) await db.exec(readMigration(name))
  await db.exec(SEED)
  await db.exec(`insert into inventory_counts (id, tenant_id, outlet_id) values ('${COUNT.b}', '${T_B}', null)`)
  for (const sql of HISTORY) await commitAs(db, 'service', [[sql]]).then((outcome) => {
    if (isRefused(outcome)) throw new Error(`history: ${outcome}`)
  })

  if (!IS_BEFORE) {
    await db.exec(readMigration(MIGRATION))
    await db.exec(readMigration(MIGRATION)) // idempotent
  }

  await checkOpenTracking(db)
  await checkHelpers(db)
  await checkCountSessions(db)
  await checkPolicies(db)

  for (const { name, isOk, detail } of results) {
    console.log(`${isOk ? 'ok  ' : 'FAIL'}  ${name}${isOk ? '' : `  -> ${JSON.stringify(detail)}`}`)
  }
  const failed = results.filter((result) => !result.isOk)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
