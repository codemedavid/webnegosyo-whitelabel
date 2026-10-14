// Shared PGlite harness for RLS runners: the slice of a Supabase platform
// database that row-level security depends on, and nothing else.
//
//   installPlatformAuth(db)  roles anon / authenticated / service_role (created
//                            only if missing), schema auth with auth.users and
//                            auth.uid(), and Supabase's default privileges on
//                            the public schema (every new table and function is
//                            granted to all three API roles, as Supabase does,
//                            so a migration's REVOKE is really exercised).
//   as(db, role, uid)        act as an API role; uid = the JWT subject (or null).
//   asAnon(db)               the storefront / checkout caller (no JWT subject).
//   reset(db)                back to the fixture owner (bypasses RLS), no uid.
//   readMigration(name)      a file from supabase/migrations, cwd-independent.
//
// auth.uid() reads the `test.uid` setting. Live it reads
// request.jwt.claim.sub / request.jwt.claims; the effect on policies is the same.
// Older runners carry their own copy of this setup and are deliberately left alone.
const { readFileSync } = require('node:fs')
const path = require('node:path')

const API_ROLES = ['anon', 'authenticated', 'service_role']
const REPO_ROOT = path.resolve(__dirname, '../../..')

async function installPlatformAuth(db) {
  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.uid', true), '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `)
}

async function as(db, role, uid) {
  if (!API_ROLES.includes(role)) throw new Error(`as(): unknown role ${role}`)
  await reset(db)
  await db.query("select set_config('test.uid', $1, false)", [uid ?? ''])
  await db.exec(`set role ${role}`)
}

const asAnon = (db) => as(db, 'anon', null)

async function reset(db) {
  await db.exec('reset role')
  await db.query("select set_config('test.uid', '', false)")
}

function readMigration(name) {
  return readFileSync(path.join(REPO_ROOT, 'supabase/migrations', name), 'utf8')
}

module.exports = { API_ROLES, REPO_ROOT, installPlatformAuth, as, asAnon, reset, readMigration }
