// Staff write permissions (security review 2026-10-26), pinned in PGlite.
//
// Loads a stub of the live platform schema with the policies EXACTLY as live had
// them (tests/sql/lib/staff-writes-stub.cjs), then the REAL migration
//   20261026130000_staff_write_permissions.sql
// and checks, as the role that really runs the query, who may write what:
// affected rows for UPDATE / DELETE (RLS refusals are silent), 42501 for INSERT.
//
//   node tests/sql/run-staff-write-permissions.cjs             must pass
//   node tests/sql/run-staff-write-permissions.cjs --baseline  old policies only; must FAIL
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { REPO_ROOT, installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')
const { HELPERS, TABLES, PRE_POLICIES } = require('./lib/staff-writes-stub.cjs')

const MIGRATION = '20261026130000_staff_write_permissions.sql'
const IS_BASELINE = process.argv.includes('--baseline')

const T_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_B = 'bbbbbbbb-0000-4000-8000-000000000001'
const OUT_A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const OUT_A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const OUT_B1 = 'bbbbbbbb-0000-4000-8000-0000000000b1'

const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  legacy: '00000000-0000-4000-8000-000000000002',
  menu: '00000000-0000-4000-8000-000000000003',
  kitchen: '00000000-0000-4000-8000-000000000004',
  analytics: '00000000-0000-4000-8000-000000000005',
  storeSetup: '00000000-0000-4000-8000-000000000006',
  costs: '00000000-0000-4000-8000-000000000007',
  settings: '00000000-0000-4000-8000-000000000008',
  branchSetup: '00000000-0000-4000-8000-000000000009',
  branchMenu: '00000000-0000-4000-8000-00000000000a',
  superadmin: '00000000-0000-4000-8000-00000000000b',
  otherOwner: '00000000-0000-4000-8000-00000000000c',
  platformStaff: '00000000-0000-4000-8000-00000000000d',
}
const ACTORS = [...Object.keys(U), 'anon']

// Deterministic row ids: table index × row slot.
const rowId = (tableIndex, slot) => `cccccccc-${String(tableIndex).padStart(4, '0')}-4000-8000-${String(slot).padStart(12, '0')}`

// Tenant-keyed tables: [name, inactive-flag column or null].
const TENANT_TABLES = [
  ['menu_items', 'is_available'], ['categories', 'is_active'], ['payment_methods', 'is_active'],
  ['order_types', 'is_enabled'], ['order_type_item_prices', null], ['customer_form_fields', null],
  ['product_detail_settings', null], ['upsell_pairs', 'is_active'], ['product_costs', null],
  ['tenant_secrets', null], ['bundles', 'is_active'], ['complementary_pairs', 'is_active'],
  ['pairing_rules', null], ['tag_definitions', null], ['menu_item_tags', null], ['loyverse_item_map', null],
  ['analytics_events', null], ['daily_stats', null], ['product_analytics', null],
]

function seedSql() {
  const rows = []
  TENANT_TABLES.forEach(([table, flag], index) => {
    const cols = flag ? `(id, tenant_id, ${flag})` : '(id, tenant_id)'
    const value = (slot, tenant, on) => (flag ? `('${rowId(index, slot)}', '${tenant}', ${on})` : `('${rowId(index, slot)}', '${tenant}')`)
    // tenant_secrets is one row per tenant.
    const values = table === 'tenant_secrets'
      ? [value(1, T_A, true), value(3, T_B, true)]
      : [value(1, T_A, true), value(2, T_A, false), value(3, T_B, true)]
    rows.push(`insert into ${table} ${cols} values ${values.join(', ')};`)
  })
  const pm = (slot) => rowId(TENANT_TABLES.findIndex(([t]) => t === 'payment_methods'), slot)
  const bundle = (slot) => rowId(TENANT_TABLES.findIndex(([t]) => t === 'bundles'), slot)
  return `
    insert into tenants (id) values ('${T_A}'), ('${T_B}');
    insert into outlets (id, tenant_id) values ('${OUT_A1}', '${T_A}'), ('${OUT_A2}', '${T_A}'), ('${OUT_B1}', '${T_B}');
    insert into auth.users select unnest(array[${Object.values(U).map((id) => `'${id}'::uuid`).join(',')}]);
    insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id, platform_permissions) values
      ('${U.owner}',        'admin', '${T_A}', true,  '{}',                    null, null),
      ('${U.legacy}',       'admin', '${T_A}', false, null,                    null, null),
      ('${U.menu}',         'admin', '${T_A}', false, '{menu}',                null, null),
      ('${U.kitchen}',      'admin', '${T_A}', false, '{kitchen}',             null, null),
      ('${U.analytics}',    'admin', '${T_A}', false, '{analytics}',           null, null),
      ('${U.storeSetup}',   'admin', '${T_A}', false, '{store_setup}',         null, null),
      ('${U.costs}',        'admin', '${T_A}', false, '{costs}',               null, null),
      ('${U.settings}',     'admin', '${T_A}', false, '{settings}',            null, null),
      ('${U.branchSetup}',  'admin', '${T_A}', false, '{store_setup,settings}', '${OUT_A1}', null),
      ('${U.branchMenu}',   'admin', '${T_A}', false, '{menu}',                '${OUT_A1}', null),
      ('${U.superadmin}',   'superadmin', null, false, null,                   null, null),
      ('${U.otherOwner}',   'admin', '${T_B}', true,  '{}',                    null, null),
      ('${U.platformStaff}','platform_staff', null, false, null,               null, '{stores.edit,stores.view}');
    ${rows.join('\n')}
    insert into payment_method_order_types (id, payment_method_id) values
      ('dddddddd-0000-4000-8000-000000000001', '${pm(1)}'), ('dddddddd-0000-4000-8000-000000000003', '${pm(3)}');
    insert into bundle_slots (id, bundle_id) values
      ('dddddddd-0001-4000-8000-000000000001', '${bundle(1)}'), ('dddddddd-0001-4000-8000-000000000003', '${bundle(3)}');
    insert into bundle_slot_price_overrides (id, slot_id) values
      ('dddddddd-0002-4000-8000-000000000001', 'dddddddd-0001-4000-8000-000000000001'),
      ('dddddddd-0002-4000-8000-000000000003', 'dddddddd-0001-4000-8000-000000000003');
    insert into outlet_menu_items (id, tenant_id, outlet_id) values
      ('dddddddd-0003-4000-8000-0000000000a1', '${T_A}', '${OUT_A1}'),
      ('dddddddd-0003-4000-8000-0000000000a2', '${T_A}', '${OUT_A2}'),
      ('dddddddd-0003-4000-8000-0000000000b1', '${T_B}', '${OUT_B1}');
    insert into push_tokens (tenant_id, user_id, token, outlet_id) values
      ('${T_A}', '${U.branchMenu}', 'tok-branch', '${OUT_A1}'),
      ('${T_A}', '${U.menu}', 'tok-menu', null);
    insert into orders (id, tenant_id, status, daily_number, total, customer_name, customer_contact, customer_data) values
      ('eeeeeeee-0000-4000-8000-000000000001', '${T_A}', 'pending', 7, 250, 'Ana', '09171234567', '{"address":"secret"}');
  `
}

function actAs(db, actor) {
  return actor === 'anon' ? asAnon(db) : as(db, 'authenticated', U[actor])
}

/** Run one statement as `actor` inside a rolled-back transaction: affected rows, or 'denied'. */
async function attempt(db, actor, sql, params = []) {
  await db.exec('begin')
  try {
    await actAs(db, actor)
    const result = await db.query(sql, params)
    return result.affectedRows ?? result.rows.length
  } catch (error) {
    if (/row-level security|permission denied/.test(error.message)) return 'denied'
    throw error
  } finally {
    await db.exec('rollback')
    await reset(db)
  }
}

/** Who gets a non-zero result; every other actor must get 0 or 'denied'. */
async function assertWriters(db, label, sql, allowed, params = []) {
  const got = {}
  for (const actor of ACTORS) got[actor] = await attempt(db, actor, sql, params)
  const writers = ACTORS.filter((actor) => typeof got[actor] === 'number' && got[actor] > 0)
  assert.deepEqual(writers.sort(), [...allowed].sort(), `${label}: writers were ${JSON.stringify(got)}`)
}

async function visibleCounts(db, tables) {
  const counts = {}
  for (const actor of ACTORS) {
    await actAs(db, actor)
    for (const table of tables) {
      counts[`${actor}:${table}`] = Number((await db.query(`select count(*)::int as n from ${table}`)).rows[0].n)
    }
    await reset(db)
  }
  return counts
}

const SELECT_TABLES = [...TENANT_TABLES.map(([t]) => t), 'tenants', 'outlets', 'outlet_menu_items',
  'payment_method_order_types', 'bundle_slots', 'bundle_slot_price_overrides', 'push_tokens']

const MENU = ['owner', 'legacy', 'menu', 'branchMenu', 'superadmin']
const SETUP = ['owner', 'legacy', 'storeSetup', 'branchSetup', 'superadmin']
const ONLY_SA = ['superadmin']

async function main() {
  const db = new PGlite()
  try {
    await installPlatformAuth(db)
    await db.exec(HELPERS)
    await db.exec(TABLES)
    await db.exec(PRE_POLICIES)
    await db.exec(seedSql())

    const before = await visibleCounts(db, SELECT_TABLES)
    if (!IS_BASELINE) await db.exec(readMigration(MIGRATION))

    // 1. SELECT is exactly what it was, for every actor and table.
    assert.deepEqual(await visibleCounts(db, SELECT_TABLES), before, 'SELECT visibility unchanged')

    // 2. Write predicates, one UPDATE per table on tenant A's row(s).
    const tenantRow = (table) => rowId(TENANT_TABLES.findIndex(([t]) => t === table), 1)
    const updateRow = (table) => `update ${table} set note = 'x' where id = '${tenantRow(table)}'`
    await assertWriters(db, 'menu_items', updateRow('menu_items'), [...MENU, 'analytics', 'platformStaff'])
    await assertWriters(db, 'categories', updateRow('categories'), MENU)
    for (const table of ['payment_methods', 'order_types', 'order_type_item_prices', 'customer_form_fields', 'product_detail_settings']) {
      await assertWriters(db, table, updateRow(table), SETUP)
    }
    await assertWriters(db, 'payment_method_order_types',
      "update payment_method_order_types set note = 'x' where id = 'dddddddd-0000-4000-8000-000000000001'", SETUP)
    await assertWriters(db, 'upsell_pairs', updateRow('upsell_pairs'), ['owner', 'legacy', 'analytics', 'superadmin'])
    await assertWriters(db, 'product_costs', updateRow('product_costs'), ['owner', 'legacy', 'costs', 'superadmin'])
    for (const table of ['tenant_secrets', 'bundles', 'complementary_pairs', 'pairing_rules', 'tag_definitions',
      'menu_item_tags', 'loyverse_item_map', 'analytics_events', 'daily_stats', 'product_analytics']) {
      await assertWriters(db, table, updateRow(table), ONLY_SA)
    }
    await assertWriters(db, 'bundle_slots', "update bundle_slots set note = 'x' where id = 'dddddddd-0001-4000-8000-000000000001'", ONLY_SA)
    await assertWriters(db, 'bundle_slot_price_overrides',
      "update bundle_slot_price_overrides set note = 'x' where id = 'dddddddd-0002-4000-8000-000000000001'", ONLY_SA)

    // Branch menus: the account's own branch only; store-wide menu or setup holders anywhere.
    await assertWriters(db, 'outlet_menu_items @A1', "update outlet_menu_items set note = 'x' where id = 'dddddddd-0003-4000-8000-0000000000a1'",
      ['owner', 'legacy', 'menu', 'storeSetup', 'branchSetup', 'branchMenu', 'superadmin'])
    await assertWriters(db, 'outlet_menu_items @A2', "update outlet_menu_items set note = 'x' where id = 'dddddddd-0003-4000-8000-0000000000a2'",
      ['owner', 'legacy', 'menu', 'storeSetup', 'superadmin'])
    await assertWriters(db, 'outlet_menu_items insert @A2',
      `insert into outlet_menu_items (id, tenant_id, outlet_id) values (gen_random_uuid(), '${T_A}', '${OUT_A2}')`,
      ['owner', 'legacy', 'menu', 'storeSetup', 'superadmin'])
    await assertWriters(db, 'outlet_menu_items move to A2',
      `update outlet_menu_items set outlet_id = '${OUT_A2}' where id = 'dddddddd-0003-4000-8000-0000000000a1'`,
      ['owner', 'legacy', 'menu', 'storeSetup', 'superadmin'])

    // Branches: store setup on a store-wide account.
    await assertWriters(db, 'outlets', `update outlets set note = 'x' where id = '${OUT_A1}'`, ['owner', 'legacy', 'storeSetup', 'superadmin'])
    await assertWriters(db, 'outlets insert', `insert into outlets (id, tenant_id) values (gen_random_uuid(), '${T_A}')`,
      ['owner', 'legacy', 'storeSetup', 'superadmin'])
    await assertWriters(db, 'outlets delete', `delete from outlets where id = '${OUT_A2}'`, ['owner', 'legacy', 'storeSetup', 'superadmin'])

    // The store row: store setup, settings or analytics (Boost); branch accounts too.
    await assertWriters(db, 'tenants', `update tenants set note = 'x' where id = '${T_A}'`,
      ['owner', 'legacy', 'storeSetup', 'settings', 'analytics', 'branchSetup', 'superadmin'])

    // INSERT / DELETE follow the same key (representative tables).
    await assertWriters(db, 'menu_items insert', `insert into menu_items (id, tenant_id) values (gen_random_uuid(), '${T_A}')`,
      [...MENU, 'analytics'])
    await assertWriters(db, 'payment_methods insert', `insert into payment_methods (id, tenant_id) values (gen_random_uuid(), '${T_A}')`, SETUP)
    await assertWriters(db, 'payment_methods delete', `delete from payment_methods where id = '${tenantRow('payment_methods')}'`, SETUP)
    await assertWriters(db, 'product_costs insert', `insert into product_costs (id, tenant_id) values (gen_random_uuid(), '${T_A}')`,
      ['owner', 'legacy', 'costs', 'superadmin'])
    await assertWriters(db, 'bundles insert', `insert into bundles (id, tenant_id) values (gen_random_uuid(), '${T_A}')`, ONLY_SA)
    await assertWriters(db, 'tenant_secrets insert', `insert into tenant_secrets (id, tenant_id) values (gen_random_uuid(), '${T_A}') on conflict (tenant_id) do update set note = 'x'`, ONLY_SA)
    // Nobody moves a row into another store.
    await assertWriters(db, 'menu_items to tenant B', `update menu_items set tenant_id = '${T_B}' where id = '${tenantRow('menu_items')}'`, ['superadmin', 'platformStaff'])

    // 3. Push tokens: a branch-locked account rings only for its own branch.
    const insertToken = (actor, outlet) =>
      `insert into push_tokens (tenant_id, user_id, token, outlet_id) values ('${T_A}', '${U[actor]}', 'new-${actor}', ${outlet ? `'${outlet}'` : 'null'})`
    for (const [actor, outlet, expected] of [
      ['branchMenu', null, 'denied'], ['branchMenu', OUT_A2, 'denied'], ['branchMenu', OUT_A1, 1],
      ['menu', null, 1], ['menu', OUT_A2, 1], ['owner', null, 1], ['kitchen', OUT_A1, 1],
    ]) {
      assert.equal(await attempt(db, actor, insertToken(actor, outlet)), expected, `push token ${actor} @${outlet}`)
    }
    assert.equal(await attempt(db, 'menu', insertToken('owner', null)), 'denied', 'no token for someone else')
    assert.equal(await attempt(db, 'branchMenu', "update push_tokens set outlet_id = null where token = 'tok-branch'"), 'denied',
      'branch account cannot widen its token to every branch')
    assert.equal(await attempt(db, 'branchMenu', "update push_tokens set note = 'x' where token = 'tok-branch'"), 1, 'own token refresh')
    assert.equal(await attempt(db, 'branchMenu', "delete from push_tokens where token = 'tok-branch'"), 1, 'own token delete')

    // 4. get_customer_order: five display columns, anon only.
    await asAnon(db)
    const order = await db.query("select * from get_customer_order('eeeeeeee-0000-4000-8000-000000000001')")
    await reset(db)
    assert.deepEqual(order.fields.map((field) => field.name), ['id', 'status', 'daily_number', 'total', 'customer_name'])
    assert.equal(order.rows[0].daily_number, 7)
    assert.equal(await attempt(db, 'owner', "select * from get_customer_order('eeeeeeee-0000-4000-8000-000000000001')"), 'denied')

    // 5. Sign-up requests are no longer writable by anyone with the public key.
    assert.equal(await attempt(db, 'anon', "insert into app_signup_requests (email) values ('x@example.com')"), 'denied')

    // 6. One active connection per Facebook Page across all stores.
    await db.exec(`insert into facebook_pages (id, tenant_id, page_id, is_active) values (gen_random_uuid(), '${T_A}', 'page-1', true)`)
    await assert.rejects(db.exec(`insert into facebook_pages (id, tenant_id, page_id, is_active) values (gen_random_uuid(), '${T_B}', 'page-1', true)`),
      /duplicate key/)
    await db.exec(`insert into facebook_pages (id, tenant_id, page_id, is_active) values (gen_random_uuid(), '${T_B}', 'page-1', false)`)

    // 7. Advisor fixes.
    const config = await db.query(`select p.proname, p.proconfig from pg_proc p where p.proname in ('apply_presell_order', 'tenant_secrets_touch_updated_at') order by 1`)
    assert.deepEqual(config.rows.map((row) => [row.proname, row.proconfig]), [
      ['apply_presell_order', ['search_path=public, pg_temp']],
      ['tenant_secrets_touch_updated_at', ['search_path=""']],
    ])
    const guard = await db.query(`select has_function_privilege('anon', 'public.recipe_components_unit_guard()', 'execute') as anon,
      has_function_privilege('authenticated', 'public.recipe_components_unit_guard()', 'execute') as auth`)
    assert.deepEqual(guard.rows[0], { anon: false, auth: false })

    // 8. The rollback script restores the old rules and leaves SELECT alone.
    await db.exec(readFileSync(path.join(REPO_ROOT, 'supabase/rollbacks', MIGRATION.replace('.sql', '.down.sql')), 'utf8'))
    assert.deepEqual(await visibleCounts(db, SELECT_TABLES), before, 'SELECT visibility unchanged after rollback')
    assert.equal(await attempt(db, 'kitchen', updateRow('menu_items')), 1, 'rollback restores the old write rule')
    await asAnon(db)
    const restored = await db.query("select * from get_customer_order('eeeeeeee-0000-4000-8000-000000000001')")
    await reset(db)
    assert.ok(restored.fields.some((field) => field.name === 'customer_contact'), 'rollback restores the old RPC shape')

    console.log('Staff write permission SQL regressions passed')
  } finally {
    await db.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
