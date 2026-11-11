// Dropping the per-store Supabase credential columns
// (20261110150000_drop_per_store_supabase_columns.sql), pinned in PGlite.
//
// Builds tenants the way production did: a stub table, then the REAL
// migrations that added order_backend + the five supabase_order_* columns
// (20260721000000) and the `auto` default / CHECK (20260728160000), then the
// LIVE privileged-column guard (function body from 20261107120000, trigger
// from 20260923120000). Then runs the REAL drop migration and asserts:
//   - any non-empty value in any of the four columns refuses the whole
//     migration (P0001) and nothing is dropped; blank / spaces-only is empty;
//   - a store pinned to order_backend = 'supabase' refuses it too;
//   - something depending on a column (a view) makes the drop fail with all
//     four columns still there (no CASCADE);
//   - a clean table loses exactly the four columns: every row, order_backend,
//     its CHECK and supabase_order_schema_version are untouched;
//   - it is re-runnable;
//   - the guard, which still LISTS the dropped names, keeps working as the
//     role that really runs the query: staff may save an ordinary column,
//     are refused (42501) on a privileged one, the service role is not.
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, reset, readMigration } = require('./lib/platform-auth.cjs')

const MIGRATION = '20261110150000_drop_per_store_supabase_columns.sql'
const DROPPED = ['supabase_order_url', 'supabase_order_anon_key', 'supabase_order_service_key', 'supabase_order_db_url']
const T_PLATFORM = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_CONVEX = 'bbbbbbbb-0000-4000-8000-000000000001'
const OWNER = '00000000-0000-4000-8000-000000000001'

const STUB = `
  create table public.tenants (
    id uuid primary key,
    name text not null,
    convex_deployment_url text
  );
  create table public.app_users (
    user_id uuid primary key,
    role text not null,
    tenant_id uuid
  );
  insert into public.tenants (id, name, convex_deployment_url) values
    ('${T_PLATFORM}', 'Platform Store', null),
    ('${T_CONVEX}', 'Convex Store', 'https://happy-otter-1.convex.cloud');
  insert into public.app_users (user_id, role, tenant_id) values ('${OWNER}', 'admin', '${T_PLATFORM}');
`

/** The latest guard body, cut out of the migration that last replaced it. */
function liveGuardFunction() {
  const sql = readMigration('20261107120000_inventory_flags_and_policies.sql')
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.guard_tenant_privileged_columns()')
  const end = sql.indexOf('$function$;', start)
  assert.ok(start > 0 && end > start, 'guard function not found in 20261107120000')
  const body = sql.slice(start, end + '$function$;'.length)
  for (const column of DROPPED) assert.ok(body.includes(`'${column}'`), `the live guard no longer lists ${column}`)
  return body
}

function guardTrigger() {
  const sql = readMigration('20260923120000_lock_tenant_privileged_columns.sql')
  const start = sql.indexOf('drop trigger if exists tenants_guard_privileged_columns on public.tenants;')
  const end = sql.indexOf('execute function public.guard_tenant_privileged_columns();', start)
  assert.ok(start > 0 && end > start, 'guard trigger not found in 20260923120000')
  return sql.slice(start, end + 'execute function public.guard_tenant_privileged_columns();'.length)
}

async function buildDb() {
  const db = new PGlite()
  await installPlatformAuth(db)
  await db.exec(STUB)
  await db.exec(readMigration('20260721000000_order_backend.sql'))
  await db.exec(readMigration('20260728160000_order_backend_auto_default.sql'))
  await db.exec(liveGuardFunction())
  await db.exec(guardTrigger())
  return db
}

async function columnsOf(db) {
  const { rows } = await db.query(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'tenants' order by ordinal_position`,
  )
  return rows.map((row) => row.column_name)
}

async function refused(promise, code, label) {
  let error = null
  try {
    await promise
  } catch (caught) {
    error = caught
  }
  assert.ok(error, `${label}: expected a refusal`)
  assert.equal(error.code, code, `${label}: expected ${code}, got ${error.code} (${error.message})`)
  return error
}

async function assertNothingDropped(db, label) {
  const columns = await columnsOf(db)
  for (const column of DROPPED) assert.ok(columns.includes(column), `${label}: ${column} must still exist`)
}

async function main() {
  const migration = readMigration(MIGRATION)
  const db = await buildDb()
  try {
    const before = await columnsOf(db)
    for (const column of DROPPED) assert.ok(before.includes(column), `fixture is missing ${column}`)

    // The guard is live WITH the columns: staff cannot write a credential.
    await as(db, 'authenticated', OWNER)
    await refused(
      db.query(`update public.tenants set supabase_order_url = 'https://mine.supabase.co' where id = $1`, [T_PLATFORM]),
      '42501',
      'staff writing a per-store credential before the drop',
    )
    await reset(db)

    // 1. A value in ANY of the four columns refuses the whole migration.
    for (const column of DROPPED) {
      await db.query(`update public.tenants set ${column} = 'in-use' where id = $1`, [T_PLATFORM])
      const error = await refused(db.exec(migration), 'P0001', `a value in ${column}`)
      assert.match(error.message, new RegExp(`tenants\\.${column}: 1 row`), `the refusal names ${column} and the row count`)
      await assertNothingDropped(db, `a value in ${column}`)
      const kept = await db.query(`select ${column} as value from public.tenants where id = $1`, [T_PLATFORM])
      assert.equal(kept.rows[0].value, 'in-use', `${column}: the value survives the refusal`)
      await db.query(`update public.tenants set ${column} = null where id = $1`, [T_PLATFORM])
    }

    // 2. A store pinned to the retired backend refuses it, even with empty columns.
    await db.query(`update public.tenants set order_backend = 'supabase' where id = $1`, [T_PLATFORM])
    const pinned = await refused(db.exec(migration), 'P0001', 'a store pinned to supabase')
    assert.match(pinned.message, /1 store\(s\) are pinned/)
    await assertNothingDropped(db, 'a store pinned to supabase')
    await db.query(`update public.tenants set order_backend = 'auto' where id = $1`, [T_PLATFORM])

    // 3. A dependent object blocks the drop outright: all four or none, no CASCADE.
    await db.exec(`create view public.per_store_peek as select id, supabase_order_db_url from public.tenants`)
    await refused(db.exec(migration), '2BP01', 'a view depending on a column')
    await assertNothingDropped(db, 'a view depending on a column')
    await db.exec(`drop view public.per_store_peek`)

    // 4. Blank and space-only values are empty: the migration goes through.
    await db.query(
      `update public.tenants set supabase_order_url = '', supabase_order_anon_key = '   ',
              supabase_order_service_key = ' ', supabase_order_db_url = null, supabase_order_schema_version = 4
        where id = $1`,
      [T_PLATFORM],
    )
    const rowsBefore = (await db.query(`select id, name, order_backend, convex_deployment_url, supabase_order_schema_version from public.tenants order by id`)).rows
    await db.exec(migration)

    const after = await columnsOf(db)
    assert.deepEqual(after, before.filter((column) => !DROPPED.includes(column)), 'exactly the four columns are gone')
    assert.ok(after.includes('supabase_order_schema_version'), 'supabase_order_schema_version is not part of this drop')
    const rowsAfter = (await db.query(`select id, name, order_backend, convex_deployment_url, supabase_order_schema_version from public.tenants order by id`)).rows
    assert.deepEqual(rowsAfter, rowsBefore, 'every row and every other column is untouched')

    // The CHECK is unchanged: 'supabase' is still a legal value, 'bogus' is not.
    await db.query(`update public.tenants set order_backend = 'supabase' where id = $1`, [T_CONVEX])
    await db.query(`update public.tenants set order_backend = 'auto' where id = $1`, [T_CONVEX])
    await refused(db.query(`update public.tenants set order_backend = 'bogus' where id = $1`, [T_CONVEX]), '23514', 'the order_backend CHECK')

    // 5. Re-runnable.
    await db.exec(migration)
    assert.deepEqual(await columnsOf(db), after, 'a second run changes nothing')

    // 6. The guard still lists the dropped names and still works, per role.
    await as(db, 'authenticated', OWNER)
    const renamed = await db.query(`update public.tenants set name = 'Renamed' where id = $1 returning id`, [T_PLATFORM])
    assert.equal(renamed.rows.length, 1, 'staff still save an ordinary column after the drop')
    await refused(
      db.query(`update public.tenants set order_backend = 'convex' where id = $1`, [T_PLATFORM]),
      '42501',
      'staff changing order_backend after the drop',
    )
    await refused(
      db.query(`update public.tenants set convex_deployment_url = 'https://x.convex.cloud' where id = $1`, [T_PLATFORM]),
      '42501',
      'staff changing convex_deployment_url after the drop',
    )
    await as(db, 'service_role', null)
    const pinnedByService = await db.query(`update public.tenants set order_backend = 'platform' where id = $1 returning order_backend`, [T_PLATFORM])
    assert.equal(pinnedByService.rows[0]?.order_backend, 'platform', 'the service role still changes privileged columns')
    await reset(db)

    console.log(
      'Drop per-store Supabase columns: refuses any non-empty value / a supabase pin / a dependent view with nothing dropped; ' +
        'drops exactly the four on a clean table; re-runnable; the privileged-column guard still works after the drop — passed',
    )
  } finally {
    await db.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
