// save_dish_recipes / dish_recipes_version (20261122120000), pinned in PGlite.
//
// Loads the live inventory slice (tests/sql/lib/inventory-live-schema.cjs:
// recipes RLS + guard triggers as live has them), the 2026-11-03 inventory
// migrations that live also has, then the REAL migration, and checks as the
// role that really calls it:
//   - an owner / store-wide menu account saves a dish + its sizes in one call;
//   - a stale version is refused (40001) and nothing changes;
//   - staff without menu, a branch-locked account, another store and anon are
//     refused and nothing changes (RLS is silent, so rows are counted);
//   - one bad line rolls the WHOLE save back;
//   - a legacy twin recipe of a choice is removed with it.
//
//   node tests/sql/run-save-dish-recipes.cjs
const { PGlite } = require('@electric-sql/pglite')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')
const { installInventorySchema } = require('./lib/inventory-live-schema.cjs')

const LIVE_MIGRATIONS = [
  '20261103130000_inventory_permission_hardening.sql',
  '20261103130100_inventory_transfer_count_lifecycle.sql',
  '20261103130200_inventory_tenant_consistency.sql',
  '20261103130300_inventory_unit_and_delete_guards.sql',
]
const MIGRATION = '20261122120000_save_dish_recipes.sql'

const T_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_B = 'bbbbbbbb-0000-4000-8000-000000000001'
const OUT_A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const U = {
  ownerA: '00000000-0000-4000-8000-000000000001',
  menuA: '00000000-0000-4000-8000-000000000003',
  branchA1: '00000000-0000-4000-8000-000000000004',
  registerA: '00000000-0000-4000-8000-000000000006',
  ownerB: '00000000-0000-4000-8000-000000000007',
  superadmin: '00000000-0000-4000-8000-000000000008',
}
const id = (group, n) => `cccccccc-${String(group).padStart(4, '0')}-4000-8000-${String(n).padStart(12, '0')}`
const UNIT = { aMl: id(1, 1), aPc: id(1, 2), aG: id(1, 3), bMl: id(1, 4) }
const ITEM = { milk: id(2, 1), cup: id(2, 2), beans: id(2, 3), bMilk: id(2, 4) }
const MENU = { latte: id(3, 1), b: id(3, 2) }
const TWIN = id(4, 1)

const SEED = `
  insert into tenants values ('${T_A}'), ('${T_B}');
  insert into outlets (id, tenant_id, name) values ('${OUT_A1}', '${T_A}', 'A1');
  insert into auth.users select unnest(array[${Object.values(U).map((u) => `'${u}'::uuid`).join(',')}]);
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id) values
    ('${U.ownerA}',     'admin', '${T_A}', true,  '{}',               null),
    ('${U.menuA}',      'admin', '${T_A}', false, '{menu}',           null),
    ('${U.branchA1}',   'admin', '${T_A}', false, '{inventory,menu}', '${OUT_A1}'),
    ('${U.registerA}',  'admin', '${T_A}', false, '{pos}',            null),
    ('${U.ownerB}',     'admin', '${T_B}', true,  '{}',               null),
    ('${U.superadmin}', 'superadmin', null, false, null,              null);
  insert into inventory_units (id, tenant_id, name, abbreviation, dimension, to_base_factor) values
    ('${UNIT.aMl}', '${T_A}', 'Millilitre', 'ml', 'volume', 1),
    ('${UNIT.aPc}', '${T_A}', 'Piece', 'pc', 'count', 1),
    ('${UNIT.aG}', '${T_A}', 'Gram', 'g', 'weight', 1),
    ('${UNIT.bMl}', '${T_B}', 'Millilitre', 'ml', 'volume', 1);
  insert into inventory_items (id, tenant_id, name, stock_unit_id) values
    ('${ITEM.milk}', '${T_A}', 'Milk', '${UNIT.aMl}'),
    ('${ITEM.cup}', '${T_A}', 'Cup', '${UNIT.aPc}'),
    ('${ITEM.beans}', '${T_A}', 'Beans', '${UNIT.aG}'),
    ('${ITEM.bMilk}', '${T_B}', 'Milk', '${UNIT.bMl}');
  insert into menu_items (id, tenant_id) values ('${MENU.latte}', '${T_A}'), ('${MENU.b}', '${T_B}');
  -- A legacy twin: the Large size was once costed as a variation option.
  insert into recipes (id, tenant_id, target_type, menu_item_id, variation_option_id) values
    ('${TWIN}', '${T_A}', 'variation_option', '${MENU.latte}', 'large');
  insert into recipe_components (tenant_id, recipe_id, inventory_item_id, quantity, unit_id) values
    ('${T_A}', '${TWIN}', '${ITEM.milk}', 999, '${UNIT.aMl}');
`

const results = []
const record = (name, isOk, detail) => results.push({ name, isOk, detail })

function actAs(db, actor) {
  if (actor === 'anon') return asAnon(db)
  if (actor === 'service') return as(db, 'service_role', null)
  return as(db, 'authenticated', U[actor])
}

async function scalar(db, sql, params = []) {
  await reset(db)
  const { rows } = await db.query(sql, params)
  return rows[0] ? Object.values(rows[0])[0] : undefined
}

const version = (db, menu = MENU.latte, tenant = T_A) =>
  scalar(db, 'select public.dish_recipes_version($1, $2) as v', [tenant, menu])

/** Call save_dish_recipes as `actor`, committed on success. Returns { version } or { error, code }. */
async function save(db, actor, expected, targets, { tenant = T_A, menu = MENU.latte } = {}) {
  await db.exec('begin')
  try {
    await actAs(db, actor)
    const { rows } = await db.query('select public.save_dish_recipes($1, $2, $3, $4::jsonb) as v', [
      tenant, menu, expected, JSON.stringify(targets),
    ])
    await reset(db)
    await db.exec('commit')
    return { version: rows[0].v }
  } catch (error) {
    await db.exec('rollback')
    await reset(db)
    return { error: error.message, code: error.code }
  }
}

/** Every recipe line of the dish as "kind:option:item:qty", sorted. */
async function snapshot(db, menu = MENU.latte) {
  await reset(db)
  const { rows } = await db.query(
    `select r.target_type || ':' || coalesce(r.modifier_option_id, r.variation_option_id, r.addon_id, '-') || ':' ||
            coalesce(i.name, '?') || ':' || coalesce(c.quantity::numeric(16,4)::text, '') as line
       from recipes r left join recipe_components c on c.recipe_id = r.id left join inventory_items i on i.id = c.inventory_item_id
      where r.menu_item_id = $1 order by 1`,
    [menu],
  )
  return rows.map((row) => row.line)
}

const line = (item, quantity, unit) => ({ inventory_item_id: item, quantity, unit_id: unit })
const LATTE = [
  { target_type: 'menu_item', option_id: null, components: [line(ITEM.milk, 180, UNIT.aMl), line(ITEM.cup, 1, UNIT.aPc)] },
  { target_type: 'modifier_option', option_id: 'small', components: [] },
  { target_type: 'modifier_option', option_id: 'medium', components: [line(ITEM.milk, 40, UNIT.aMl)] },
  { target_type: 'modifier_option', option_id: 'large', components: [line(ITEM.milk, 70, UNIT.aMl)] },
]

async function run(db) {
  // --- refusals first, while the dish holds only the twin --------------------
  const start = await version(db)
  const before = await snapshot(db)
  for (const actor of ['registerA', 'branchA1', 'ownerB']) {
    const outcome = await save(db, actor, start, LATTE)
    const after = await snapshot(db)
    record(`${actor} is refused and nothing changes`, Boolean(outcome.error) && JSON.stringify(after) === JSON.stringify(before), outcome)
  }
  {
    const outcome = await save(db, 'anon', start, LATTE)
    record('anon cannot call it', /permission denied/i.test(outcome.error ?? ''), outcome)
  }
  {
    // A branch-locked account trying only to CLEAR the twin is refused too (silent RLS → counted).
    const outcome = await save(db, 'branchA1', start, [{ target_type: 'variation_option', option_id: 'large', components: [] }])
    record('branch-locked clear is refused with 42501, twin still there', outcome.code === '42501' && (await snapshot(db)).length === 1, outcome)
  }

  // --- the owner saves dish + sizes in one call -------------------------------
  const saved = await save(db, 'ownerA', start, LATTE)
  const lines = await snapshot(db)
  record('owner saves the dish and its sizes in one call', !saved.error && JSON.stringify(lines) === JSON.stringify([
    'menu_item:-:Cup:1.0000',
    'menu_item:-:Milk:180.0000',
    'modifier_option:large:Milk:70.0000',
    'modifier_option:medium:Milk:40.0000',
  ]), { saved, lines })
  record('the legacy twin of Large is gone (one recipe per choice)', !lines.some((l) => l.startsWith('variation_option')), lines)
  record('it returns the new version', saved.version === (await version(db)) && saved.version !== start, saved)

  // --- stale version ---------------------------------------------------------
  {
    const outcome = await save(db, 'ownerA', start, LATTE)
    record('a stale version is refused with 40001', outcome.code === '40001', outcome)
  }

  // --- all or nothing ---------------------------------------------------------
  {
    const current = await version(db)
    const outcome = await save(db, 'menuA', current, [
      { target_type: 'menu_item', option_id: null, components: [line(ITEM.milk, 200, UNIT.aMl)] },
      // grams of a cup stocked by the piece: the unit guard refuses this line
      { target_type: 'modifier_option', option_id: 'large', components: [line(ITEM.cup, 5, UNIT.aG)] },
    ])
    const after = await snapshot(db)
    record('one bad line rolls back the whole save', Boolean(outcome.error) && after.includes('menu_item:-:Milk:180.0000'), { outcome, after })
  }
  {
    const current = await version(db)
    const outcome = await save(db, 'ownerA', current, [
      { target_type: 'modifier_option', option_id: 'large', components: [line(ITEM.milk, 0, UNIT.aMl)] },
    ])
    record('a zero amount is refused (22023)', outcome.code === '22023', outcome)
  }
  {
    const current = await version(db)
    const outcome = await save(db, 'ownerA', current, [
      { target_type: 'menu_item', option_id: null, components: [line(ITEM.bMilk, 5, UNIT.bMl)] },
    ])
    record('another store\'s ingredient is refused', Boolean(outcome.error), outcome)
  }
  {
    const current = await version(db)
    const outcome = await save(db, 'ownerA', current, [{ target_type: 'menu_item', option_id: 'x', components: [] }])
    record('a dish recipe with a choice id is refused', outcome.code === '22023', outcome)
  }

  // --- store-wide menu staff and superadmin keep working ---------------------
  {
    const current = await version(db)
    const outcome = await save(db, 'menuA', current, [
      { target_type: 'modifier_option', option_id: 'large', components: [line(ITEM.milk, 80, UNIT.aMl)] },
      { target_type: 'modifier_option', option_id: 'medium', components: [] },
    ])
    const after = await snapshot(db)
    record('store-wide menu staff can change sizes and clear one', !outcome.error &&
      after.includes('modifier_option:large:Milk:80.0000') && !after.some((l) => l.startsWith('modifier_option:medium')), { outcome, after })
  }
  {
    const current = await version(db)
    const outcome = await save(db, 'superadmin', current, [
      { target_type: 'modifier_option', option_id: 'small', components: [line(ITEM.beans, 2, UNIT.aG)] },
    ])
    record('superadmin can save', !outcome.error, outcome)
  }

  // --- the version notices the older per-recipe writer ------------------------
  {
    const current = await version(db)
    await db.exec('begin')
    await actAs(db, 'ownerA')
    await db.query(`update recipes set updated_at = now() + interval '1 second' where menu_item_id = $1 and target_type = 'menu_item'`, [MENU.latte])
    await reset(db)
    await db.exec('commit')
    record('a write through the per-recipe route changes the version', (await version(db)) !== current, null)
  }
  {
    const current = await version(db)
    await db.exec('begin')
    await actAs(db, 'ownerA')
    await db.query(`delete from recipe_components where recipe_id in (select id from recipes where menu_item_id = $1 and modifier_option_id = 'small')`, [MENU.latte])
    await reset(db)
    await db.exec('commit')
    record('removing a line changes the version', (await version(db)) !== current, null)
  }
  record('another store\'s dish has its own version', (await version(db, MENU.b, T_B)) !== (await version(db)), null)
}

async function main() {
  const db = new PGlite()
  try {
    await installPlatformAuth(db)
    await installInventorySchema(db)
    await db.exec(SEED)
    for (const name of LIVE_MIGRATIONS) await db.exec(readMigration(name))
    await db.exec(readMigration(MIGRATION))
    await db.exec(readMigration(MIGRATION)) // idempotent
    await run(db)
  } finally {
    await db.close()
  }
  for (const r of results) console.log(`${r.isOk ? 'ok  ' : 'FAIL'} ${r.name}${r.isOk ? '' : ` -> ${JSON.stringify(r.detail)}`}`)
  const failed = results.filter((r) => !r.isOk)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (failed.length > 0) process.exitCode = 1
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
