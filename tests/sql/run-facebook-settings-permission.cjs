// Local PostgreSQL regression: no production connection or credentials.
// NODE_PATH=/tmp/whitelabel-security-sql/node_modules node tests/sql/run-facebook-settings-permission.cjs
// --baseline loads only the old policy and must fail the restricted-staff case.
const { PGlite } = require('@electric-sql/pglite')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const TENANT = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'
const ACTOR = '00000000-0000-4000-8000-000000000003'

async function main() {
  const db = new PGlite()
  const migrate = (name) => db.exec(readFileSync(path.resolve(__dirname, '../../supabase/migrations', name), 'utf8'))
  async function asRole(role, action) {
    await db.exec(`set role ${role}`)
    try { return await action() } finally { await db.exec('reset role') }
  }
  async function caller(role, tenantId, isOwner, permissions) {
    await db.query('update app_users set role=$1,tenant_id=$2,is_owner=$3,permissions=$4 where user_id=$5',
      [role, tenantId, isOwner, permissions, ACTOR])
  }
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth to anon, authenticated;
      create table tenants(id uuid primary key, is_active boolean default true);
      create table app_users(user_id uuid primary key, tenant_id uuid, role text, is_owner boolean, permissions text[]);
      create table facebook_pages(
        id text primary key, tenant_id uuid, page_id text, page_name text,
        is_active boolean, created_at timestamptz, updated_at timestamptz,
        page_access_token text, user_access_token text
      );
      create table messenger_sessions(id text);
      grant select on tenants to anon, authenticated;
      grant select on app_users to authenticated;
      grant all on facebook_pages to anon, authenticated;
      insert into tenants(id) values ('${TENANT}'), ('${OTHER}');
      insert into app_users values ('${ACTOR}','${TENANT}','admin',false,array['orders']);
      insert into facebook_pages values
        ('own','${TENANT}','public-own','Own page',true,now(),now(),'private-page','private-user'),
        ('other','${OTHER}','public-other','Other page',true,now(),now(),'other-private','other-user');
      select set_config('request.jwt.claim.sub','${ACTOR}',false);
    `)
    await migrate('20260815120000_facebook_pages_and_messenger_sessions_rls.sql')
    if (!process.argv.includes('--baseline')) await migrate('20261004160000_facebook_settings_permission.sql')

    // Restricted staff must not bypass the HTTP checks through PostgREST.
    await asRole('authenticated', async () => {
      assert.deepEqual((await db.query('select page_access_token from facebook_pages')).rows, [], 'Restricted staff cannot read Facebook tokens')
      assert.deepEqual((await db.query("update facebook_pages set page_name='Hijacked' returning id")).rows, [])
      assert.deepEqual((await db.query('delete from facebook_pages returning id')).rows, [])
      await assert.rejects(db.query('insert into facebook_pages(id,tenant_id) values($1,$2)', ['injected', TENANT]), /row-level security/)
    })

    for (const [name, owner, permissions] of [
      ['settings staff', false, ['settings']], ['owner', true, []], ['legacy admin', false, null],
    ]) {
      await caller('admin', TENANT, owner, permissions)
      await asRole('authenticated', async () => {
        assert.deepEqual((await db.query('select id,page_access_token from facebook_pages')).rows,
          [{ id: 'own', page_access_token: 'private-page' }], `${name} can read only their own token`)
        assert.deepEqual((await db.query("update facebook_pages set page_name='Updated' returning id")).rows, [{ id: 'own' }])
        await assert.rejects(db.query('update facebook_pages set tenant_id=$1 where id=$2', [OTHER, 'own']), /row-level security/)
        await assert.rejects(db.query('insert into facebook_pages(id,tenant_id) values($1,$2)', ['cross-tenant', OTHER]), /row-level security/)
        await db.query('insert into facebook_pages(id,tenant_id) values($1,$2)', ['new-own', TENANT])
        assert.deepEqual((await db.query("delete from facebook_pages where id='new-own' returning id")).rows, [{ id: 'new-own' }])
      })
    }

    await caller('customer', TENANT, true, ['settings'])
    await asRole('authenticated', async () => {
      assert.deepEqual((await db.query('select id from facebook_pages')).rows, [], 'Customer role cannot inherit merchant permissions')
    })
    await caller('superadmin', null, false, [])
    await asRole('authenticated', async () => {
      assert.equal((await db.query('select id from facebook_pages')).rows.length, 2, 'Superadmin retains cross-tenant access')
    })
    await asRole('anon', async () => {
      assert.equal((await db.query('select page_id from facebook_pages')).rows.length, 2, 'Public page IDs remain available to checkout')
      await assert.rejects(db.query('select page_access_token from facebook_pages'), /permission denied/)
    })
    console.log('Facebook settings permission SQL regressions passed')
  } finally { await db.close() }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
