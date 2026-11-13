// Customer-app builds (tenant_app_builds, P9): service role only, one open
// build per app + platform, a status only moves forward, a finished build
// keeps its outcome. Runs the REAL migrations over PGlite with Supabase's
// default grants.
//   node tests/sql/run-tenant-app-builds.cjs
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')

const STORE = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'
const ADMIN = '00000000-0000-4000-8000-000000000003'
const EAS_ID = '11111111-2222-4333-8444-555555555555'

const hash = (n) => String(n).repeat(64).slice(0, 64)

async function insertBuild(db, overrides = {}) {
  const row = { tenant_id: STORE, platform: 'ios', token_hash: hash(1), token_expires_at: '2099-01-01T00:00:00Z', ...overrides }
  const columns = Object.keys(row)
  return db.query(
    `insert into public.tenant_app_builds (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) returning id, status, submit_status`,
    Object.values(row),
  )
}

async function rejects(db, work, pattern, label) {
  await db.exec('savepoint s')
  await assert.rejects(work(), pattern, label)
  await db.exec('rollback to savepoint s')
}

async function setStatus(db, id, status) {
  return db.query('update public.tenant_app_builds set status = $2 where id = $1 returning status', [id, status])
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
    await db.exec(readMigration('20261113120000_tenant_app_builds.sql'))
    await db.exec(`
      insert into public.tenant_apps (tenant_id, display_name, bundle_id, android_package)
      values ('${STORE}', 'Kape Demo', 'com.webnegosyo.kapedemo', 'com.webnegosyo.kapedemo');
    `)
    await db.exec('begin')

    // Service role starts a build; defaults hold.
    await as(db, 'service_role', null)
    const first = (await insertBuild(db)).rows[0]
    assert.deepEqual({ status: first.status, submit_status: first.submit_status }, { status: 'queued', submit_status: 'none' }, 'defaults')

    // One open build per app + platform; the other platform is free.
    await rejects(db, () => insertBuild(db, { token_hash: hash(2) }), /duplicate/, 'second open iOS build refused')
    const android = (await insertBuild(db, { platform: 'android', token_hash: hash(3) })).rows[0]
    assert.ok(android.id, 'android build alongside iOS')

    // A build needs an app (no app row = no build).
    await rejects(db, () => insertBuild(db, { tenant_id: OTHER, token_hash: hash(4) }), /violates foreign key/, 'store without an app refused')

    // Column checks.
    await rejects(db, () => insertBuild(db, { platform: 'web', token_hash: hash(5) }), /violates check/, 'platform is ios/android')
    await rejects(db, () => insertBuild(db, { platform: 'android', token_hash: 'short' }), /violates check/, 'token hash is sha256 hex')
    await rejects(
      db,
      () => db.query(`update public.tenant_app_builds set artifact_url = 'http://x.example/app.ipa' where id = $1`, [first.id]),
      /violates check/,
      'artifact must be https',
    )

    // Forward only: queued → preparing → building → finished.
    assert.equal((await setStatus(db, first.id, 'preparing')).rows.length, 1, 'queued → preparing')
    await rejects(db, () => setStatus(db, first.id, 'queued'), /cannot move/, 'preparing → queued refused')
    await db.query('update public.tenant_app_builds set status = $2, eas_build_id = $3 where id = $1', [first.id, 'building', EAS_ID])
    await rejects(
      db,
      () => db.query(`update public.tenant_app_builds set eas_build_id = '99999999-2222-4333-8444-555555555555' where id = $1`, [first.id]),
      /already has its EAS build/,
      'EAS build id is set once',
    )
    await rejects(db, () => db.query(`update public.tenant_app_builds set platform = 'android' where id = $1`, [first.id]), /cannot change/, 'platform fixed')
    const done = (await db.query(`update public.tenant_app_builds set status = 'finished' where id = $1 returning finished_at`, [first.id])).rows[0]
    assert.ok(done.finished_at, 'finished_at stamped')

    // A finished build keeps its outcome, but the submission can still be reported.
    await rejects(db, () => setStatus(db, first.id, 'errored'), /cannot move/, 'finished → errored refused (late webhook)')
    await rejects(db, () => setStatus(db, first.id, 'building'), /cannot move/, 'finished → building refused')
    assert.equal(
      (await db.query(`update public.tenant_app_builds set submit_status = 'submitted' where id = $1 returning id`, [first.id])).rows.length,
      1,
      'submission reported after finish',
    )

    // Finished frees the slot: a new iOS build may start.
    assert.ok((await insertBuild(db, { token_hash: hash(6) })).rows[0].id, 'new iOS build after the last finished')

    // Neither client role can see or touch the table, nor run the trigger function.
    for (const [label, enter] of [
      ['anon', () => asAnon(db)],
      ['authenticated', () => as(db, 'authenticated', ADMIN)],
    ]) {
      await enter()
      await rejects(db, () => db.query('select * from public.tenant_app_builds'), /permission denied/, `${label} cannot read`)
      await rejects(db, () => db.query(`update public.tenant_app_builds set status = 'cancelled' returning id`), /permission denied/, `${label} cannot update`)
      await rejects(db, () => db.query('delete from public.tenant_app_builds returning id'), /permission denied/, `${label} cannot delete`)
      await rejects(db, () => insertBuild(db, { platform: 'android', token_hash: hash(7) }), /permission denied/, `${label} cannot insert`)
    }

    // Removing the app removes its builds.
    await reset(db)
    await db.query('delete from public.tenant_apps where tenant_id = $1', [STORE])
    assert.equal((await db.query('select count(*)::int as n from public.tenant_app_builds')).rows[0].n, 0, 'builds cascade with the app')

    await db.exec('rollback')
    console.log('tenant_app_builds SQL checks passed')
  } finally {
    await db.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
