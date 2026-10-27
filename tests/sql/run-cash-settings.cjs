// Cash rules + named shifts (20261027120200), pinned in PGlite as the role
// that really runs each query.
//
// Loads the REAL migrations
//   20261013120050_staff_permission_keys.sql + 20261022130200_expenses_opt_in.sql
//   20261012150000_store_activity.sql          activity writer (settings.changed)
//   20261027120100_cash_manage_permission.sql  app_user_manages_cash
//   20261027120200_cash_settings.sql           under test
// over the live slice of app_users / app_user_may_reach_branch /
// app_user_belongs_to_store (copied from live 2026-10-27). Every write asserts
// the affected rows or the SQLSTATE.
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')

const T_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_B = 'bbbbbbbb-0000-4000-8000-000000000001'
const OUT_A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const OUT_A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const OUT_B1 = 'bbbbbbbb-0000-4000-8000-0000000000b1'

const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  cash: '00000000-0000-4000-8000-000000000002',
  cashier: '00000000-0000-4000-8000-000000000003',
  branchCash: '00000000-0000-4000-8000-000000000004',
  ownerB: '00000000-0000-4000-8000-000000000005',
  legacy: '00000000-0000-4000-8000-000000000006',
}

const STUB_SCHEMA = `
  create table tenants (
    id uuid primary key, operating_hours jsonb, timezone text default 'Asia/Manila',
    enforce_operating_hours boolean default false, order_backend text, convex_deployment_url text
  );
  create table outlets (
    id uuid primary key, tenant_id uuid not null references tenants(id) on delete cascade,
    operating_hours jsonb, timezone text
  );
  create table app_users (
    user_id uuid primary key, role text not null, tenant_id uuid,
    is_owner boolean not null default false, permissions text[], outlet_id uuid,
    display_name text, email text
  );
  alter table app_users enable row level security;
  create policy app_users_select_self on app_users for select to authenticated using (user_id = auth.uid());
  create table orders (id uuid primary key default gen_random_uuid(), tenant_id uuid);
  create table order_status_events (id uuid primary key default gen_random_uuid());
  -- Copied from live on 2026-10-27 (pg_get_functiondef).
  CREATE OR REPLACE FUNCTION public.app_user_may_reach_branch(target_tenant_id uuid, target_outlet_id uuid)
   RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp'
  AS $function$
    SELECT EXISTS (
      SELECT 1
        FROM app_users au
       WHERE au.user_id = auth.uid()
         AND au.tenant_id = target_tenant_id
         AND au.role = ANY (ARRAY['admin','superadmin'])
         AND (
           au.outlet_id IS NULL
           OR COALESCE(au.is_owner, false)
           OR au.outlet_id = target_outlet_id
         )
    );
  $function$;
  CREATE OR REPLACE FUNCTION public.app_user_belongs_to_store(p_tenant_id uuid)
   RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp'
  AS $function$
    SELECT EXISTS (
      SELECT 1 FROM public.app_users au
       WHERE au.user_id = auth.uid()
         AND (au.role = 'superadmin' OR (au.role = 'admin' AND au.tenant_id = p_tenant_id))
    );
  $function$;
`

const SEED = `
  insert into tenants (id) values ('${T_A}'), ('${T_B}');
  insert into outlets (id, tenant_id) values ('${OUT_A1}', '${T_A}'), ('${OUT_A2}', '${T_A}'), ('${OUT_B1}', '${T_B}');
  insert into auth.users select unnest(array[${Object.values(U).map((id) => `'${id}'::uuid`).join(',')}]);
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id, display_name) values
    ('${U.owner}',      'admin', '${T_A}', true,  '{}',                null,        'Olivia Owner'),
    ('${U.cash}',       'admin', '${T_A}', false, '{cash_manage}',     null,        'Mara Manager'),
    ('${U.cashier}',    'admin', '${T_A}', false, '{pos}',             '${OUT_A1}', 'Cara Cashier'),
    ('${U.branchCash}', 'admin', '${T_A}', false, '{cash_manage,pos}', '${OUT_A1}', 'Bran Cash'),
    ('${U.ownerB}',     'admin', '${T_B}', true,  '{}',                null,        'Bo Owner'),
    ('${U.legacy}',     'admin', '${T_A}', false, null,                null,        'Lee Legacy');
`

const DEFAULTS = {
  blindClose: false, requireDenominations: false, varianceReasonFromCents: 2000, remittanceMode: 'optional',
  requireShiftToSell: false, overdueGraceMinutes: 240, defaultFloatCents: null, updatedAt: null, updatedByName: null,
}

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
async function scalar(db, sql, params) {
  const { rows } = await db.query(sql, params)
  return rows.length === 0 ? undefined : Object.values(rows[0])[0]
}
const save = (db, patch, tenant = T_A) => db.query('select public.save_cash_settings($1, $2::jsonb) as s', [tenant, JSON.stringify(patch)])
const strip = ({ updatedAt, ...rest }) => rest
async function activityCount(db) {
  await reset(db)
  return Number(await scalar(db, "select count(*) from store_activity where tenant_id = $1 and subject_ref = 'cash_rules'", [T_A]))
}

async function checkSettings(db) {
  await as(db, 'authenticated', U.cashier)
  eq(await scalar(db, 'select public.get_cash_settings($1)', [T_A]), DEFAULTS, 'no row = the defaults, readable by a branch-locked cashier')

  await as(db, 'authenticated', U.owner)
  const saved = (await save(db, { blind_close: true, variance_reason_from_cents: 5000 })).rows[0].s
  eq(strip(saved), { ...strip(DEFAULTS), blindClose: true, varianceReasonFromCents: 5000, updatedByName: 'Olivia Owner' },
    'owner saves a patch (column keys); untouched rules keep their defaults; the saver is named by the server')
  eq(typeof saved.updatedAt, 'string', 'the save is stamped')
  const camel = (await save(db, { remittanceMode: 'required', defaultFloatCents: 150000 })).rows[0].s
  eq([camel.remittanceMode, camel.defaultFloatCents, camel.blindClose], ['required', 150000, true], 'camelCase keys are accepted too, and earlier rules stay')
  eq((await save(db, { default_float_cents: null })).rows[0].s.defaultFloatCents, null, 'the usual float can be cleared')
  eq(await activityCount(db), 3, 'each effective save files one settings.changed row')
  await as(db, 'authenticated', U.owner)
  await save(db, { blind_close: true })
  eq(await activityCount(db), 3, 'a save that changes nothing files nothing')
  await reset(db)
  eq(await scalar(db, "select after from store_activity where subject_ref = 'cash_rules' order by occurred_at limit 1"),
    { blindClose: true, varianceReasonFromCents: 5000 }, 'the activity row carries only the rules that changed')

  await as(db, 'authenticated', U.owner)
  for (const [patch, label] of [
    [{ blind_close: 'yes' }, 'a string for a switch'],
    [{ blindClose: 1 }, 'a number for a switch'],
    [{ variance_reason_from_cents: 20.5 }, 'fractional centavos'],
    [{ variance_reason_from_cents: 100001 }, 'a reason threshold above ₱1,000'],
    [{ overdue_grace_minutes: 29 }, 'an overdue grace under 30 minutes'],
    [{ overdue_grace_minutes: '240' }, 'minutes as a string'],
    [{ remittance_mode: 'always' }, 'an unknown remittance mode'],
    [{ default_float_cents: -1 }, 'a negative float'],
    [{ default_float_cents: 100000001 }, 'a float above ₱1,000,000'],
    [{ blind_close: false, colour: 'red' }, 'an unknown key (even next to a valid one)'],
    [{ blind_close: false, blindClose: false }, 'the same rule twice'],
    [{ updated_by_name: 'Me' }, 'a stamp column'],
  ]) {
    await refused(save(db, patch), '22023', `refused: ${label}`)
  }
  await refused(db.query("select public.save_cash_settings($1, '[]'::jsonb)", [T_A]), '22023', 'refused: not an object')
  eq((await rowsOf(db))[0].blind_close, true, 'a refused save changes nothing')

  await as(db, 'authenticated', U.cash)
  eq((await save(db, { require_denominations: true })).rows[0].s.updatedByName, 'Mara Manager', 'a store-wide cash_manage holder may save')
  await as(db, 'authenticated', U.legacy)
  eq((await save(db, { require_denominations: false })).rows.length, 1, 'NULL permissions may save (cash_manage is not opt-in)')
  for (const [uid, label] of [[U.cashier, 'a pos-only cashier'], [U.branchCash, 'a branch-locked cash_manage holder (the rules cover every branch)'], [U.ownerB, "another store's owner"]]) {
    await as(db, 'authenticated', uid)
    await refused(save(db, { blind_close: false }), '42501', `refused: ${label}`)
  }
  await asAnon(db)
  await refused(save(db, { blind_close: false }), '42501', 'anon cannot save')
  await refused(db.query('select public.get_cash_settings($1)', [T_A]), '42501', 'anon cannot read')
  await refused(db.query('select count(*) from tenant_cash_settings'), '42501', 'anon cannot read the table')

  await as(db, 'authenticated', U.owner)
  await refused(db.query('update tenant_cash_settings set blind_close = false'), '42501', 'no client writes the table directly (owner included)')
  await refused(db.query('insert into tenant_cash_settings (tenant_id) values ($1)', [T_B]), '42501', 'no client inserts directly')
  await as(db, 'authenticated', U.cashier)
  eq(Number(await scalar(db, 'select count(*) from tenant_cash_settings')), 1, 'a cashier reads their store\'s rules row')
  await as(db, 'authenticated', U.ownerB)
  eq(Number(await scalar(db, 'select count(*) from tenant_cash_settings')), 0, "another store's owner reads none")
  await refused(db.query('select public.get_cash_settings($1)', [T_A]), '42501', "another store's owner cannot read A's rules")
  eq(await scalar(db, 'select public.get_cash_settings($1)', [T_B]), DEFAULTS, 'a store without a row reads the defaults')

  await as(db, 'authenticated', U.owner)
  await refused(db.query('select cash.tenant_order_backend($1)', [T_A]), '42501', 'cash.tenant_order_backend is internal')
  await refused(db.query('select cash.settings_of($1)', [T_A]), '42501', 'cash.settings_of is internal')
}
async function rowsOf(db) {
  await reset(db)
  return (await db.query('select * from tenant_cash_settings where tenant_id = $1', [T_A])).rows
}

const ADD = 'insert into service_periods (tenant_id, outlet_id, name, starts_minutes, ends_minutes, sort, created_by) values ($1, $2, $3, $4, $5, $6, $7) returning id, created_by, name'
const add = (db, { tenant = T_A, outlet = null, name, starts = 720, ends = 1200, sort = 0, createdBy = null }) =>
  db.query(ADD, [tenant, outlet, name, starts, ends, sort, createdBy])

async function checkServicePeriods(db) {
  await as(db, 'authenticated', U.cash)
  const day = (await add(db, { name: ' Day shift ', createdBy: U.owner })).rows
  eq(day.map(({ created_by, name }) => ({ created_by, name })), [{ created_by: U.cash, name: 'Day shift' }], 'cash_manage adds a store-wide shift; name trimmed; creator stamped by the server')
  eq((await add(db, { name: 'Night shift', starts: 1200, ends: 120, sort: 1 })).rows.length, 1, 'an overnight shift (ends <= starts) is allowed')
  eq((await add(db, { name: 'Branch 2 lunch', outlet: OUT_A2, starts: 660, ends: 840 })).rows.length, 1, 'a branch shift')
  await refused(add(db, { name: 'day shift' }), '23505', 'two live shifts in one scope cannot share a name')
  await refused(add(db, { name: '   ' }), '23514', 'a blank name is refused')
  await refused(add(db, { name: 'x'.repeat(41) }), '23514', 'a 41-character name is refused')
  await refused(add(db, { name: 'Late', starts: 1440 }), '23514', 'minutes are 0..1439')
  await refused(add(db, { name: 'Elsewhere', outlet: OUT_B1 }), '42501', "another store's branch is refused")

  await as(db, 'authenticated', U.branchCash)
  eq((await add(db, { name: 'Branch 1 morning', outlet: OUT_A1, starts: 360, ends: 720 })).rows.length, 1, 'a branch-locked cash manager adds a shift at their branch')
  await refused(add(db, { name: 'Store-wide by branch', starts: 0, ends: 600 }), '42501', 'but not an every-branch shift')
  await refused(add(db, { name: 'Branch 2 by branch 1', outlet: OUT_A2 }), '42501', 'nor at another branch')

  await as(db, 'authenticated', U.cashier)
  await refused(add(db, { name: 'Cashier shift' }), '42501', 'a pos-only cashier cannot add shifts')
  eq((await db.query("update service_periods set name = 'Hacked'")).affectedRows, 0, 'a pos-only cashier changes nothing')
  eq((await db.query('select name from service_periods order by name')).rows.map((row) => row.name), ['Branch 1 morning', 'Day shift', 'Night shift'],
    'a branch-locked cashier reads every-branch shifts and their own branch, not another branch')
  await refused(db.query('delete from service_periods'), '42501', 'nobody deletes a shift (archive instead)')

  await as(db, 'authenticated', U.ownerB)
  eq(Number(await scalar(db, 'select count(*) from service_periods')), 0, "another store's owner reads none")

  await as(db, 'authenticated', U.owner)
  const dayId = day[0].id
  eq((await db.query("update service_periods set name = 'Day', starts_minutes = 600 where id = $1", [dayId])).affectedRows, 1, 'the owner edits a shift')
  eq((await db.query('update service_periods set outlet_id = $2 where id = $1', [dayId, OUT_A1])).affectedRows, 1, 'and may move it to one branch')
  await refused(db.query('update service_periods set tenant_id = $2 where id = $1', [dayId, T_B]), '42501', 'a shift never moves store')
  eq((await db.query("update service_periods set archived_at = '2000-01-01' where id = $1", [dayId])).affectedRows, 1, 'archive')
  eq(new Date(await scalar(db, 'select archived_at from service_periods where id = $1', [dayId])).getFullYear() > 2000, true, 'the archive time is the server\'s')
  await refused(db.query("update service_periods set name = 'Back' where id = $1", [dayId]), '42501', 'an archived shift is frozen')
  eq((await add(db, { name: 'Day', outlet: OUT_A1 })).rows.length, 1, 'an archived name can be reused')
  await asAnon(db)
  await refused(db.query('select count(*) from service_periods'), '42501', 'anon reads nothing')
}

async function main() {
  const db = new PGlite()
  try {
    await installPlatformAuth(db)
    await db.exec(STUB_SCHEMA)
    await db.exec(readMigration('20261013120050_staff_permission_keys.sql'))
    await db.exec(readMigration('20261022130200_expenses_opt_in.sql'))
    await db.exec('set check_function_bodies = off')
    await db.exec(readMigration('20261012150000_store_activity.sql'))
    await db.exec('set check_function_bodies = on')
    await db.exec(SEED)
    await db.exec(readMigration('20261027120100_cash_manage_permission.sql'))
    await db.exec(readMigration('20261027120200_cash_settings.sql'))
    await db.exec(readMigration('20261027120200_cash_settings.sql'))

    await checkSettings(db)
    await checkServicePeriods(db)
    console.log(`Cash settings: ${checks} checks passed (defaults, patch save, validation, who may save/read, service periods per role, archive).`)
  } finally {
    await db.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
