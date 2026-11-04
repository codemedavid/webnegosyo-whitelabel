// staff_shifts business day, blind snapshot, named shift and counts
// (20261027120300), pinned in PGlite as the role that really writes.
//
// Loads the REAL chain
//   20260823120000 staff_shifts, 20260916150000 custody, 20260927120000 server
//   clock, 20261001120000 cash drawers, 20261013120050 + 20261022130200
//   permission keys, 20261012150000 store activity, 20261027120000 cutoffs,
//   20261027120100 cash_manage, 20261027120200 cash settings, then rows as they
//   stand live, then 20261027120300 (under test, incl. its backfill).
// Old app builds' direct INSERT / UPDATE are exercised exactly as they send them.
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, reset, readMigration } = require('./lib/platform-auth.cjs')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { cases: DENOMINATION_CASES } = require('../fixtures/cash-denominations-cases.json')

const T_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_B = 'bbbbbbbb-0000-4000-8000-000000000001'
const OUT_A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const OUT_A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  cashier: '00000000-0000-4000-8000-000000000002',
  cashier2: '00000000-0000-4000-8000-000000000003',
  cashier3: '00000000-0000-4000-8000-000000000004',
  ownerB: '00000000-0000-4000-8000-000000000005',
}
const OLD = {
  late: 'eeeeeeee-0000-4000-8000-000000000001', // opened 23:30 Manila, closed
  early: 'eeeeeeee-0000-4000-8000-000000000002', // opened 00:30 Manila, open
}
const P = {
  store: 'ffffffff-0000-4000-8000-000000000001',
  branch2: 'ffffffff-0000-4000-8000-000000000002',
  archived: 'ffffffff-0000-4000-8000-000000000003',
  otherStore: 'ffffffff-0000-4000-8000-000000000004',
}
const ZERO_DRAWER = '99999999-0000-4000-8000-000000000001'

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
  insert into outlets (id, tenant_id) values ('${OUT_A1}', '${T_A}'), ('${OUT_A2}', '${T_A}');
  insert into auth.users select unnest(array[${Object.values(U).map((id) => `'${id}'::uuid`).join(',')}]);
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id, display_name) values
    ('${U.owner}',    'admin', '${T_A}', true,  '{}',    null,        'Olivia Owner'),
    ('${U.cashier}',  'admin', '${T_A}', false, '{pos}', '${OUT_A1}', 'Cara'),
    ('${U.cashier2}', 'admin', '${T_A}', false, '{pos}', '${OUT_A1}', 'Cy'),
    ('${U.cashier3}', 'admin', '${T_A}', false, '{pos}', null,        'Cleo'),
    ('${U.ownerB}',   'admin', '${T_B}', true,  '{}',    null,        'Bo');
  -- Rows as they stand live before the migration (fixture owner: no server clock).
  insert into staff_shifts (id, tenant_id, outlet_id, staff_user_id, staff_name, opening_float, opened_at) values
    ('${OLD.late}',  '${T_A}', '${OUT_A1}', '${U.cashier2}', 'Cy',   500, '2026-10-26T23:30:00+08:00'),
    ('${OLD.early}', '${T_A}', '${OUT_A1}', '${U.cashier3}', 'Cleo', 500, '2026-10-27T00:30:00+08:00');
  update staff_shifts set status = 'closed', closed_at = '2026-10-27T03:00:00+08:00', expected_cash = 900, closing_count = 880
   where id = '${OLD.late}';
  insert into cash_drawers (id, tenant_id, outlet_id, name, is_zero_balance) values ('${ZERO_DRAWER}', '${T_A}', '${OUT_A1}', 'Zero till', true);
  insert into service_periods (id, tenant_id, outlet_id, name, starts_minutes, ends_minutes, archived_at) values
    ('${P.store}',      '${T_A}', null,        'Day shift',   720,  1200, null),
    ('${P.branch2}',    '${T_A}', '${OUT_A2}', 'B2 lunch',    660,  840,  null),
    ('${P.archived}',   '${T_A}', null,        'Old night',   1200, 120,  now()),
    ('${P.otherStore}', '${T_B}', null,        'Other day',   720,  1200, null);
`

let checks = 0
function eq(actual, expected, message) {
  checks += 1
  assert.deepEqual(actual, expected, message)
}
async function refused(promise, code, message, pattern) {
  checks += 1
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `${message}: expected SQLSTATE ${code}, got ${error.code} (${error.message})`)
    if (pattern) assert.match(error.message, pattern, `${message}: message`)
    return true
  }, message)
}
async function scalar(db, sql, params) {
  const { rows } = await db.query(sql, params)
  return rows.length === 0 ? undefined : Object.values(rows[0])[0]
}
async function shift(db, id) {
  await reset(db)
  return (await db.query('select * from staff_shifts where id = $1', [id])).rows[0]
}
const OPEN = "insert into staff_shifts (tenant_id, outlet_id, staff_user_id, staff_name, opening_float) values ($1, $2, $3, 'Cashier', $4) returning id"
async function openAs(db, uid, { outlet = OUT_A1, float = 500, extra = {} } = {}) {
  await as(db, 'authenticated', uid)
  const columns = ['tenant_id', 'outlet_id', 'staff_user_id', 'staff_name', 'opening_float', ...Object.keys(extra)]
  const values = [T_A, outlet, uid, 'Cashier', float, ...Object.values(extra).map((v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v))]
  const { rows } = await db.query(`insert into staff_shifts (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) returning id`, values)
  return rows[0].id
}
const CLOSE = "update staff_shifts set status = 'closed', closed_at = now(), expected_cash = $2, closing_count = $3 where id = $1"

async function checkDenominations(db) {
  await as(db, 'authenticated', U.cashier)
  for (const { name, counts, totalCents } of DENOMINATION_CASES) {
    const total = await scalar(db, 'select cash.denominations_total_cents($1::jsonb)', [counts === null ? null : JSON.stringify(counts)])
    eq(total === null ? null : Number(total), totalCents, `denominations: ${name}`)
  }
}

async function checkBackfill(db) {
  eq((await shift(db, OLD.late)).close_kind, 'counted', 'closed shifts are backfilled as counted')
  eq(await scalar(db, 'select business_day::text from staff_shifts where id = $1', [OLD.late]), '2026-10-26', 'backfill: 23:30 Manila belongs to that calendar day')
  eq(await scalar(db, 'select business_day::text from staff_shifts where id = $1', [OLD.early]), '2026-10-27', 'backfill: 00:30 Manila is the next calendar day (no cutoff existed)')
  eq(await scalar(db, 'select close_kind from staff_shifts where id = $1', [OLD.early]), null, 'an open shift has no close kind')
  eq(await scalar(db, "select count(*)::int from staff_shifts where business_day is null"), 0, 'every row has a business day')
}

async function checkInsert(db) {
  // Old build: exactly what it sends today.
  await as(db, 'authenticated', U.cashier)
  const id = (await db.query(OPEN, [T_A, OUT_A1, U.cashier, 500])).rows[0].id
  let row = await shift(db, id)
  eq(await scalar(db, 'select business_day = public.business_day_of(tenant_id, opened_at) from staff_shifts where id = $1', [id]), true, 'an old build\'s INSERT is stamped with the server business day')
  eq([row.is_blind, row.close_kind, row.service_period_id], [false, null, null], 'non-blind store: not blind; no close facts; no named shift')
  await as(db, 'authenticated', U.cashier)
  eq((await db.query(CLOSE, [id, 500, 500])).affectedRows, 1, "an old build's close still works")
  row = await shift(db, id)
  eq([row.status, row.close_kind], ['closed', 'counted'], 'its close is recorded as counted')

  // A forged day / blind flag / close facts from a client are overwritten.
  const forged = await openAs(db, U.cashier, { extra: { business_day: '2000-01-01', is_blind: true, close_kind: 'forced', variance_reason: 'not_sure', device_expected_cash: 1 } })
  row = await shift(db, forged)
  eq([row.business_day.getFullYear() > 2000, row.is_blind, row.close_kind, row.variance_reason, row.device_expected_cash], [true, false, null, null, null], 'a client cannot pick its business day, blindness or close facts at clock-in')
  await as(db, 'authenticated', U.cashier)
  await db.query(CLOSE, [forged, 500, 500])

  // Cutoff: the shift's day follows business_day_of, not the calendar.
  await reset(db)
  await db.query("insert into business_day_cutoffs (tenant_id, effective_from, cutoff_minutes) values ($1, '2020-01-01', 705)", [T_A])
  const afterCutoff = await openAs(db, U.cashier)
  eq(await scalar(db, "select business_day = public.business_day_of(tenant_id, opened_at) and business_day = ((opened_at at time zone 'Asia/Manila') - interval '705 minutes')::date from staff_shifts where id = $1", [afterCutoff]), true,
    'with an 11:45 AM cutoff the shift takes the business day it opened in')
  await as(db, 'authenticated', U.cashier)
  await db.query(CLOSE, [afterCutoff, 500, 500])
  await reset(db)
  await db.query('delete from business_day_cutoffs where tenant_id = $1', [T_A])

  // Service role (imports) keeps a supplied day.
  await as(db, 'service_role', null)
  const imported = (await db.query("insert into staff_shifts (tenant_id, outlet_id, staff_user_id, staff_name, opening_float, opened_at, business_day) values ($1, $2, $3, 'Import', 0, '2026-01-02T01:00:00+08:00', '2026-01-01') returning business_day::text as day", [T_A, OUT_A1, U.owner])).rows[0]
  eq(imported.day, '2026-01-01', 'a service-role import keeps the business day it supplies')
}

async function checkBlindSnapshot(db) {
  await as(db, 'authenticated', U.owner)
  await db.query("select public.save_cash_settings($1, '{\"blind_close\": true}'::jsonb)", [T_A])
  const blind = await openAs(db, U.cashier)
  eq((await shift(db, blind)).is_blind, true, 'a blind store snapshots is_blind at clock-in')
  await as(db, 'authenticated', U.owner)
  await db.query("select public.save_cash_settings($1, '{\"blind_close\": false}'::jsonb)", [T_A])
  eq((await shift(db, blind)).is_blind, true, 'turning blind off never changes a running shift')
  await as(db, 'authenticated', U.cashier)
  await refused(db.query('update staff_shifts set is_blind = false where id = $1', [blind]), 'P0001', 'a cashier cannot unblind their own shift', /custody/)
  // Wave 1: no blind guard yet, so an old build may still close it directly.
  eq((await db.query(CLOSE, [blind, 500, 500])).affectedRows, 1, 'wave 1: a blind shift still closes through the legacy path')
}

async function checkServicePeriod(db) {
  const ok = await openAs(db, U.cashier, { extra: { service_period_id: P.store } })
  eq((await shift(db, ok)).service_period_id, P.store, 'a cashier picks an every-branch named shift')
  await as(db, 'authenticated', U.cashier)
  await refused(db.query('update staff_shifts set service_period_id = null where id = $1', [ok]), 'P0001', 'the named shift is pinned once open', /custody/)
  await db.query(CLOSE, [ok, 500, 500])
  await refused(openAs(db, U.cashier, { extra: { service_period_id: P.branch2 } }), '23503', "another branch's named shift is refused")
  await refused(openAs(db, U.cashier, { extra: { service_period_id: P.otherStore } }), '23503', "another store's named shift is refused")
  await refused(openAs(db, U.cashier, { extra: { service_period_id: P.archived } }), '23514', 'an archived named shift is refused')
}

async function checkCounts(db) {
  const counted = await openAs(db, U.cashier, { float: 1520, extra: { opening_denominations: { b1000: 1, b500: 1, b20: 1 } } })
  eq((await shift(db, counted)).opening_denominations, { b1000: 1, b500: 1, b20: 1 }, 'the float may be counted bill by bill')
  await as(db, 'authenticated', U.cashier)
  await refused(db.query("update staff_shifts set opening_denominations = '{}'::jsonb where id = $1", [counted]), 'P0001', 'the opening count is pinned', /custody/)
  await refused(db.query("update staff_shifts set closing_denominations = '{\"b100\":1}'::jsonb where id = $1", [counted]), 'P0001', 'close-time facts cannot be written while the shift stays open', /custody/)
  await refused(db.query("update staff_shifts set variance_reason = 'not_sure' where id = $1", [counted]), 'P0001', 'nor the reason', /custody/)

  await refused(db.query("update staff_shifts set status = 'closed', closed_at = now(), expected_cash = 2000, closing_count = 1999, closing_denominations = $2::jsonb where id = $1", [counted, JSON.stringify({ b1000: 2 })]), '22023', 'a bill count that does not add up to the count is refused')
  await refused(db.query("update staff_shifts set status = 'closed', closed_at = now(), expected_cash = 2000, closing_count = 2000, closing_denominations = $2::jsonb where id = $1", [counted, JSON.stringify({ b2000: 1 })]), '22023', 'an invalid bill count is refused')
  await refused(db.query("update staff_shifts set status = 'closed', closed_at = now(), expected_cash = 2000, closing_count = 2000, closing_non_cash = $2::jsonb where id = $1", [counted, JSON.stringify([{ method: 'GCash', declaredCents: 1.5 }])]), '22023', 'invalid non-cash tallies are refused')
  await refused(db.query("update staff_shifts set status = 'closed', closed_at = now(), expected_cash = 2000, closing_count = 2000, variance_reason = 'bad luck' where id = $1", [counted]), '23514', 'an unknown reason key is refused')
  eq((await db.query(`update staff_shifts set status = 'closed', closed_at = now(), expected_cash = 2000, closing_count = 1980.25,
      closing_denominations = $2::jsonb, closing_non_cash = $3::jsonb, variance_reason = 'wrong_change', device_expected_cash = 2000, close_kind = 'forced', note = 'x'
      where id = $1`, [counted, JSON.stringify({ b1000: 1, b500: 1, b200: 2, b50: 1, c10: 3, c025: 1 }), JSON.stringify([{ method: 'GCash', declaredCents: 125000, slipCount: 4 }])])).affectedRows, 1,
    'a full close: bills add up, tallies and reason recorded')
  const closed = await shift(db, counted)
  eq([closed.close_kind, closed.variance_reason, closed.device_expected_cash, closed.closing_non_cash], ['counted', 'wrong_change', '2000.00', [{ method: 'GCash', declaredCents: 125000, slipCount: 4 }]],
    "a client's close is always 'counted' (forced closes arrive with their RPC)")
  await as(db, 'authenticated', U.cashier)
  eq((await db.query("update staff_shifts set variance_reason = 'not_sure' where id = $1", [counted])).affectedRows, 0, 'closed evidence stays immutable')

  await refused(openAs(db, U.cashier, { float: 500, extra: { opening_denominations: { b100: 4 } } }), '22023', 'an opening count that is not the float is refused')
  await refused(openAs(db, U.cashier, { float: 500, extra: { opening_denominations: { b100: '5' } } }), '22023', 'an invalid opening count is refused')
  await refused(openAs(db, U.cashier, { float: 0, extra: { drawer_id: ZERO_DRAWER, opening_denominations: { b100: 1 } } }), '22023', 'a zero-balance till starts at ₱0 (the drawer snapshot runs first), so a counted ₱100 is refused')
  const zero = await openAs(db, U.cashier, { float: 300, extra: { drawer_id: ZERO_DRAWER, opening_denominations: {} } })
  eq(Number((await shift(db, zero)).opening_float), 0, 'zero-balance: float forced to 0 and an empty count agrees')
}

// The web shift list (src/lib/cash/shifts-read.ts) selects these columns by
// name; run its exact select so a renamed column fails here, not in production.
async function checkWebSelect(db) {
  const source = readFileSync(path.join(__dirname, '../../src/lib/cash/shifts-read.ts'), 'utf8')
  const match = source.match(/const COLUMNS =\s*'([^']+)'/)
  eq(Boolean(match), true, 'shifts-read.ts still declares its COLUMNS select')
  await as(db, 'authenticated', U.cashier)
  const { rows } = await db.query(`select ${match[1]} from staff_shifts limit 1`)
  eq(rows.length, 1, `every column shifts-read.ts selects exists and is readable by staff (${match[1].split(',').length} columns)`)
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
    await db.exec('set check_function_bodies = off')
    await db.exec(readMigration('20261012150000_store_activity.sql'))
    await db.exec('set check_function_bodies = on')
    for (const file of ['20261027120000_business_day_cutoffs.sql', '20261027120100_cash_manage_permission.sql', '20261027120200_cash_settings.sql']) {
      await db.exec(readMigration(file))
    }
    await db.exec(SEED)
    await db.exec(readMigration('20261027120300_staff_shift_business_day.sql'))
    await db.exec(readMigration('20261027120300_staff_shift_business_day.sql'))

    await checkDenominations(db)
    await checkBackfill(db)
    await checkInsert(db)
    await checkBlindSnapshot(db)
    await checkServicePeriod(db)
    await checkCounts(db)
    await checkWebSelect(db)
    console.log(`Shift business day: ${checks} checks passed (denominations fixture, backfill, server-stamped day, old-build writes, blind snapshot, named shift, counts and pins).`)
  } finally {
    await db.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
