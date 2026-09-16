// Run with PGlite installed (or supplied through NODE_PATH).
const { PGlite } = require('@electric-sql/pglite')
const { readFileSync } = require('node:fs')
const assert = require('node:assert/strict')

async function main() {
  const db = new PGlite()
  const userId = '11111111-1111-4111-8111-111111111111'
  const tenantId = '22222222-2222-4222-8222-222222222222'
  try {
    await db.exec(`
      create role anon; create role authenticated; create role supabase_auth_admin;
      create schema auth;
      grant usage on schema public, auth to supabase_auth_admin, authenticated;
      create function auth.uid() returns uuid language sql as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create table public.tenants(id uuid primary key);
      create table public.app_users(user_id uuid primary key, role text, tenant_id uuid);
      alter table public.app_users enable row level security;
      grant select on public.app_users to authenticated;
      insert into public.app_users values ('${userId}', 'admin', '${tenantId}');
    `)
    await db.exec(readFileSync('supabase/migrations/0002_app_users_select.sql', 'utf8'))
    await db.exec(readFileSync('supabase/migrations/20260910120000_convex_merchant_auth.sql', 'utf8'))
    if (!process.argv.includes('--baseline')) {
      await db.exec(readFileSync('supabase/migrations/20260914140000_convex_auth_hook_rls.sql', 'utf8'))
    }
    await db.exec('set role supabase_auth_admin')
    const issue = async (claims = {}) => (await db.query(
      'select public.superadmin_mcp_access_token_hook($1::jsonb) as event',
      [{ user_id: userId, claims }],
    )).rows[0].event.claims
    assert.deepEqual(await issue(), { wn_role: 'admin', wn_tenant_id: tenantId })
    assert.equal((await issue({ client_id: 'mcp-client' })).aud, 'https://www.webnegosyo.com/api/mcp/mcp')
    await db.exec(`reset role; update public.app_users set role = 'superadmin', tenant_id = null; set role supabase_auth_admin`)
    assert.deepEqual(await issue(), { wn_role: 'superadmin', wn_tenant_id: null })
    await db.exec(`reset role; set role authenticated`)
    assert.equal((await db.query('select * from public.app_users')).rows.length, 0)
    await assert.rejects(issue(), /permission denied/)
    await db.exec(`reset role; set role anon`)
    await assert.rejects(issue(), /permission denied/)
    console.log('Convex auth hook claims and role isolation passed')
  } finally {
    await db.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
