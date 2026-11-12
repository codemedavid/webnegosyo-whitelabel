// Customer-app order pushes (P7) over PGlite: the REAL migration
// 20261112150000_customer_app_push.sql on stub tenants / customers / sessions /
// orders / customer_app_orders shaped like the platform DB, as the role that
// really runs each query. Every write asserts affected rows or the error.
//
//   - tokens + claims: service role only (anon / authenticated refused)
//   - register: only a live session of THIS store; same install moves to the
//     account signed in now; at most 5 installs per customer (oldest dropped)
//   - remove: only this session's tokens; deleting the session row cascades
//   - (order, status) claim is once-only; unknown outcomes / statuses refused
//   - the orders trigger posts once per real status change of an APP order to
//     a pushed status, never for other orders, and a broken pg_net never
//     fails the order write
//   node tests/sql/run-customer-app-push.cjs
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')

const STORE = '00000000-0000-4000-8000-000000000001'
const OTHER_STORE = '00000000-0000-4000-8000-000000000002'
const ANA = '00000000-0000-4000-8000-0000000000c1'
const BEN = '00000000-0000-4000-8000-0000000000c2'
const STAFF = '00000000-0000-4000-8000-0000000000a1'
const APP_ORDER = '00000000-0000-4000-8000-0000000000d1'
const WEB_MOBILE_ORDER = '00000000-0000-4000-8000-0000000000d2'
const OTHER_STORE_ORDER = '00000000-0000-4000-8000-0000000000d3'
const hash = (n) => String(n).repeat(64).slice(0, 64)
const ANA_SESSION = hash(1)
const ANA_OLD_SESSION = hash(2)
const BEN_SESSION = hash(3)
const REVOKED_SESSION = hash(4)
const OTHER_STORE_SESSION = hash(5)
const token = (n) => `ExponentPushToken[device-${String(n).padStart(4, '0')}]`

const BASE = `
create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create table public.tenants(id uuid primary key);
create table public.customers(id uuid primary key, tenant_id uuid not null references public.tenants(id) on delete cascade);
create table public.customer_app_sessions(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '60 days',
  revoked_at timestamptz
);
create table public.orders(
  id uuid primary key, tenant_id uuid not null references public.tenants(id),
  status text not null default 'pending', source text not null default 'web'
);
create table public.customer_app_orders(
  tenant_id uuid not null, backend text not null, order_id text,
  unique (tenant_id, backend, order_id)
);
create schema if not exists extensions;
create schema if not exists net;
create table public.net_calls(url text, body jsonb);
create table public.net_broken(on_off boolean);
create function net.http_post(url text, body jsonb, headers jsonb) returns bigint language plpgsql as $$
begin
  if exists (select 1 from public.net_broken where on_off) then raise exception 'queue down'; end if;
  insert into public.net_calls values (url, body);
  return 1;
end $$;
insert into public.tenants values ('${STORE}'), ('${OTHER_STORE}');
insert into public.customers values ('${ANA}', '${STORE}'), ('${BEN}', '${STORE}');
insert into public.customer_app_sessions(tenant_id, customer_id, token_hash, revoked_at) values
  ('${STORE}', '${ANA}', '${ANA_SESSION}', null),
  ('${STORE}', '${ANA}', '${ANA_OLD_SESSION}', null),
  ('${STORE}', '${BEN}', '${BEN_SESSION}', null),
  ('${STORE}', '${ANA}', '${REVOKED_SESSION}', now());
insert into public.customers values ('00000000-0000-4000-8000-0000000000c9', '${OTHER_STORE}');
insert into public.customer_app_sessions(tenant_id, customer_id, token_hash) values
  ('${OTHER_STORE}', '00000000-0000-4000-8000-0000000000c9', '${OTHER_STORE_SESSION}');
insert into public.orders(id, tenant_id, source) values
  ('${APP_ORDER}', '${STORE}', 'mobile'), ('${WEB_MOBILE_ORDER}', '${STORE}', 'mobile'), ('${OTHER_STORE_ORDER}', '${OTHER_STORE}', 'mobile');
insert into public.customer_app_orders values ('${STORE}', 'platform', '${APP_ORDER}');
insert into auth.users(id) values ('${STAFF}');
`

let checks = 0
function eq(actual, expected, message) {
  checks += 1
  assert.deepEqual(actual, expected, message)
}
async function refused(db, run, pattern, label) {
  checks += 1
  await db.exec('savepoint s')
  await assert.rejects(run(), pattern, label)
  await db.exec('rollback to savepoint s')
}
const rows = async (db, sql, params = []) => (await db.query(sql, params)).rows
const register = async (db, tenant, session, n, platform = 'ios') =>
  (await rows(db, 'select public.register_customer_app_push_token($1, $2, $3, $4, $5) as r', [tenant, session, token(n), platform, '1.0.0']))[0].r
const tokensOf = async (db, customer) =>
  (await rows(db, 'select expo_token from public.customer_device_tokens where customer_id = $1 order by expo_token', [customer])).map((row) => row.expo_token)

async function clientRolesAreRefused(db) {
  for (const [label, enter] of [['anon', () => asAnon(db)], ['authenticated', () => as(db, 'authenticated', STAFF)]]) {
    await enter()
    for (const table of ['customer_device_tokens', 'customer_app_order_pushes']) {
      await refused(db, () => db.query(`select * from public.${table}`), /permission denied/, `${label} cannot read ${table}`)
      await refused(db, () => db.query(`delete from public.${table}`), /permission denied/, `${label} cannot delete from ${table}`)
    }
    await refused(db, () => db.query("insert into public.customer_app_order_pushes(order_id, status, tenant_id) values ($1, 'ready', $2)", [APP_ORDER, STORE]),
      /permission denied/, `${label} cannot forge a claim (which would silence a push)`)
    await refused(db, () => db.query('select public.register_customer_app_push_token($1, $2, $3, $4, $5)', [STORE, ANA_SESSION, token(99), 'ios', null]),
      /permission denied/, `${label} cannot register a token`)
    await refused(db, () => db.query('select public.remove_customer_app_push_tokens($1, $2)', [STORE, ANA_SESSION]),
      /permission denied/, `${label} cannot remove tokens`)
    await refused(db, () => db.query('select public.notify_customer_app_order_push()'), /permission denied|trigger functions can only be called as triggers/,
      `${label} cannot call the trigger function`)
  }
  await reset(db)
}

async function registration(db) {
  await as(db, 'service_role', null)
  eq(await register(db, STORE, ANA_SESSION, 1), { ok: true, installs: 1 }, 'a live session registers its install')
  eq(await register(db, STORE, ANA_SESSION, 1), { ok: true, installs: 1 }, 'registering the same install again keeps one row')
  eq(await register(db, STORE, REVOKED_SESSION, 2), { ok: false, error: 'signed_out' }, 'a signed-out session registers nothing')
  eq(await register(db, OTHER_STORE, ANA_SESSION, 2), { ok: false, error: 'signed_out' }, "a session is unknown at another store")
  eq(await register(db, STORE, 'not-a-hash', 2), { ok: false, error: 'bad_request' }, 'a malformed session hash is refused')
  eq(await tokensOf(db, ANA), [token(1)], 'only the live registration is stored')

  eq(await register(db, STORE, BEN_SESSION, 1), { ok: true, installs: 1 }, 'Ben signs in on the same phone and registers it')
  eq(await tokensOf(db, ANA), [], "the install leaves Ana's account: her orders no longer ring Ben's phone")
  eq(await tokensOf(db, BEN), [token(1)], 'it now belongs to Ben')
  eq((await register(db, OTHER_STORE, OTHER_STORE_SESSION, 1)).ok, true, 'the same install at ANOTHER store is its own row')
  eq((await rows(db, 'select count(*)::int as n from public.customer_device_tokens where expo_token = $1', [token(1)]))[0].n, 2, 'one row per store')

  for (let n = 10; n <= 16; n += 1) await register(db, STORE, ANA_SESSION, n)
  eq(await tokensOf(db, ANA), [token(12), token(13), token(14), token(15), token(16)], 'a customer keeps at most 5 installs, newest first')

  await refused(db, () => db.query('select public.register_customer_app_push_token($1, $2, $3, $4, $5)', [STORE, ANA_SESSION, 'not-a-token', 'ios', null]),
    /violates check constraint/, 'a token that is not an Expo token is refused')
  await refused(db, () => db.query('select public.register_customer_app_push_token($1, $2, $3, $4, $5)', [STORE, ANA_SESSION, token(20), 'windows', null]),
    /violates check constraint/, 'an unknown platform is refused')
}

async function removal(db) {
  await as(db, 'service_role', null)
  await register(db, STORE, ANA_OLD_SESSION, 30)
  eq((await rows(db, 'select public.remove_customer_app_push_tokens($1, $2) as r', [STORE, ANA_SESSION]))[0].r, { ok: true, removed: 4 },
    "turning notifications off removes this session's installs")
  eq(await tokensOf(db, ANA), [token(30)], "…and leaves the installs of Ana's other sessions")
  eq((await rows(db, 'select public.remove_customer_app_push_tokens($1, $2) as r', [OTHER_STORE, ANA_OLD_SESSION]))[0].r, { ok: true, removed: 0 },
    "another store can't remove them")
  eq((await rows(db, 'delete from public.customer_app_sessions where token_hash = $1 returning id', [ANA_OLD_SESSION])).length, 1, 'account deletion removes the session row')
  eq(await tokensOf(db, ANA), [], '…and its installs cascade away')
}

async function claims(db) {
  await as(db, 'service_role', null)
  const claim = () => rows(db, "insert into public.customer_app_order_pushes(order_id, status, tenant_id) values ($1, 'ready', $2) on conflict do nothing returning order_id", [APP_ORDER, STORE])
  eq((await claim()).length, 1, 'the route claims (order, ready)')
  eq((await claim()).length, 0, 'a replay finds the claim taken')
  eq((await rows(db, "update public.customer_app_order_pushes set outcome = 'sent', devices = 2 where order_id = $1 and status = 'ready' returning outcome", [APP_ORDER])).length, 1,
    'and records the outcome')
  await refused(db, () => db.query("update public.customer_app_order_pushes set outcome = 'carrier_pigeon'"), /violates check constraint/, 'only known outcomes')
  await refused(db, () => db.query("insert into public.customer_app_order_pushes(order_id, status, tenant_id) values ($1, 'preparing', $2)", [APP_ORDER, STORE]),
    /violates check constraint/, 'preparing is not a pushed status')
  await db.query('delete from public.customer_app_order_pushes')
}

async function trigger(db) {
  await as(db, 'service_role', null)
  await db.query('delete from public.net_calls')
  const calls = async () => rows(db, 'select url, body from public.net_calls')

  await db.query("update public.orders set status = 'preparing' where id = $1", [APP_ORDER])
  eq(await calls(), [], 'preparing is not pushed: no call')
  await db.query("update public.orders set status = 'ready' where id = $1", [APP_ORDER])
  eq(await calls(), [{ url: 'https://www.webnegosyo.com/api/push/customer-order', body: { order_id: APP_ORDER } }], 'an app order moving to ready posts its id once')
  await db.query("update public.orders set status = 'ready' where id = $1", [APP_ORDER])
  await db.query("update public.orders set source = 'mobile' where id = $1", [APP_ORDER])
  eq((await calls()).length, 1, 'the same status again, or another column, posts nothing')
  await db.query("update public.orders set status = 'ready' where id = $1", [WEB_MOBILE_ORDER])
  eq((await calls()).length, 1, "a mobile-source order that is not in the app's index posts nothing")
  await db.query("update public.orders set status = 'ready' where id = $1", [OTHER_STORE_ORDER])
  eq((await calls()).length, 1, "another store's order with the same source posts nothing")
  await db.query("update public.orders set source = 'web' where id = $1", [APP_ORDER])
  await db.query("update public.orders set status = 'cancelled' where id = $1", [APP_ORDER])
  eq((await calls()).length, 1, 'a non-mobile source posts nothing')
  await db.query("update public.orders set source = 'mobile', status = 'confirmed' where id = $1", [APP_ORDER])
  eq((await calls()).length, 2, 'confirmed posts')

  // Staff change statuses with their own session: the trigger (definer) still reads the
  // service-only index and posts, and the staff write is never refused because of it.
  await db.query("update public.orders set status = 'pending' where id = $1", [APP_ORDER])
  await as(db, 'authenticated', STAFF)
  eq((await rows(db, "update public.orders set status = 'ready' where id = $1 returning status", [APP_ORDER])).length, 1, 'a staff (authenticated) status change goes through')
  await as(db, 'service_role', null)
  eq((await calls()).length, 3, '…and posts the push')

  await db.query('insert into public.net_broken values (true)')
  eq((await rows(db, "update public.orders set status = 'cancelled' where id = $1 returning status", [APP_ORDER])).length, 1,
    'a broken pg_net never fails the order write')
  await db.query('delete from public.net_broken')
}

async function main() {
  const db = new PGlite()
  try {
    await installPlatformAuth(db)
    await db.exec(BASE)
    await db.exec(readMigration('20261112150000_customer_app_push.sql'))

    for (const table of ['customer_device_tokens', 'customer_app_order_pushes']) {
      const rls = (await db.query(`select relrowsecurity from pg_class where oid = 'public.${table}'::regclass`)).rows[0]
      eq(rls.relrowsecurity, true, `RLS is on for ${table}`)
      eq((await db.query('select count(*)::int as n from pg_policies where tablename = $1', [table])).rows[0].n, 0, `${table} has no policies: service role only`)
    }

    await db.exec('begin')
    await clientRolesAreRefused(db)
    await registration(db)
    await removal(db)
    await claims(db)
    await trigger(db)
    await db.exec('rollback')
    console.log(`customer-app push: ${checks} checks passed`)
  } finally {
    await db.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
