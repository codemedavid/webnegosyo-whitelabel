// Customer-app tables (tenant_apps, tenant_app_configs): service role only,
// store identity unique across the platform, every column check enforced.
// Runs the REAL migration over PGlite with Supabase's default grants, so the
// migration's REVOKE is what keeps anon/authenticated out.
//   node tests/sql/run-tenant-apps.cjs
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')

const STORE = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'
const ADMIN = '00000000-0000-4000-8000-000000000003'

const APP = {
  tenant_id: STORE,
  display_name: 'Kape Demo',
  bundle_id: 'com.webnegosyo.kapedemo',
  android_package: 'com.webnegosyo.kapedemo',
}

async function insertApp(db, overrides = {}) {
  const row = { ...APP, ...overrides }
  const columns = Object.keys(row)
  const values = columns.map((_, index) => `$${index + 1}`)
  return db.query(
    `insert into public.tenant_apps (${columns.join(', ')}) values (${values.join(', ')}) returning tenant_id`,
    Object.values(row),
  )
}

async function rejectsCheck(db, overrides, label) {
  await reset(db)
  await db.exec('savepoint s')
  await assert.rejects(insertApp(db, { tenant_id: OTHER, bundle_id: 'com.x.other', android_package: 'com.x.other', ...overrides }), /violates|duplicate/, label)
  await db.exec('rollback to savepoint s')
}

async function main() {
  const db = new PGlite()
  try {
    await installPlatformAuth(db)
    await db.exec(`
      create table public.tenants (id uuid primary key);
      insert into public.tenants (id) values ('${STORE}'), ('${OTHER}');
      insert into auth.users (id) values ('${ADMIN}');
    `)
    await db.exec(readMigration('20261026150000_tenant_apps.sql'))
    await db.exec('begin')

    // Service role writes and reads both tables.
    await as(db, 'service_role', null)
    assert.equal((await insertApp(db)).rows.length, 1, 'service role creates an app')
    assert.equal(
      (await db.query(`insert into public.tenant_app_configs (tenant_id, draft) values ($1, '{"fontKey":"inter"}') returning tenant_id`, [STORE])).rows.length,
      1,
      'service role creates a config',
    )
    const stored = (await db.query('select status, play_track, store_account from public.tenant_apps')).rows[0]
    assert.deepEqual(stored, { status: 'draft', play_track: 'internal', store_account: { apple: 'webnegosyo', google: 'webnegosyo' } }, 'defaults')

    // Neither client role can see or touch either table.
    for (const [label, enter] of [
      ['anon', () => asAnon(db)],
      ['authenticated', () => as(db, 'authenticated', ADMIN)],
    ]) {
      for (const table of ['tenant_apps', 'tenant_app_configs']) {
        await enter()
        await db.exec('savepoint s')
        await assert.rejects(db.query(`select * from public.${table}`), /permission denied/, `${label} cannot read ${table}`)
        await db.exec('rollback to savepoint s')
        await db.exec('savepoint s')
        await assert.rejects(db.query(`update public.${table} set updated_at = now() returning tenant_id`), /permission denied/, `${label} cannot update ${table}`)
        await db.exec('rollback to savepoint s')
        await db.exec('savepoint s')
        await assert.rejects(db.query(`delete from public.${table} returning tenant_id`), /permission denied/, `${label} cannot delete ${table}`)
        await db.exec('rollback to savepoint s')
      }
      await enter()
      await db.exec('savepoint s')
      await assert.rejects(insertApp(db, { tenant_id: OTHER, bundle_id: 'com.evil.app', android_package: 'com.evil.app' }), /permission denied/, `${label} cannot insert an app`)
      await db.exec('rollback to savepoint s')
    }

    // Identity is unique platform-wide; every format check holds.
    await rejectsCheck(db, { bundle_id: APP.bundle_id }, 'bundle id is unique')
    await rejectsCheck(db, { android_package: APP.android_package }, 'android package is unique')
    await rejectsCheck(db, { android_package: 'com.webnegosyo.kape-demo' }, 'android package refuses hyphens')
    await rejectsCheck(db, { bundle_id: 'kapedemo' }, 'bundle id needs reverse-DNS')
    await rejectsCheck(db, { display_name: 'A name far longer than thirty chars' }, 'display name ≤ 30')
    await rejectsCheck(db, { icon_url: 'http://insecure.example.com/icon.png' }, 'icon must be https')
    await rejectsCheck(db, { splash_background: 'red' }, 'splash background is #RRGGBB')
    await rejectsCheck(db, { status: 'deleted' }, 'status is one of draft/live/paused')
    await rejectsCheck(db, { min_version_ios: '1.0' }, 'versions are semver')
    await rejectsCheck(db, { asc_app_id: 'abc' }, 'ASC app id is numeric')

    // Removing a store removes its app and config.
    await reset(db)
    await db.query('delete from public.tenants where id = $1', [STORE])
    assert.equal((await db.query('select count(*)::int as n from public.tenant_apps')).rows[0].n, 0, 'app cascades with its store')
    assert.equal((await db.query('select count(*)::int as n from public.tenant_app_configs')).rows[0].n, 0, 'config cascades with its store')

    await db.exec('rollback')
    console.log('tenant_apps SQL checks passed')
  } finally {
    await db.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
