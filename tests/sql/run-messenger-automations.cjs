// Messenger automations (20261110120000) in PGlite, as the role that really
// runs each query: anon (no access at all), authenticated staff with and
// without `settings`, branch-locked, another store, superadmin, service role.
// Loads the REAL migration over the live slice of app_users,
// app_user_has_permission (20261027120100, verbatim) and
// app_user_may_reach_branch (live 2026-10-27, pg_get_functiondef).
// Every write asserts affected rows or the SQLSTATE: RLS refusals are silent.
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')

const T_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_B = 'bbbbbbbb-0000-4000-8000-000000000001'
const OUT_A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  legacy: '00000000-0000-4000-8000-000000000002',
  settings: '00000000-0000-4000-8000-000000000003',
  ordersOnly: '00000000-0000-4000-8000-000000000004',
  branchSettings: '00000000-0000-4000-8000-000000000005',
  ownerB: '00000000-0000-4000-8000-000000000006',
  superadmin: '00000000-0000-4000-8000-000000000007',
}
const RULE = (id, kind = 'keyword') => ({
  id,
  name: `Rule ${id.slice(-2)}`,
  trigger: kind === 'keyword' ? { kind, keywords: ['menu'], match: 'contains' } : { kind },
  action: { kind: 'menu_card' },
  is_enabled: true,
})
const ruleId = (n) => `cccccccc-0000-4000-8000-${String(n).padStart(12, '0')}`

const STUB_SCHEMA = `
  create table tenants (id uuid primary key);
  create table outlets (id uuid primary key, tenant_id uuid not null references tenants(id));
  create table app_users (
    user_id uuid primary key, role text not null, tenant_id uuid,
    is_owner boolean not null default false, permissions text[], outlet_id uuid
  );
  alter table app_users enable row level security;
  create policy app_users_select_self on app_users for select to authenticated using (user_id = auth.uid());
  create function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
  -- 0017_messenger_sessions.sql columns + 20260815120000 (service role only).
  create table messenger_sessions (
    id uuid primary key default gen_random_uuid(), psid text unique not null,
    tenant_id uuid not null references tenants(id) on delete cascade,
    cart_data jsonb default '[]'::jsonb, checkout_state jsonb default '{}'::jsonb, state text default 'menu' not null,
    created_at timestamptz default now() not null, updated_at timestamptz default now() not null
  );
  alter table messenger_sessions enable row level security;
  revoke all on messenger_sessions from anon, authenticated;
  -- 20261027120100_cash_manage_permission.sql, verbatim.
  create or replace function public.app_user_has_permission(p_tenant_id uuid, p_permission text)
  returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
      select 1 from public.app_users au
       where au.user_id = auth.uid()
         and (
           au.role = 'superadmin'
           or (
             au.role = 'admin' and au.tenant_id = p_tenant_id
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
  -- Copied from live on 2026-10-27 (pg_get_functiondef).
  CREATE OR REPLACE FUNCTION public.app_user_may_reach_branch(target_tenant_id uuid, target_outlet_id uuid)
   RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp'
  AS $function$
    SELECT EXISTS (
      SELECT 1 FROM app_users au
       WHERE au.user_id = auth.uid() AND au.tenant_id = target_tenant_id
         AND au.role = ANY (ARRAY['admin','superadmin'])
         AND (au.outlet_id IS NULL OR COALESCE(au.is_owner, false) OR au.outlet_id = target_outlet_id)
    );
  $function$;
`

const SEED = `
  insert into tenants values ('${T_A}'), ('${T_B}');
  insert into outlets values ('${OUT_A1}', '${T_A}');
  insert into auth.users select unnest(array[${Object.values(U).map((id) => `'${id}'::uuid`).join(',')}]);
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id) values
    ('${U.owner}', 'admin', '${T_A}', true, '{}', null),
    ('${U.legacy}', 'admin', '${T_A}', false, null, null),
    ('${U.settings}', 'admin', '${T_A}', false, '{settings}', null),
    ('${U.ordersOnly}', 'admin', '${T_A}', false, '{orders,pos}', null),
    ('${U.branchSettings}', 'admin', '${T_A}', false, '{settings}', '${OUT_A1}'),
    ('${U.ownerB}', 'admin', '${T_B}', true, '{}', null),
    ('${U.superadmin}', 'superadmin', null, false, null, null);
`

let checks = 0
function eq(actual, expected, message) {
  checks += 1
  assert.deepEqual(actual, expected, message)
}
async function refused(promise, code, message) {
  checks += 1
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `${message}: expected SQLSTATE ${code}, got ${error.code} (${error.message})`)
    return true
  }, message)
}
async function save(db, tenant, version, rules, botEnabled = true, takeover = 60) {
  const { rows } = await db.query('select public.save_messenger_rules($1, $2, $3::jsonb, $4, $5) as v', [tenant, version, JSON.stringify(rules), botEnabled, takeover])
  return rows[0].v
}
async function count(db, sql, params = []) {
  return Number((await db.query(sql, params)).rows[0].n)
}

async function checkManagers(db) {
  let version = 0
  for (const [uid, label] of [[U.owner, 'owner'], [U.legacy, 'legacy full access'], [U.settings, 'settings staff'], [U.superadmin, 'superadmin']]) {
    await as(db, 'authenticated', uid)
    version = await save(db, T_A, version, [RULE(ruleId(1)), RULE(ruleId(2), 'get_started')])
    eq(await count(db, 'select count(*) n from messenger_rules where tenant_id = $1', [T_A]), 2, `${label} saves and reads the store's rules`)
    eq((await db.query('select position from messenger_rules order by position')).rows.map((row) => row.position), [0, 1], `${label}: order kept`)
    eq((await db.query("update messenger_rules set is_enabled = false where id = $1 returning id", [ruleId(1)])).rows.length, 1, `${label} toggles a rule`)
    eq((await db.query('update messenger_settings set bot_enabled = false where tenant_id = $1 returning tenant_id', [T_A])).rows.length, 1, `${label} switches the bot`)
  }
  eq(version, 4, 'each save bumps rules_version once')

  await as(db, 'authenticated', U.owner)
  await refused(save(db, T_A, 1, [RULE(ruleId(3))]), '40001', 'a save from a stale editor is refused')
  eq(await count(db, 'select count(*) n from messenger_rules'), 2, 'the stale save changed nothing')
  await refused(save(db, T_B, 0, [RULE(ruleId(9))]), '42501', "an owner cannot save another store's rules")
  await refused(db.query('insert into messenger_rules (tenant_id, name, trigger, action) values ($1, $2, $3, $4)',
    [T_B, 'x', { kind: 'fallback' }, { kind: 'menu_card' }]), '42501', "nor insert one directly")
  await refused(db.query('insert into messenger_rules (tenant_id, name, trigger, action) values ($1, $2, $3, $4)',
    [T_A, 'x', { kind: 'script' }, { kind: 'menu_card' }]), '23514', 'an unknown trigger kind fails the check')
  await refused(db.query('select tester_psid from messenger_settings'), '42501', 'staff never read the test PSID')
  await refused(db.query("update messenger_settings set profile_hash = 'x'"), '42501', 'profile sync state is service-role only')
  await refused(save(db, T_A, 4, Array.from({ length: 51 }, (_, index) => RULE(ruleId(100 + index)))), '22023', 'more than 50 rules is refused')
}

async function checkRefusals(db) {
  for (const [uid, label] of [[U.ordersOnly, 'orders-only staff'], [U.branchSettings, 'branch-locked settings staff'], [U.ownerB, "another store's owner"]]) {
    await as(db, 'authenticated', uid)
    eq(await count(db, 'select count(*) n from messenger_rules'), 0, `${label} sees no rules`)
    eq((await db.query('select tenant_id from messenger_settings')).rows, [], `${label} sees no settings`)
    eq((await db.query('update messenger_rules set name = $1 returning id', ['hijack'])).rows.length, 0, `${label} updates nothing`)
    eq((await db.query('delete from messenger_rules returning id')).rows.length, 0, `${label} deletes nothing`)
    await refused(save(db, T_A, 4, []), '42501', `${label} cannot save`)
  }

  await asAnon(db)
  await refused(db.query('select id from messenger_rules'), '42501', 'anon cannot read rules')
  await refused(db.query('select tenant_id from messenger_settings'), '42501', 'anon cannot read settings')
  await refused(db.query('select public.save_messenger_rules($1, 0, $2::jsonb, true, 60)', [T_A, '[]']), '42501', 'anon cannot call the save')
  await as(db, 'authenticated', U.owner)
  await refused(db.query('select id from messenger_sessions'), '42501', 'staff still cannot read sessions (PSIDs, carts)')
}

async function checkServiceRole(db) {
  await as(db, 'service_role', null)
  eq(await count(db, 'select count(*) n from messenger_rules'), 2, 'the webhook (service role) reads the rules')
  eq((await db.query("update messenger_settings set profile_hash = 'h', tester_psid = '123' where tenant_id = $1 returning tenant_id", [T_A])).rows.length, 1,
    'the service role writes sync state and the test PSID')
  await db.query("insert into messenger_sessions (tenant_id, psid) values ($1, 'p1')", [T_A])
  await refused(db.query("insert into messenger_sessions (tenant_id, psid) values ($1, 'p1')", [T_A]), '23505', '(tenant, psid) is unique')
  eq((await db.query('update messenger_sessions set last_inbound_at = now(), bot_paused_until = now(), page_id = $1 returning id', ['630'])).rows.length, 1,
    'the new session columns are writable')

  await as(db, 'authenticated', U.owner)
  await save(db, T_A, 4, [], false, 240)
  eq(await count(db, 'select count(*) n from messenger_rules'), 0, 'saving an empty set clears the rules')
  eq((await db.query('select rules_customized_at is not null as custom, bot_enabled, takeover_minutes from messenger_settings')).rows,
    [{ custom: true, bot_enabled: false, takeover_minutes: 240 }],
    '…marks the store as customised (the built-in rules do not come back) and saves the bot settings in the same transaction')
  await refused(save(db, T_A, 5, [], true, 5000), '23514', 'a takeover outside 0..1440 minutes is refused (and nothing is saved)')
  eq((await db.query('select rules_version from messenger_settings')).rows, [{ rules_version: 5 }], 'the refused save left the version alone')
}

async function main() {
  const db = new PGlite()
  try {
    await installPlatformAuth(db)
    await db.exec(STUB_SCHEMA)
    await db.exec(SEED)
    await db.exec(readMigration('20261110120000_messenger_automations.sql'))
    await db.exec(readMigration('20261110120000_messenger_automations.sql'))
    await reset(db)
    await checkManagers(db)
    await checkRefusals(db)
    await checkServiceRole(db)
    console.log(`Messenger automations SQL: ${checks} checks passed (migration applied twice: idempotent)`)
  } finally {
    await db.close()
  }
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1 })

module.exports = { STUB_SCHEMA, SEED, U, T_A, T_B, RULE, ruleId, save }
