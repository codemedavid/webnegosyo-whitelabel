// Inventory permission hardening (DB security audit 2026-11-03), pinned in PGlite.
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
]
const IS_BASELINE = process.argv.includes('--baseline')

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

// ---------------------------------------------------------------------------
// M1 stock_alerts
// ---------------------------------------------------------------------------
async function checkStockAlerts(db) {
  await commitAs(db, 'service', [[`insert into stock_alerts (id, tenant_id, inventory_item_id, level, quantity, outlet_id) values
    ('${ALERT.aStore}', '${T_A}', '${ITEM.a}', 'low', 1, null),
    ('${ALERT.aA1}', '${T_A}', '${ITEM.a}', 'low', 1, '${OUT_A1}'),
    ('${ALERT.aA2}', '${T_A}', '${ITEM.a}', 'out', 0, '${OUT_A2}')`]])
  const notified = await scalar(db, `select count(*)::int from merchant_notifications where tenant_id = $1 and item_name = 'Beef'`, [T_A])
  record('compat', 'M1 service-role alert insert still raises merchant notifications', notified === 3, notified)

  const fakeAlert = `insert into stock_alerts (tenant_id, inventory_item_id, level, quantity) values ('${T_A}', '${ITEM.a}', 'out', 0)`
  await hole(db, 'M1 staff cannot insert a fake alert (push)', 'registerA', fakeAlert)
  await hole(db, 'M1 owner cannot insert an alert either', 'ownerA', fakeAlert)
  await hole(db, 'M1 staff cannot resolve a real alert', 'registerA', `update stock_alerts set resolved_at = now() where id = '${ALERT.aStore}'`)
  await hole(db, 'M1 staff cannot escalate an alert (push)', 'branchA1', `update stock_alerts set level = 'out' where id = '${ALERT.aA1}'`)
  await hole(db, 'M1 staff cannot delete alerts', 'ownerA', `delete from stock_alerts where tenant_id = '${T_A}'`)
  await staysRefused(db, 'M1 anon still cannot insert an alert', 'anon', fakeAlert)

  await compat(db, 'M1 owner still reads all store alerts', 'ownerA', `select id from stock_alerts`, [], 3)
  await compat(db, 'M1 branch account reads store-level + own branch alerts only', 'branchA1', `select id from stock_alerts`, [], 2)
  await compat(db, 'M1 other store reads none', 'ownerB', `select id from stock_alerts`, [], 0)
  await compat(db, 'M1 superadmin still reads alerts', 'superadmin', `select id from stock_alerts`, [], 3)
  await compat(db, 'M1 service role still resolves alerts', 'service', `update stock_alerts set resolved_at = now() where id = '${ALERT.aStore}'`)

  // M5 the definer notification trigger: an alert naming another store's ingredient
  // (only the service role writes alerts now) is refused, never leaks the name.
  await hole(db, 'M5 alert naming another store\'s ingredient is refused', 'service',
    `insert into stock_alerts (tenant_id, inventory_item_id, level, quantity) values ('${T_B}', '${ITEM.a}', 'out', 0)`)
  await hole(db, 'M5 alert naming another store\'s branch is refused', 'service',
    `insert into stock_alerts (tenant_id, inventory_item_id, level, quantity, outlet_id) values ('${T_A}', '${ITEM.a}', 'out', 0, '${OUT_B1}')`)

  // The notification trigger itself only joins inside the alert's store, even
  // for a row that slipped past the guard (guard disabled here to reach it).
  await db.exec('begin')
  try {
    await db.exec(`do $$ begin
      if exists (select 1 from pg_trigger where tgname = 'stock_alerts_01_same_tenant') then
        alter table stock_alerts disable trigger stock_alerts_01_same_tenant;
      end if;
    end $$`)
    await db.query(`insert into stock_alerts (tenant_id, inventory_item_id, level, quantity) values ('${T_B}', '${ITEM.a}', 'out', 0)`)
    const leaked = await db.query(`select item_name from merchant_notifications where tenant_id = $1`, [T_B])
    const names = leaked.rows.map((row) => row.item_name)
    record('hole', 'M5 notification trigger never copies another store\'s ingredient name', !names.includes('Beef'), names)
  } finally {
    await db.exec('rollback')
  }
}

// ---------------------------------------------------------------------------
// M2 presell_stock
// ---------------------------------------------------------------------------
async function checkPresell(db) {
  await hole(db, 'M2 staff cannot rewrite sold_qty', 'registerA', `update presell_stock set sold_qty = 0 where tenant_id = '${T_A}'`)
  await hole(db, 'M2 owner cannot rewrite stock_qty directly', 'ownerA', `update presell_stock set stock_qty = 999 where tenant_id = '${T_A}'`)
  await hole(db, 'M2 staff cannot insert an allocation', 'menuA',
    `insert into presell_stock (tenant_id, menu_item_id, presell_date, stock_qty) values ('${T_A}', '${MENU.a}', '2026-12-25', 5)`)
  await hole(db, 'M2 staff cannot delete a sold allocation', 'menuA', `delete from presell_stock where tenant_id = '${T_A}'`)
  await compat(db, 'M2 staff still read allocations', 'registerA', `select id from presell_stock`, [], 1)
  await compat(db, 'M2 service-role upsert (syncPresellAllocationsAction) still works', 'service',
    `insert into presell_stock (tenant_id, menu_item_id, presell_date, stock_qty) values ('${T_A}', '${MENU.a}', '2026-12-24', 30)
     on conflict (tenant_id, menu_item_id, presell_date) do update set stock_qty = excluded.stock_qty`)
  await hole(db, 'M5 presell row naming another store\'s dish is refused', 'service',
    `insert into presell_stock (tenant_id, menu_item_id, presell_date, stock_qty) values ('${T_A}', '${MENU.b}', '2026-12-24', 5)`)
}

// ---------------------------------------------------------------------------
// M3 transfers, L1 each leg once
// ---------------------------------------------------------------------------
async function newDraft(db, actor = 'branchA1') {
  const result = await commitAs(db, actor, [[
    `insert into stock_transfers (tenant_id, from_outlet_id, to_outlet_id, status) values ($1, $2, $3, 'draft') returning id`,
    [T_A, OUT_A1, OUT_A2],
  ]])
  const transferId = result.rows[0].id
  await commitAs(db, actor, [[
    `insert into stock_transfer_lines (tenant_id, transfer_id, inventory_item_id, sent_quantity) values ($1, $2, $3, 4)`,
    [T_A, transferId, ITEM.a],
  ]])
  return transferId
}

async function checkTransfers(db) {
  // The web flow (stock-transfers-service.ts), step by step, as the real accounts.
  let transferId
  try {
    transferId = await newDraft(db)
    record('compat', 'M3 sender drafts a transfer with lines', true, transferId)
  } catch (error) {
    record('compat', 'M3 sender drafts a transfer with lines', false, error.message)
    return
  }

  await hole(db, 'M3 a transfer cannot be inserted already sent', 'branchA1',
    `insert into stock_transfers (tenant_id, from_outlet_id, to_outlet_id, status) values ('${T_A}', '${OUT_A1}', '${OUT_A2}', 'sent')`)
  await hole(db, 'M3 the receiving branch cannot draft a transfer out of the sender', 'branchA2',
    `insert into stock_transfers (tenant_id, from_outlet_id, to_outlet_id) values ('${T_A}', '${OUT_A1}', '${OUT_A2}')`)
  await hole(db, 'M3 the receiving branch cannot send the sender\'s draft', 'branchA2',
    `update stock_transfers set status = 'sent' where id = '${transferId}'`)
  await hole(db, 'M3 the receiving branch cannot cancel the sender\'s draft', 'branchA2',
    `update stock_transfers set status = 'cancelled' where id = '${transferId}'`)
  await hole(db, 'M3 a draft cannot jump to received', 'ownerA',
    `update stock_transfers set status = 'received' where id = '${transferId}'`)

  // Send: legs first, then the status (as sendTransferWith).
  try {
    await commitAs(db, 'branchA1', [
      movement('transfer_out', -4, OUT_A1, { stock_transfer_id: transferId }),
      [`update stock_transfers set status = 'sent', sent_at = now(), sent_by = $1 where id = $2`, [U.branchA1, transferId]],
    ])
    record('compat', 'M3 sender sends (transfer_out leg, then status sent)', true)
  } catch (error) {
    record('compat', 'M3 sender sends (transfer_out leg, then status sent)', false, error.message)
    return
  }

  await hole(db, 'L1 the same transfer leg cannot be written twice (service role race)', 'service',
    ...movement('transfer_out', -4, OUT_A1, { stock_transfer_id: transferId }))
  await hole(db, 'M3 the receiving branch cannot delete a sent transfer', 'branchA2', `delete from stock_transfers where id = '${transferId}'`)
  await hole(db, 'M3 the sender cannot delete a sent transfer', 'branchA1', `delete from stock_transfers where id = '${transferId}'`)
  await hole(db, 'M3 the sender cannot change what was sent after sending', 'branchA1',
    `update stock_transfer_lines set sent_quantity = 1 where transfer_id = '${transferId}'`)
  await hole(db, 'M3 the sender cannot add lines after sending', 'branchA1',
    `insert into stock_transfer_lines (tenant_id, transfer_id, inventory_item_id, sent_quantity) values ('${T_A}', '${transferId}', '${ITEM.aUnit}', 1)`)
  await hole(db, 'M3 the sender cannot redirect a sent transfer', 'branchA1',
    `update stock_transfers set to_outlet_id = null where id = '${transferId}'`)
  await hole(db, 'M3 the sender cannot mark its own delivery received', 'branchA1',
    `update stock_transfers set status = 'received' where id = '${transferId}'`)
  await hole(db, 'M3 a sent transfer cannot be cancelled', 'ownerA',
    `update stock_transfers set status = 'cancelled' where id = '${transferId}'`)

  // Receive: legs, lines' received_quantity, then status (as receiveTransferWith).
  try {
    await commitAs(db, 'branchA2', [
      movement('transfer_in', 4, OUT_A2, { stock_transfer_id: transferId }),
      [`update stock_transfer_lines set received_quantity = 4 where tenant_id = $1 and transfer_id = $2 and inventory_item_id = $3`, [T_A, transferId, ITEM.a]],
      [`update stock_transfers set status = 'received', received_at = now(), received_by = $1 where id = $2`, [U.branchA2, transferId]],
    ])
    record('compat', 'M3 receiver counts in (transfer_in leg, received_quantity, status received)', true)
  } catch (error) {
    record('compat', 'M3 receiver counts in (transfer_in leg, received_quantity, status received)', false, error.message)
  }
  await hole(db, 'M3 a received transfer stays received', 'ownerA', `update stock_transfers set status = 'sent' where id = '${transferId}'`)
  await hole(db, 'M3 received quantities cannot be rewritten after receipt', 'branchA2',
    `update stock_transfer_lines set received_quantity = 3 where transfer_id = '${transferId}'`)
  const legs = await scalar(db, `select count(*)::int from stock_movements where stock_transfer_id = $1`, [transferId])
  record('compat', 'M3 the transfer still owns both its legs', legs === 2, legs)

  // Drafts: cancel and delete stay possible for the sender.
  const draftToCancel = await newDraft(db)
  await compat(db, 'M3 sender cancels a draft', 'branchA1', `update stock_transfers set status = 'cancelled' where id = '${draftToCancel}'`)
  const draftToDelete = await newDraft(db)
  await hole(db, 'M3 the receiving branch cannot delete the sender\'s draft', 'branchA2', `delete from stock_transfers where id = '${draftToDelete}'`)
  await compat(db, 'M3 sender edits a draft line', 'branchA1', `update stock_transfer_lines set sent_quantity = 2 where transfer_id = '${draftToDelete}'`)
  await compat(db, 'M3 sender deletes a draft with no ledger rows', 'branchA1', `delete from stock_transfers where id = '${draftToDelete}'`)
  await compat(db, 'M3 service role can still delete (cascade path)', 'service', `delete from stock_transfers where id = '${draftToCancel}'`)
}

// ---------------------------------------------------------------------------
// M3 counts
// ---------------------------------------------------------------------------
async function checkCounts(db) {
  const opened = await commitAs(db, 'invA', [[
    `insert into inventory_counts (tenant_id, outlet_id, status) values ($1, null, 'open') returning id`, [T_A],
  ]])
  const countId = opened.rows[0].id
  await commitAs(db, 'invA', [movement('stocktake', 0, null, { target_qty: 7, inventory_count_id: countId })])
  await hole(db, 'M3 a count with stocktakes cannot be deleted', 'invA', `delete from inventory_counts where id = '${countId}'`)
  await hole(db, 'M3 a count with stocktakes cannot move branch', 'invA', `update inventory_counts set outlet_id = '${OUT_A1}' where id = '${countId}'`)
  await compat(db, 'M3 the count closes (count-session-service)', 'invA',
    `update inventory_counts set status = 'closed', closed_at = now(), closed_by = '${U.invA}' where id = '${countId}' and status = 'open'`)
  await commitAs(db, 'invA', [[`update inventory_counts set status = 'closed', closed_at = now() where id = $1`, [countId]]])
  await hole(db, 'M3 a closed count cannot be reopened', 'invA', `update inventory_counts set status = 'open', closed_at = null where id = '${countId}'`)

  const empty = await commitAs(db, 'branchA1', [[
    `insert into inventory_counts (tenant_id, outlet_id, status) values ($1, $2, 'open') returning id`, [T_A, OUT_A1],
  ]])
  await compat(db, 'M3 an empty count can still be deleted', 'branchA1', `delete from inventory_counts where id = '${empty.rows[0].id}'`)
}

// ---------------------------------------------------------------------------
// M5 tenant consistency
// ---------------------------------------------------------------------------
async function checkTenantConsistency(db) {
  const squat = `insert into inventory_stock (tenant_id, inventory_item_id, outlet_id, current_qty) values ('${T_B}', '${ITEM.aSquat}', null, 0)`
  await hole(db, 'M5 another store cannot squat a shelf on our ingredient', 'ownerB', squat)
  await hole(db, 'M5 a shelf cannot name another store\'s branch', 'invA',
    `insert into inventory_stock (tenant_id, inventory_item_id, outlet_id, current_qty) values ('${T_A}', '${ITEM.aUnit}', '${OUT_B1}', 0)`)

  // What the squat did on the live schema: our next movement on that
  // ingredient failed (balance_after NULL). After the fix it lands.
  await db.exec('begin')
  try {
    await as(db, 'authenticated', U.ownerB)
    await db.exec('savepoint squat')
    let squatted = true
    try { await db.query(squat) } catch { squatted = false; await db.exec('rollback to savepoint squat') }
    await reset(db)
    await as(db, 'authenticated', U.invA)
    const [sql, params] = movement('receive', 5, null, { inventory_item_id: ITEM.aSquat })
    const balance = await db.query(`${sql} returning balance_after`, params)
      .then(({ rows }) => rows[0]?.balance_after)
      .catch((error) => error.message)
    record('hole', 'M5 a squatted shelf no longer breaks our movements', !squatted && Number(balance) === 5, { squatted, balance })
  } finally {
    await db.exec('rollback')
    await reset(db)
  }

  await hole(db, 'M5 a recipe line cannot use another store\'s ingredient', 'ownerB',
    `insert into recipe_components (tenant_id, recipe_id, inventory_item_id, quantity, unit_id) values ('${T_B}', '${RECIPE.b}', '${ITEM.a}', 1, '${UNIT.bKg}')`)
  await hole(db, 'M5 a recipe line cannot use another store\'s unit', 'ownerA',
    `insert into recipe_components (tenant_id, recipe_id, inventory_item_id, quantity, unit_id) values ('${T_A}', '${RECIPE.a}', '${ITEM.aUnit}', 1, '${UNIT.bKg}')`)
  await hole(db, 'M5 a recipe line cannot hang off another store\'s recipe', 'ownerB',
    `insert into recipe_components (tenant_id, recipe_id, inventory_item_id, quantity, unit_id) values ('${T_B}', '${RECIPE.a}', '${ITEM.b}', 1, '${UNIT.bKg}')`)
  await hole(db, 'M5 a recipe cannot target another store\'s dish', 'ownerB',
    `insert into recipes (tenant_id, target_type, menu_item_id, addon_id) values ('${T_B}', 'addon', '${MENU.a}', 'x')`)
  await hole(db, 'M5 a prep recipe cannot target another store\'s ingredient', 'ownerB',
    `insert into recipes (tenant_id, target_type, prep_item_id) values ('${T_B}', 'prep_item', '${ITEM.a}')`)
  await hole(db, 'M5 an ingredient cannot be stocked in another store\'s unit', 'ownerB',
    `insert into inventory_items (tenant_id, name, stock_unit_id) values ('${T_B}', 'Stolen', '${UNIT.aKg}')`)
  await hole(db, 'M5 a transfer line cannot carry another store\'s ingredient', 'ownerB',
    `insert into stock_transfer_lines (tenant_id, transfer_id, inventory_item_id, sent_quantity) values ('${T_B}', '${TRANSFER_B}', '${ITEM.a}', 1)`)

  await compat(db, 'M5 own recipe line still saves', 'menuA',
    `insert into recipe_components (tenant_id, recipe_id, inventory_item_id, quantity, unit_id) values ('${T_A}', '${RECIPE.a}', '${ITEM.aUnit}', 1, '${UNIT.aPack}')`)
  await compat(db, 'M5 own branch shelf (par level) still inserts', 'branchA1',
    `insert into inventory_stock (tenant_id, inventory_item_id, outlet_id, current_qty, reorder_level) values ('${T_A}', '${ITEM.aUnit}', '${OUT_A1}', 0, 3)`)
  await compat(db, 'M5 own ingredient still creates', 'menuA',
    `insert into inventory_items (tenant_id, name, stock_unit_id) values ('${T_A}', 'Onion', '${UNIT.aKg}')`)
}

// ---------------------------------------------------------------------------
// L3 units, L4 deletes
// ---------------------------------------------------------------------------
async function checkUnitsAndDeletes(db) {
  // Buns: +5 on A1, -5 on A2 → rollup 0 while both shelves hold stock.
  await commitAs(db, 'service', [
    [`insert into stock_movements (tenant_id, inventory_item_id, reason, quantity_delta, outlet_id) values ($1, $2, 'receive', 5, $3)`, [T_A, ITEM.aUnit, OUT_A1]],
    [`insert into stock_movements (tenant_id, inventory_item_id, reason, quantity_delta, outlet_id) values ($1, $2, 'waste', -5, $3)`, [T_A, ITEM.aUnit, OUT_A2]],
  ])
  await hole(db, 'L3 stock unit cannot change while a branch shelf holds stock (rollup 0)', 'ownerA',
    `update inventory_items set stock_unit_id = '${UNIT.aSpare}' where id = '${ITEM.aUnit}'`)
  await compat(db, 'L3 stock unit still changes while every shelf is 0', 'ownerA',
    `update inventory_items set stock_unit_id = '${UNIT.aKg}' where id = '${ITEM.aUnused}'`)

  await hole(db, 'L3 an in-use stock unit cannot change size', 'menuA', `update inventory_units set to_base_factor = 6 where id = '${UNIT.aPack}'`)
  await hole(db, 'L3 a unit used by a recipe line cannot change size', 'menuA', `update inventory_units set to_base_factor = 2 where id = '${UNIT.aG}'`)
  await hole(db, 'L3 an in-use unit cannot change dimension', 'menuA', `update inventory_units set dimension = 'volume' where id = '${UNIT.aKg}'`)
  await compat(db, 'L3 an in-use unit can still be renamed (whole-row resubmit)', 'menuA',
    `update inventory_units set name = 'Pack of 12', abbreviation = 'pk', dimension = 'count', to_base_factor = 12 where id = '${UNIT.aPack}'`)
  await compat(db, 'L3 an unused unit can still change size', 'menuA', `update inventory_units set to_base_factor = 20 where id = '${UNIT.aSpare}'`)

  await hole(db, 'L4 a branch-locked account cannot delete an ingredient directly', 'branchA1',
    `delete from inventory_items where id = '${ITEM.aUnused}'`)
  await compat(db, 'L4 a store-wide account can still delete an unused ingredient', 'menuA',
    `delete from inventory_items where id = '${ITEM.aUnused}'`)
  await compat(db, 'L4 delete_inventory_item RPC still works for store-wide menu', 'menuA',
    `select public.delete_inventory_item('${T_A}', '${ITEM.aUnused}', false)`)
  await compat(db, 'L4 branch-locked account still edits an ingredient (app editor)', 'branchA1',
    `update inventory_items set name = 'Beef brisket', reorder_level = 2 where id = '${ITEM.a}'`)
}

// ---------------------------------------------------------------------------
// L5 audit log
// ---------------------------------------------------------------------------
const auditInsert = (actor, overrides = {}) => {
  const row = {
    tenant_id: T_A, event: 'manual_movement', outcome: 'applied', source: 'web_admin', actor_user_id: U[actor],
    outlet_id: null, movement_count: 1, lines: '[]', is_suspected_duplicate: false, ...overrides,
  }
  const keys = Object.keys(row)
  return [`insert into inventory_audit_log (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')})`, keys.map((k) => row[k])]
}

async function checkAuditLog(db) {
  await hole(db, 'L5 an account without inventory cannot write the audit log', 'registerA', ...auditInsert('registerA'))
  await hole(db, 'L5 a client cannot forge a failed outcome', 'invA', ...auditInsert('invA', { outcome: 'failed' }))
  await hole(db, 'L5 a client cannot name another store\'s branch', 'invA', ...auditInsert('invA', { outlet_id: OUT_B1 }))
  await hole(db, 'L5 a duplicate flag needs two real movements', 'branchA1', ...auditInsert('branchA1', { outlet_id: OUT_A1, is_suspected_duplicate: true }))
  await compat(db, 'L5 manual movement audit (auditManualMovement) still writes', 'invA', ...auditInsert('invA'))

  await commitAs(db, 'branchA1', [movement('waste', -1, OUT_A1), movement('waste', -1, OUT_A1)])
  await compat(db, 'L5 a real repeat may still be flagged', 'branchA1', ...auditInsert('branchA1', { outlet_id: OUT_A1, is_suspected_duplicate: true }))
}

// ---------------------------------------------------------------------------
async function main() {
  const db = new PGlite()
  try {
    await installPlatformAuth(db)
    await installInventorySchema(db)
    await db.exec(SEED)
    if (!IS_BASELINE) {
      for (const name of MIGRATIONS) {
        await db.exec(readMigration(name))
        await db.exec(readMigration(name)) // idempotent
      }
    }

    await checkStockAlerts(db)
    await checkPresell(db)
    await checkTransfers(db)
    await checkCounts(db)
    await checkTenantConsistency(db)
    await checkUnitsAndDeletes(db)
    await checkAuditLog(db)
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
