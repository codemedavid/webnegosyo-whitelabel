// Business day cutoff (20261027120000), pinned in an isolated PostgreSQL
// (PGlite) as the role that really runs each query.
//
// Loads the REAL migrations
//   20261013120050_staff_permission_keys.sql   app_user_has_permission
//   20261022130200_expenses_opt_in.sql         its live body (2026-10-26)
//   20261012150000_store_activity.sql          activity writer (settings.changed)
//   20261027120000_business_day_cutoffs.sql    under test
// over a stub of the live platform schema (shared with run-expenses.cjs; live
// bodies copied 2026-10-21, re-checked 2026-10-27).
//
// now() cannot be faked, so the effective-date rules are pinned through
// business_day_cutoff_starts_on at FIXED instants, and set_business_day_cutoff
// is checked against that helper at the real now().
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')

const T_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_B = 'bbbbbbbb-0000-4000-8000-000000000001'
const T_TZ = 'cccccccc-0000-4000-8000-000000000001' // a store outside Manila
const T_CUT = 'dddddddd-0000-4000-8000-000000000001' // fixed-case store, rows written by the fixture
const OUT_A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'

const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  legacy: '00000000-0000-4000-8000-000000000002',
  settings: '00000000-0000-4000-8000-000000000003',
  cashier: '00000000-0000-4000-8000-000000000004',
  branchSettings: '00000000-0000-4000-8000-000000000005',
  ownerB: '00000000-0000-4000-8000-000000000006',
  ownerTz: '00000000-0000-4000-8000-000000000007',
  superadmin: '00000000-0000-4000-8000-000000000008',
}

const STUB_SCHEMA = `
  create table tenants (
    id uuid primary key, operating_hours jsonb, timezone text not null default 'Asia/Manila',
    enforce_operating_hours boolean default false
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
`

const SEED = `
  insert into tenants (id, timezone) values
    ('${T_A}', 'Asia/Manila'), ('${T_B}', 'Asia/Manila'), ('${T_TZ}', 'Asia/Singapore'), ('${T_CUT}', 'Asia/Manila');
  insert into outlets (id, tenant_id) values ('${OUT_A1}', '${T_A}');
  insert into auth.users select unnest(array[${Object.values(U).map((id) => `'${id}'::uuid`).join(',')}]);
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id, display_name) values
    ('${U.owner}',          'admin', '${T_A}',  true,  '{}',         null,        'Olivia Owner'),
    ('${U.legacy}',         'admin', '${T_A}',  false, null,         null,        'Lee Legacy'),
    ('${U.settings}',       'admin', '${T_A}',  false, '{settings}', null,        'Sam Settings'),
    ('${U.cashier}',        'admin', '${T_A}',  false, '{pos}',      '${OUT_A1}', 'Cara Cashier'),
    ('${U.branchSettings}', 'admin', '${T_A}',  false, '{settings}', '${OUT_A1}', 'Bran Settings'),
    ('${U.ownerB}',         'admin', '${T_B}',  true,  '{}',         null,        'Bo Owner'),
    ('${U.ownerTz}',        'admin', '${T_TZ}', true,  '{}',         null,        'Tess Zone'),
    ('${U.superadmin}',     'superadmin', null, false, null,         null,        'Support');
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
const iso = (value) => new Date(value).toISOString()
const dayOf = (db, tenant, at) => scalar(db, 'select public.business_day_of($1, $2)::text', [tenant, at])
async function bounds(db, tenant, day) {
  const { rows } = await db.query('select start_at, end_at from public.business_day_bounds($1, $2::date)', [tenant, day])
  return [iso(rows[0].start_at), iso(rows[0].end_at)]
}
const startsOn = (db, tenant, minutes, at, closed = false) =>
  scalar(db, 'select public.business_day_cutoff_starts_on($1, $2, $3, $4)::text', [tenant, minutes, at, closed])

async function checkMidnightDefault(db) {
  await reset(db)
  // No row = the Manila calendar day, at every hour of the day.
  for (let hour = 0; hour < 24; hour += 1) {
    const at = `2026-07-14T${String(hour).padStart(2, '0')}:30:00+08:00`
    eq(await dayOf(db, T_A, at), '2026-07-14', `no cutoff: ${at} is the Manila calendar date`)
  }
  eq(await dayOf(db, T_A, '2026-07-14T00:00:00+08:00'), '2026-07-14', 'midnight exactly starts the day')
  eq(await dayOf(db, T_A, '2026-07-13T23:59:59.999+08:00'), '2026-07-13', 'a millisecond before midnight is the day before')
  eq(await bounds(db, T_A, '2026-07-14'), ['2026-07-13T16:00:00.000Z', '2026-07-14T16:00:00.000Z'], 'no cutoff: Manila midnight to midnight')
  eq(await scalar(db, "select public.business_day_cutoff_for($1, '2026-07-14')::text", [T_A]), '00:00:00', 'no cutoff = 0 minutes')
}

async function checkFixedCutoffs(db) {
  await reset(db)
  await db.query(`insert into business_day_cutoffs (tenant_id, effective_from, cutoff_minutes) values
    ($1, '2026-01-01', 240),   -- 4 AM
    ($1, '2026-03-15', 0),     -- back to midnight: 03-14 is 20 h
    ($1, '2026-03-20', 180)    -- 3 AM: 03-19 is 27 h`, [T_CUT])
  eq(await dayOf(db, T_CUT, '2026-02-10T03:59:59+08:00'), '2026-02-09', '4 AM cutoff: 03:59 belongs to the day before')
  eq(await dayOf(db, T_CUT, '2026-02-10T04:00:00+08:00'), '2026-02-10', '4 AM cutoff: 04:00 starts the day')
  eq(await bounds(db, T_CUT, '2026-02-10'), ['2026-02-09T20:00:00.000Z', '2026-02-10T20:00:00.000Z'], '4 AM day: 04:00 to 04:00 the next morning')
  eq(await dayOf(db, T_CUT, '2025-12-31T23:00:00+08:00'), '2025-12-31', 'before the first row the day is midnight-to-midnight')
  eq(await bounds(db, T_CUT, '2025-12-31'), ['2025-12-30T16:00:00.000Z', '2025-12-31T20:00:00.000Z'], 'the first cutoff day lengthens the day before it (28 h)')
  eq(await dayOf(db, T_CUT, '2026-01-01T02:00:00+08:00'), '2025-12-31', '02:00 on the first 4 AM day still belongs to the day before')
  eq(await bounds(db, T_CUT, '2026-03-14'), ['2026-03-13T20:00:00.000Z', '2026-03-14T16:00:00.000Z'], 'moving the cutoff earlier shortens the day before (20 h)')
  eq(await dayOf(db, T_CUT, '2026-03-15T02:00:00+08:00'), '2026-03-15', 'after the change back, 02:00 is its own day')
  eq(await bounds(db, T_CUT, '2026-03-19'), ['2026-03-18T16:00:00.000Z', '2026-03-19T19:00:00.000Z'], 'moving it later lengthens the day before (27 h)')
  eq(await dayOf(db, T_CUT, '2026-03-20T02:59:00+08:00'), '2026-03-19', '3 AM cutoff: 02:59 belongs to the day before')

  // Tiling: every day ends where the next one starts, across every change.
  const { rows } = await db.query(`
    select d::date::text as day, b.start_at, b.end_at,
           (select n.start_at from public.business_day_bounds($1, (d + interval '1 day')::date) n) as next_start
      from generate_series('2025-12-25'::date, '2026-03-25'::date, interval '1 day') d,
           lateral public.business_day_bounds($1, d::date) b`, [T_CUT])
  eq(rows.every((row) => iso(row.end_at) === iso(row.next_start)), true, 'consecutive business days tile exactly')
  eq(rows.every((row) => new Date(row.end_at) > new Date(row.start_at)), true, 'every day has positive length')
  // Every instant belongs to the day whose bounds contain it.
  const { rows: probes } = await db.query(`
    select t, public.business_day_of($1, t)::text as day, b.start_at, b.end_at
      from generate_series('2025-12-30 00:00+08'::timestamptz, '2026-03-22 00:00+08'::timestamptz, interval '37 minutes') t,
           lateral public.business_day_bounds($1, public.business_day_of($1, t)) b`, [T_CUT])
  eq(probes.every((row) => new Date(row.start_at) <= new Date(row.t) && new Date(row.t) < new Date(row.end_at)), true,
    `every probed instant (${probes.length}) lies inside its business day's bounds`)
}

async function checkEffectiveDateRules(db) {
  await reset(db)
  // Store A has no rows: a change at 10:00 applies from tomorrow.
  eq(await startsOn(db, T_A, 240, '2026-05-10T10:00:00+08:00'), '2026-05-11', 'applies from tomorrow, never today')
  eq(await startsOn(db, T_A, 240, '2026-05-10T10:00:00+08:00', true), '2026-05-12', 'today already closed: its end stays, start one day later')
  eq(await startsOn(db, T_A, 0, '2026-05-10T23:59:00+08:00'), '2026-05-11', 'late evening: tomorrow midnight is still ahead')
  // Store with a 4 AM cutoff, deciding at 02:00 on 05-11 (still business day 05-10).
  await db.query(`insert into business_day_cutoffs (tenant_id, effective_from, cutoff_minutes) values ($1, '2026-05-01', 240)`, [T_B])
  eq(await startsOn(db, T_B, 180, '2026-05-11T02:00:00+08:00'), '2026-05-11', '3 AM is still ahead at 02:00: today ends at 03:00 instead')
  eq(await startsOn(db, T_B, 0, '2026-05-11T02:00:00+08:00'), '2026-05-12', 'never in the past: midnight already went by, so one more day')
  eq(await startsOn(db, T_B, 120, '2026-05-11T02:00:00+08:00'), '2026-05-12', 'a start exactly at now is the past too')
  eq(await startsOn(db, T_B, 0, '2026-05-11T02:00:00+08:00', true), '2026-05-12', 'closed today and past start: still one move, no skipping')
  await db.query('delete from business_day_cutoffs where tenant_id = $1', [T_B])
}

async function expectedStart(db, tenant, minutes) {
  await reset(db)
  return startsOn(db, tenant, minutes, new Date().toISOString())
}

async function checkSetter(db) {
  const firstStart = await expectedStart(db, T_A, 240)
  await reset(db)
  await db.query("insert into business_day_cutoffs (tenant_id, effective_from, cutoff_minutes) values ($1, '2025-01-01', 0)", [T_A])

  await as(db, 'authenticated', U.owner)
  eq(await scalar(db, 'select public.set_business_day_cutoff($1, 240)::text', [T_A]), firstStart, 'owner: the new cutoff starts on the first day that has not begun')
  const rowsOf = async () => (await db.query('select effective_from::text as day, cutoff_minutes as minutes, set_by, set_by_name from business_day_cutoffs where tenant_id = $1 order by 1', [T_A])).rows
  eq(await rowsOf(), [
    { day: '2025-01-01', minutes: 0, set_by: null, set_by_name: null },
    { day: firstStart, minutes: 240, set_by: U.owner, set_by_name: 'Olivia Owner' },
  ], 'started rows are untouched; the new row names who set it (from app_users, not the client)')

  // A pending later row is replaced by a newer decision.
  await reset(db)
  await db.query("insert into business_day_cutoffs (tenant_id, effective_from, cutoff_minutes) values ($1, ($2::date + 5), 60)", [T_A, firstStart])
  const secondStart = await expectedStart(db, T_A, 180)
  await as(db, 'authenticated', U.settings)
  eq(await scalar(db, 'select public.set_business_day_cutoff($1, 180)::text', [T_A]), secondStart, 'a store-wide `settings` holder may change it')
  eq((await rowsOf()).map(({ day, minutes }) => ({ day, minutes })), [
    { day: '2025-01-01', minutes: 0 }, { day: secondStart, minutes: 180 },
  ], 'pending decisions are replaced, not stacked')

  // Back to what was in effect before: no row remains.
  await as(db, 'authenticated', U.legacy)
  await db.query('select public.set_business_day_cutoff($1, 0)', [T_A])
  eq((await rowsOf()).map(({ day }) => day), ['2025-01-01'], 'a change back to the cutoff already in effect leaves no pending row (legacy full access may set it)')

  await as(db, 'authenticated', U.superadmin)
  await db.query('select public.set_business_day_cutoff($1, 240)', [T_A])
  eq((await rowsOf()).length, 2, 'a superadmin (support) may set it')

  // A closed day keeps its end (business_day_closes arrives in wave 3).
  await reset(db)
  await db.query('create table business_day_closes (tenant_id uuid, business_day date, status text)')
  await db.query("insert into business_day_closes values ($1, public.business_day_of($1, now()), 'closed')", [T_A])
  const closedStart = await scalar(db, 'select public.business_day_cutoff_starts_on($1, 120, now(), true)::text', [T_A])
  await as(db, 'authenticated', U.owner)
  eq(await scalar(db, 'select public.set_business_day_cutoff($1, 120)::text', [T_A]), closedStart, 'today closed: the change starts a day later')
  eq(closedStart >= (await scalar(db, "select (public.business_day_of($1, now()) + 2)::text", [T_A])), true, 'which is at least two business days out')
  eq(Number(await scalar(db, 'select count(*) from business_day_cutoffs where tenant_id = $1 and effective_from < $2::date and effective_from > $3', [T_A, closedStart, '2025-01-01'])), 1, "the earlier pending row (tomorrow's 4 AM) is kept: the new decision cannot start tomorrow")
  await reset(db)
  await db.query('drop table business_day_closes')

  await reset(db)
  const titles = (await db.query("select summary->>'title' as title, actor_user_id, subject_ref from store_activity where tenant_id = $1 and kind = 'settings.changed' order by occurred_at", [T_A])).rows
  eq(titles.length, 5, 'every effective change files one settings.changed activity row')
  eq(titles[0].title.startsWith('Business day now ends at 4:00 AM, from '), true, `activity title reads like the owner talks (${titles[0].title})`)
  eq(titles[2].title.startsWith('Business day now ends at midnight'), true, 'midnight reads as midnight')
  eq(titles.every((row) => row.subject_ref === 'business_day_cutoff'), true, 'subject is the cutoff setting')
  eq(titles[0].actor_user_id, U.owner, 'actor is the caller')
}

async function checkRefusals(db) {
  await asAnon(db)
  for (const sql of [
    "select public.business_day_of($1, now())",
    "select public.business_day_cutoff_for($1, current_date)",
    "select * from public.business_day_bounds($1, current_date)",
    "select public.set_business_day_cutoff($1, 240)",
  ]) {
    await refused(db.query(sql, [T_A]), '42501', `anon cannot call: ${sql}`)
  }
  await refused(db.query('select count(*) from business_day_cutoffs'), '42501', 'anon cannot read cutoffs')

  for (const [who, message] of [
    [U.cashier, 'a pos-only cashier cannot change the business day'],
    [U.branchSettings, 'a branch-locked `settings` holder cannot change a store-wide setting'],
    [U.ownerB, "another store's owner cannot change it"],
  ]) {
    await as(db, 'authenticated', who)
    await refused(db.query('select public.set_business_day_cutoff($1, 240)', [T_A]), '42501', message)
  }
  await as(db, 'authenticated', U.cashier)
  await refused(db.query('select public.business_day_cutoff_starts_on($1, 240, now(), false)', [T_A]), '42501', 'the effective-date helper is internal')
  await refused(db.query("insert into business_day_cutoffs (tenant_id, effective_from, cutoff_minutes) values ($1, '2030-01-01', 240)", [T_A]), '42501', 'clients cannot write cutoffs directly')
  // 2025-01-01 + the superadmin's 4 AM + the closed-day 2 AM one day after it.
  eq(Number(await scalar(db, 'select count(*) from business_day_cutoffs')), 3, 'a branch-locked cashier reads their store\'s cutoffs (screens need the day)')
  eq(await scalar(db, "select public.business_day_of($1, '2026-02-10T03:00:00+08:00')::text", [T_CUT]), '2026-02-09', 'helpers are callable by signed-in staff')

  await as(db, 'authenticated', U.ownerB)
  eq(Number(await scalar(db, 'select count(*) from business_day_cutoffs')), 0, "another store's owner reads none of A's rows")

  await as(db, 'authenticated', U.owner)
  for (const minutes of [710, 7, -15, 720]) {
    await refused(db.query('select public.set_business_day_cutoff($1, $2)', [T_A, minutes]), '22023', `cutoff ${minutes} is refused (00:00–11:45, 15-minute steps)`)
  }
  await as(db, 'authenticated', U.ownerTz)
  await refused(db.query('select public.set_business_day_cutoff($1, 240)', [T_TZ]), '22023', 'a store outside Asia/Manila fails loudly')
  await reset(db)
  await refused(db.query("insert into business_day_cutoffs (tenant_id, effective_from, cutoff_minutes) values ($1, '2030-01-01', 250)", [T_A]), '23514', 'the table refuses off-step minutes too')
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
    await db.exec(readMigration('20261027120000_business_day_cutoffs.sql'))

    await checkMidnightDefault(db)
    await checkFixedCutoffs(db)
    await checkEffectiveDateRules(db)
    await checkSetter(db)
    await checkRefusals(db)
    console.log(`Business day: ${checks} checks passed (midnight default, 4 AM cutoff, transition days, tiling, effective-date rules, setter, activity, refusals).`)
  } finally {
    await db.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
