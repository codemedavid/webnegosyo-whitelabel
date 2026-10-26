// `cash_manage` permission key (20261027120100), pinned in PGlite as the role
// that really runs each query: the backfill, app_user_manages_cash on top of
// app_user_has_permission, and EVERY existing cash policy that calls it
// (cash_drawers insert/update, staff_shifts_close, shift_cash_movements_insert).
//
// Loads the REAL migrations
//   20260823120000_staff_shifts.sql, 20260916150000_staff_shift_custody.sql,
//   20260927120000_staff_shift_server_timestamps.sql, 20261001120000_cash_drawers.sql
//   20261013120050_staff_permission_keys.sql + 20261022130200_expenses_opt_in.sql
//   20261027120100_cash_manage_permission.sql        under test
// over the live slice of app_users / app_user_may_reach_branch (copied from
// live 2026-10-27, pg_get_functiondef). Every write asserts the affected rows
// or the SQLSTATE: RLS refusals are silent.
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, reset, readMigration } = require('./lib/platform-auth.cjs')

const T_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_B = 'bbbbbbbb-0000-4000-8000-000000000001'
const OUT_A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const OUT_A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'

const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  legacy: '00000000-0000-4000-8000-000000000002',
  storeSetup: '00000000-0000-4000-8000-000000000003',
  both: '00000000-0000-4000-8000-000000000004',
  cashManage: '00000000-0000-4000-8000-000000000005',
  cashier: '00000000-0000-4000-8000-000000000006',
  colleague: '00000000-0000-4000-8000-000000000007',
  branchCash: '00000000-0000-4000-8000-000000000008',
  ownerB: '00000000-0000-4000-8000-000000000009',
  superadmin: '00000000-0000-4000-8000-00000000000a',
  menuOnly: '00000000-0000-4000-8000-00000000000b',
}

const STUB_SCHEMA = `
  create table tenants (id uuid primary key);
  create table outlets (id uuid primary key, tenant_id uuid not null references tenants(id) on delete cascade);
  create table app_users (
    user_id uuid primary key, role text not null, tenant_id uuid,
    is_owner boolean not null default false, permissions text[], outlet_id uuid
  );
  alter table app_users enable row level security;
  create policy app_users_select_self on app_users for select to authenticated using (user_id = auth.uid());
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
`

// Accounts as they stand BEFORE the migration (the backfill runs over them).
const SEED = `
  insert into tenants values ('${T_A}'), ('${T_B}');
  insert into outlets values ('${OUT_A1}', '${T_A}'), ('${OUT_A2}', '${T_A}');
  insert into auth.users select unnest(array[${Object.values(U).map((id) => `'${id}'::uuid`).join(',')}]);
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id) values
    ('${U.owner}',      'admin', '${T_A}', true,  '{}',                         null),
    ('${U.legacy}',     'admin', '${T_A}', false, null,                         null),
    ('${U.storeSetup}', 'admin', '${T_A}', false, '{pos,store_setup}',          null),
    ('${U.both}',       'admin', '${T_A}', false, '{store_setup,cash_manage}',  null),
    ('${U.cashManage}', 'admin', '${T_A}', false, '{cash_manage}',              null),
    ('${U.cashier}',    'admin', '${T_A}', false, '{pos}',                      null),
    ('${U.colleague}',  'admin', '${T_A}', false, '{pos}',                      null),
    ('${U.branchCash}', 'admin', '${T_A}', false, '{cash_manage,pos}',          '${OUT_A1}'),
    ('${U.ownerB}',     'admin', '${T_B}', true,  '{}',                         null),
    ('${U.superadmin}', 'superadmin', null, false, null,                        null),
    ('${U.menuOnly}',   'admin', '${T_A}', false, '{menu,orders}',              null);
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
async function scalar(db, sql, params) {
  const { rows } = await db.query(sql, params)
  return rows.length === 0 ? undefined : Object.values(rows[0])[0]
}

async function checkBackfill(db) {
  await reset(db)
  const { rows } = await db.query('select user_id, permissions from app_users order by user_id')
  const by = Object.fromEntries(rows.map((row) => [row.user_id, row.permissions]))
  eq(by[U.storeSetup], ['pos', 'store_setup', 'cash_manage'], 'store_setup holders are given cash_manage once')
  eq(by[U.both], ['store_setup', 'cash_manage'], 'an account already holding it is not given a duplicate')
  eq(by[U.owner], [], 'owners are untouched (they hold every key)')
  eq(by[U.legacy], null, 'NULL (legacy full access) stays NULL: it already holds cash_manage')
  eq(by[U.cashier], ['pos'], 'a pos-only cashier gets nothing')
  eq(by[U.menuOnly], ['menu', 'orders'], 'unrelated accounts are untouched')
  await db.exec(readMigration('20261027120100_cash_manage_permission.sql'))
  eq((await db.query('select permissions from app_users where user_id = $1', [U.storeSetup])).rows[0].permissions,
    ['pos', 'store_setup', 'cash_manage'], 're-applying the migration adds nothing (idempotent)')
}

async function checkFunction(db) {
  const cases = [
    [U.owner, true, 'owner'],
    [U.legacy, true, 'NULL permissions (cash_manage is not opt-in)'],
    [U.storeSetup, true, 'store_setup holder (backfilled)'],
    [U.cashManage, true, 'cash_manage-only staff'],
    [U.branchCash, true, 'branch-locked cash_manage holder (branch reach is checked by each policy)'],
    [U.superadmin, true, 'superadmin (was false before: NULL tenant_id; 07 §1.5-3)'],
    [U.cashier, false, 'pos-only cashier'],
    [U.menuOnly, false, 'menu/orders staff'],
    [U.ownerB, false, "another store's owner"],
  ]
  for (const [uid, expected, label] of cases) {
    await as(db, 'authenticated', uid)
    eq(await scalar(db, 'select public.app_user_manages_cash($1)', [T_A]), expected, `app_user_manages_cash: ${label}`)
  }
  await reset(db)
  eq(await scalar(db, "select prosecdef from pg_proc where proname = 'app_user_manages_cash'"), false, 'app_user_manages_cash stays SECURITY INVOKER')
}

const MANAGERS = [
  [U.owner, 'owner'],
  [U.legacy, 'NULL permissions'],
  [U.storeSetup, 'store_setup holder'],
  [U.cashManage, 'cash_manage-only staff'],
]

async function openShiftAs(db, uid, outlet = null) {
  await as(db, 'authenticated', uid)
  const { rows } = await db.query("insert into staff_shifts (tenant_id, outlet_id, staff_user_id, staff_name, opening_float) values ($1, $2, $3, 'Cashier', 500) returning id", [T_A, outlet, uid])
  return rows[0].id
}

async function checkPolicies(db) {
  for (const [uid, label] of MANAGERS) {
    // cash_drawers: set up and edit a till.
    await as(db, 'authenticated', uid)
    const name = `Till ${label}`
    const { rows } = await db.query('insert into cash_drawers (tenant_id, name, starting_cash) values ($1, $2, 1000) returning id', [T_A, name])
    eq(rows.length, 1, `${label}: sets up a drawer (cash_drawers_insert_manager)`)
    eq((await db.query('update cash_drawers set starting_cash = 1500 where id = $1', [rows[0].id])).affectedRows, 1, `${label}: edits a drawer (cash_drawers_update_manager)`)

    // shift_cash_movements + staff_shifts_close on SOMEONE ELSE's drawer.
    const shift = await openShiftAs(db, U.cashier)
    await as(db, 'authenticated', uid)
    eq((await db.query("insert into shift_cash_movements (tenant_id, shift_id, kind, amount, recorded_by_name) values ($1, $2, 'collect', 200, 'M') returning id", [T_A, shift])).rows.length, 1,
      `${label}: picks up cash from a cashier's drawer (shift_cash_movements_insert)`)
    eq((await db.query("update staff_shifts set status = 'closed', closed_at = now(), expected_cash = 300, closing_count = 300 where id = $1", [shift])).affectedRows, 1,
      `${label}: closes a cashier's shift (staff_shifts_close)`)
  }

  // A pos-only colleague: refused everywhere (0 rows or 42501).
  const shift = await openShiftAs(db, U.cashier)
  await as(db, 'authenticated', U.colleague)
  await refused(db.query("insert into cash_drawers (tenant_id, name) values ($1, 'Mine')", [T_A]), '42501', 'pos-only: cannot set up a drawer')
  eq((await db.query('update cash_drawers set starting_cash = 1 where tenant_id = $1', [T_A])).affectedRows, 0, 'pos-only: edits no drawer')
  await refused(db.query("insert into shift_cash_movements (tenant_id, shift_id, kind, amount, recorded_by_name) values ($1, $2, 'collect', 50, 'C')", [T_A, shift]), '42501', "pos-only: cannot pick up from a colleague's drawer")
  eq((await db.query("update staff_shifts set status = 'closed', closed_at = now(), expected_cash = 500, closing_count = 500 where id = $1", [shift])).affectedRows, 0, "pos-only: cannot close a colleague's shift")

  // The holder still closes their own drawer (not a manager rule).
  await as(db, 'authenticated', U.cashier)
  eq((await db.query("update staff_shifts set status = 'closed', closed_at = now(), expected_cash = 500, closing_count = 500 where id = $1", [shift])).affectedRows, 1, 'the cashier closes their own shift')

  // Branch-locked cash_manage holder: their branch only.
  const other = await openShiftAs(db, U.colleague, OUT_A2)
  const mine = await openShiftAs(db, U.cashier, OUT_A1)
  await as(db, 'authenticated', U.branchCash)
  eq((await db.query("insert into cash_drawers (tenant_id, outlet_id, name) values ($1, $2, 'Branch till') returning id", [T_A, OUT_A1])).rows.length, 1, 'branch-locked cash_manage: sets up a drawer at their branch')
  await refused(db.query("insert into cash_drawers (tenant_id, outlet_id, name) values ($1, $2, 'Elsewhere')", [T_A, OUT_A2]), '42501', 'branch-locked cash_manage: not at another branch')
  eq((await db.query("update staff_shifts set status = 'closed', closed_at = now(), expected_cash = 500, closing_count = 500 where id = $1", [other])).affectedRows, 0, "branch-locked cash_manage: cannot close another branch's shift")
  eq((await db.query("update staff_shifts set status = 'closed', closed_at = now(), expected_cash = 500, closing_count = 500 where id = $1", [mine])).affectedRows, 1, "branch-locked cash_manage: closes a shift at their own branch")

  // Superadmin passes manages_cash but not branch reach: no table access widens.
  await as(db, 'authenticated', U.superadmin)
  await refused(db.query("insert into cash_drawers (tenant_id, name) values ($1, 'Support till')", [T_A]), '42501', 'superadmin: still no drawer writes (branch reach)')
  eq((await db.query("update staff_shifts set status = 'closed', closed_at = now(), expected_cash = 500, closing_count = 500 where id = $1", [other])).affectedRows, 0, 'superadmin: still closes nothing')

  // Another store's owner: nothing in store A.
  await as(db, 'authenticated', U.ownerB)
  eq((await db.query("update staff_shifts set status = 'closed', closed_at = now(), expected_cash = 500, closing_count = 500 where id = $1", [other])).affectedRows, 0, "another store's owner closes nothing")
}

async function main() {
  const db = new PGlite()
  try {
    await installPlatformAuth(db)
    await db.exec(STUB_SCHEMA)
    for (const file of [
      '20260823120000_staff_shifts.sql',
      '20260916150000_staff_shift_custody.sql',
      '20260927120000_staff_shift_server_timestamps.sql',
      '20261001120000_cash_drawers.sql',
      '20261013120050_staff_permission_keys.sql',
      '20261022130200_expenses_opt_in.sql',
    ]) {
      await db.exec(readMigration(file))
    }
    await db.exec(SEED)
    await db.exec(readMigration('20261027120100_cash_manage_permission.sql'))

    await checkBackfill(db)
    await checkFunction(db)
    await checkPolicies(db)
    console.log(`cash_manage: ${checks} checks passed (backfill, function per role, drawer / pickup / close policies per role, branch lock, superadmin, other store).`)
  } finally {
    await db.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
