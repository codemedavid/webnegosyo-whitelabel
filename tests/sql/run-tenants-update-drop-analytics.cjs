// tenants_update_staff without `analytics` (20261106130000), pinned in PGlite as
// the role that really runs each query. Runs the policy as it was (20261026130000)
// first, so the analytics-only case is proven to change, then the REAL migration,
// then the REAL rollback. Asserts affected rows per role:
//   - analytics-only staff: 1 row before, 0 after, and 1 again after rollback;
//   - store_setup staff, settings staff, a legacy full-access account, the owner:
//     1 row, own store only; another store's staff 0; the service role always 1.
const { PGlite } = require('@electric-sql/pglite')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { REPO_ROOT, installPlatformAuth, as, reset, readMigration } = require('./lib/platform-auth.cjs')

const T = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_OTHER = 'bbbbbbbb-0000-4000-8000-000000000001'
const U = {
  analytics: '00000000-0000-4000-8000-000000000001',
  storeSetup: '00000000-0000-4000-8000-000000000002',
  settings: '00000000-0000-4000-8000-000000000003',
  legacy: '00000000-0000-4000-8000-000000000004',
  owner: '00000000-0000-4000-8000-000000000005',
  otherStoreSetup: '00000000-0000-4000-8000-000000000006',
  superadmin: '00000000-0000-4000-8000-000000000007',
}

// Helper bodies copied verbatim from 20261027120100_cash_manage_permission.sql and
// 20261013120200_order_reads_need_permission.sql. The pre-change policy is the
// one 20261026130000_staff_write_permissions.sql created.
const STUB = `
  create table public.tenants (id uuid primary key, name text);
  create table public.app_users (
    user_id uuid not null, tenant_id uuid, role text not null,
    is_owner boolean default false, outlet_id uuid, permissions text[]
  );
  alter table public.tenants enable row level security;
  create or replace function public.app_user_has_permission(p_tenant_id uuid, p_permission text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
  as $$
    select exists (
      select 1
        from public.app_users au
       where au.user_id = auth.uid()
         and (
           au.role = 'superadmin'
           or (
             au.role = 'admin'
             and au.tenant_id = p_tenant_id
             and (
               au.is_owner is true
               or (au.permissions is null and p_permission <> all (array['activity_view', 'approve_requests', 'expenses', 'cash_manage']))
               or p_permission = any (au.permissions)
               or (p_permission in ('kitchen', 'tables') and 'orders' = any (au.permissions))
               or (p_permission = 'reports' and 'analytics' = any (au.permissions))
             )
           )
         )
    );
  $$;
  create or replace function public.app_user_holds_any_permission(p_tenant_id uuid, p_keys text[])
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
  as $$
    select exists (
      select 1
        from unnest(p_keys) as key
       where public.app_user_has_permission(p_tenant_id, key)
    );
  $$;
  create policy tenants_read on public.tenants for select using (true);
  create policy tenants_update_staff on public.tenants for update to authenticated
    using (public.app_user_holds_any_permission(id, array['store_setup', 'settings', 'analytics']))
    with check (public.app_user_holds_any_permission(id, array['store_setup', 'settings', 'analytics']));
`

const SEED = `
  insert into public.tenants values ('${T}', 'Store'), ('${T_OTHER}', 'Other');
  insert into public.app_users (user_id, tenant_id, role, is_owner, permissions) values
    ('${U.analytics}', '${T}', 'admin', false, array['analytics']),
    ('${U.storeSetup}', '${T}', 'admin', false, array['store_setup']),
    ('${U.settings}', '${T}', 'admin', false, array['settings']),
    ('${U.legacy}', '${T}', 'admin', false, null),
    ('${U.owner}', '${T}', 'admin', true, array[]::text[]),
    ('${U.otherStoreSetup}', '${T_OTHER}', 'admin', false, array['store_setup']),
    ('${U.superadmin}', null, 'superadmin', false, null);
`

async function main() {
  const db = new PGlite()
  try {
    await installPlatformAuth(db)
    await db.exec(STUB)
    await db.exec(SEED)

    async function rowsUpdatedAs(uid) {
      await as(db, 'authenticated', uid)
      const { rows } = await db.query("update public.tenants set name = 'edited' where id = $1 returning id", [T])
      await reset(db)
      return rows.length
    }

    assert.equal(await rowsUpdatedAs(U.analytics), 1, 'baseline: the old policy let analytics-only staff write the row')

    await db.exec(readMigration('20261106130000_tenants_update_drop_analytics.sql'))

    assert.equal(await rowsUpdatedAs(U.analytics), 0, 'analytics-only staff write nothing')
    assert.equal(await rowsUpdatedAs(U.storeSetup), 1, 'store_setup staff keep the write')
    assert.equal(await rowsUpdatedAs(U.settings), 1, 'settings staff keep the write')
    assert.equal(await rowsUpdatedAs(U.legacy), 1, 'legacy full access keeps the write')
    assert.equal(await rowsUpdatedAs(U.owner), 1, 'the owner keeps the write')
    assert.equal(await rowsUpdatedAs(U.superadmin), 1, 'a superadmin keeps the write')
    assert.equal(await rowsUpdatedAs(U.otherStoreSetup), 0, "another store's staff write nothing")

    await as(db, 'service_role', null)
    const service = await db.query("update public.tenants set name = 'edited' where id = $1 returning id", [T])
    await reset(db)
    assert.equal(service.rows.length, 1, 'the service role (updateCheckoutUpsellSettings) still writes')

    await db.exec(readFileSync(
      path.join(REPO_ROOT, 'supabase/rollbacks/20261106130000_tenants_update_drop_analytics.down.sql'),
      'utf8',
    ))
    assert.equal(await rowsUpdatedAs(U.analytics), 1, 'the rollback restores the old policy')

    console.log('tenants_update_staff without analytics: all checks passed')
  } finally {
    await db.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
