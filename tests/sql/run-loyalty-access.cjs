// Run with @electric-sql/pglite installed externally via NODE_PATH.
const { PGlite } = require('@electric-sql/pglite')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

async function main() {
  const db = new PGlite()
  const tenant = '11111111-1111-1111-1111-111111111111'
  const user = '22222222-2222-2222-2222-222222222222'
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth to authenticated;
      create table tenants (id uuid primary key);
      create table outlets (id uuid primary key);
      create table customers (id uuid primary key);
      create table app_users (user_id uuid, tenant_id uuid, role text, is_owner boolean, permissions text[]);
      create function set_updated_at() returns trigger language plpgsql as $$
        begin new.updated_at = now(); return new; end;
      $$;
      insert into tenants values ('${tenant}');
      insert into auth.users values ('${user}');
      insert into app_users values ('${user}', '${tenant}', 'admin', false, array['pos']);
    `)
    const root = path.resolve(__dirname, '../..')
    await db.exec(readFileSync(path.join(root, 'supabase/migrations/20260905140000_loyalty_programs.sql'), 'utf8'))
    if (!process.argv.includes('--baseline')) {
      await db.exec(readFileSync(path.join(root, 'supabase/migrations/20260906160000_loyalty_access.sql'), 'utf8'))
    }
    await db.exec(`
      insert into loyalty_programs (tenant_id, name, earn_mode) values ('${tenant}', 'Coffee', 'stamp');
      insert into loyalty_balances (tenant_id, program_id, customer_key, balance)
        select '${tenant}', id, 'phone:+639171234567', 3 from loyalty_programs;
      grant select, insert, update, delete on all tables in schema public to authenticated;
      select set_config('request.jwt.claim.sub', '${user}', false);
      set role authenticated;
    `)
    assert.equal((await db.query('select * from loyalty_balances')).rows.length, 0, 'POS-only staff must not read loyalty history')
    assert.equal((await db.query("update loyalty_programs set name = 'Tampered' returning id")).rows.length, 0, 'Direct program updates must not bypass management API')
    await db.exec(`reset role; update app_users set permissions = array['customers']; set role authenticated;`)
    assert.equal((await db.query('select * from loyalty_balances')).rows.length, 1, 'Customer-authorized staff may read history')
    await db.exec(`reset role; update app_users set tenant_id = '33333333-3333-3333-3333-333333333333'; set role authenticated;`)
    assert.equal((await db.query('select * from loyalty_balances')).rows.length, 0, 'Other tenant history stays private')
    console.log('Loyalty access regressions passed')
  } finally { await db.close() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
