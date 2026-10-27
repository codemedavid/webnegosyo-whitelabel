// Store credentials are read by the server only (security review 2026-10-26).
//
// tenant_secrets holds the Lalamove, Loyverse, Semaphore and Convex keys. Its
// tenant_secrets_admin_select policy let ANY role='admin' account of the store
// read them through PostgREST — a pos-only cashier included. Every reader in
// the code uses the service role (the delivery settings page included), so the
// client SELECT goes, leaving superadmins only.
//
// Loads the live-policy stub, the staff-write migration it builds on, then the
// REAL migration under test:
//   20261026140000_tenant_secrets_server_only.sql
//   node tests/sql/run-tenant-secrets-read.cjs
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { REPO_ROOT, installPlatformAuth, as, reset, readMigration } = require('./lib/platform-auth.cjs')
const { HELPERS, TABLES, PRE_POLICIES } = require('./lib/staff-writes-stub.cjs')

const MIGRATION = '20261026140000_tenant_secrets_server_only.sql'
const T_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  cashier: '00000000-0000-4000-8000-000000000002',
  superadmin: '00000000-0000-4000-8000-000000000003',
}

async function visibleSecrets(db, actor) {
  await as(db, 'authenticated', U[actor])
  const { rows } = await db.query('select count(*)::int as n from tenant_secrets')
  await reset(db)
  return rows[0].n
}

async function main() {
  const db = new PGlite()
  try {
    await installPlatformAuth(db)
    await db.exec(HELPERS)
    await db.exec(TABLES)
    await db.exec(PRE_POLICIES)
    await db.exec(`
      insert into tenants (id) values ('${T_A}');
      insert into auth.users select unnest(array['${U.owner}'::uuid, '${U.cashier}'::uuid, '${U.superadmin}'::uuid]);
      insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id, platform_permissions) values
        ('${U.owner}', 'admin', '${T_A}', true, '{}', null, null),
        ('${U.cashier}', 'admin', '${T_A}', false, '{pos}', null, null),
        ('${U.superadmin}', 'superadmin', null, false, null, null, null);
      insert into tenant_secrets (id, tenant_id) values (gen_random_uuid(), '${T_A}');
    `)
    await db.exec(readMigration('20261026130000_staff_write_permissions.sql'))
    assert.equal(await visibleSecrets(db, 'cashier'), 1, 'precondition: the old policy shows a cashier the keys')

    await db.exec(readMigration(MIGRATION))
    assert.equal(await visibleSecrets(db, 'cashier'), 0, 'a cashier cannot read store credentials')
    assert.equal(await visibleSecrets(db, 'owner'), 0, 'owners read them through the server, not PostgREST')
    assert.equal(await visibleSecrets(db, 'superadmin'), 1, 'superadmins keep their access')

    const legacy = await db.query(`select policyname from pg_policies where tablename = 'upsell_pairs'
      and policyname in ('Admins can insert upsell pairs for their tenant', 'Admins can update upsell pairs for their tenant',
        'Admins can delete upsell pairs for their tenant', 'Superadmins can manage all upsell pairs')`)
    assert.deepEqual(legacy.rows, [], 'no legacy upsell write policy survives a rebuild from the migrations')

    await db.exec(readFileSync(path.join(REPO_ROOT, 'supabase/rollbacks', MIGRATION.replace('.sql', '.down.sql')), 'utf8'))
    assert.equal(await visibleSecrets(db, 'cashier'), 1, 'rollback restores the old read rule')

    console.log('Tenant secrets read SQL regressions passed')
  } finally {
    await db.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
