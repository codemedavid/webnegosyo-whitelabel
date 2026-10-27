// Business-day adopters (20261027140100): the daily order number resets at
// the cutoff, inventory counts take the server's business day, a drawer
// pay-out's expense lands on the business day it was taken.
//
// Real chain via lib/cash-chain.cjs, plus the REAL daily order number
// (20260916123000), inventory count sessions (20260812120000) and expenses
// (20261022120000 / 120100) migrations, with the minimal stubs those need
// (stock_movements, storage.buckets, stamp_client_actor — live bodies as in
// run-expenses.cjs). Each checkout insert runs AS ANON, like the storefront.
const assert = require('node:assert/strict')
const { as, asAnon, reset } = require('./lib/platform-auth.cjs')
const { buildCashDb, readMigration } = require('./lib/cash-chain.cjs')

const T_NIGHT = 'aaaaaaaa-0000-4000-8000-000000000001' // 4 AM cutoff
const T_DAY = 'bbbbbbbb-0000-4000-8000-000000000001' // no cutoff (midnight)
const A1 = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  cashier: '00000000-0000-4000-8000-000000000002',
  stranger: '00000000-0000-4000-8000-000000000003',
  platform: '00000000-0000-4000-8000-000000000004',
}

const STUBS = `
  create table stock_movements (id uuid primary key default gen_random_uuid(), tenant_id uuid, reason text);
  create schema if not exists storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
  -- Copied from live (as run-expenses.cjs).
  CREATE OR REPLACE FUNCTION public.stamp_client_actor()
   RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
  AS $function$
  begin
    if current_user in ('anon', 'authenticated') then
      new := jsonb_populate_record(new, jsonb_build_object(tg_argv[0], auth.uid(), 'created_at', now()));
    end if;
    return new;
  end;
  $function$;
  revoke all on function public.stamp_client_actor() from public, anon, authenticated;
`
const PEOPLE = `
  insert into tenants (id, is_active) values ('${T_NIGHT}', true), ('${T_DAY}', true);
  insert into outlets (id, tenant_id) values ('${A1}', '${T_NIGHT}');
  insert into auth.users select unnest(array[${Object.values(U).map((id) => `'${id}'::uuid`).join(',')}]);
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id, display_name, platform_permissions) values
    ('${U.owner}',    'admin', '${T_NIGHT}', true,  '{}',           null, 'Olivia', null),
    ('${U.cashier}',  'admin', '${T_NIGHT}', false, '{pos,menu,inventory}', null, 'Cara', null),
    ('${U.stranger}', 'admin', '${T_DAY}',   true,  '{}',           null, 'Sam', null),
    ('${U.platform}', 'platform_staff', null, false, null,          null, 'Pat', '{stores.create,stores.view}');
  insert into business_day_cutoffs (tenant_id, effective_from, cutoff_minutes) values ('${T_NIGHT}', '2026-01-01', 240);
`

let checks = 0
function eq(actual, expected, message) {
  checks += 1
  assert.deepEqual(actual, expected, message)
}
async function scalar(db, sql, params) {
  const { rows } = await db.query(sql, params)
  return rows.length === 0 ? undefined : Object.values(rows[0])[0]
}

async function checkOrderNumbers(db) {
  const place = async (tenant, at) => {
    await reset(db)
    const { rows } = await db.query(`insert into orders (tenant_id, total, created_at) values ($1, 100, $2) returning order_date::text as day, daily_number as n`, [tenant, at])
    return [rows[0].day, rows[0].n]
  }
  eq(await place(T_NIGHT, '2026-10-20T03:00:00+08:00'), ['2026-10-19', 1], '4 AM store: a 3 AM order belongs to the night before')
  eq(await place(T_NIGHT, '2026-10-20T03:59:59+08:00'), ['2026-10-19', 2], 'and keeps that night\'s counter going')
  eq(await place(T_NIGHT, '2026-10-20T04:00:00+08:00'), ['2026-10-20', 1], '#01 starts again at 4:00 AM, not at midnight')
  eq(await place(T_NIGHT, '2026-10-21T01:30:00+08:00'), ['2026-10-20', 2], 'after midnight it is still the same business day')
  eq(await place(T_DAY, '2026-10-20T00:30:00+08:00'), ['2026-10-20', 1], 'a store without a cutoff resets at Manila midnight, as before')
  eq(await place(T_DAY, '2026-10-19T23:30:00+08:00'), ['2026-10-19', 1], 'its late order is its own calendar day')

  // The storefront inserts as anon (no RETURNING: anon has no read policy on
  // orders, live too): the trigger must work with no JWT subject.
  await asAnon(db)
  eq((await db.query("insert into orders (tenant_id, total, status, payment_status, customer_data) values ($1, 50, 'pending', 'pending', '{\"tag\":\"anon\"}')", [T_NIGHT])).affectedRows, 1, 'an anonymous checkout lands')
  await reset(db)
  eq(Number(await scalar(db, "select daily_number from orders where customer_data->>'tag' = 'anon'")) > 0, true, 'and is numbered')
  // A platform-staff account (support) creating an order is not a store member.
  await as(db, 'authenticated', U.platform)
  const staff = (await db.query('insert into orders (tenant_id, total) values ($1, 10) returning order_date', [T_NIGHT])).rows
  eq(staff.length, 1, 'a platform-staff order is numbered too (the trigger never asks who is calling)')
  await reset(db)
  eq(await scalar(db, "select public.business_day_of($1, '2026-10-20T03:00:00+08:00') = cash.business_day_of($1, '2026-10-20T03:00:00+08:00')", [T_NIGHT]), true, 'the internal helper gives the public helper\'s answer')
  await as(db, 'authenticated', U.cashier)
  await assert.rejects(db.query('select cash.business_day_of($1, now())', [T_DAY]), (e) => e.code === '42501')
  checks += 1
}

async function checkInventoryCounts(db) {
  await as(db, 'authenticated', U.cashier)
  const { rows } = await db.query("insert into inventory_counts (tenant_id, business_day, status, started_by) values ($1, '2000-01-01', 'open', $2) returning business_day::text as day", [T_NIGHT, U.cashier])
  eq(rows[0].day, await scalar(db, 'select public.business_day_of($1, now())::text', [T_NIGHT]), 'a signed-in count takes the server\'s business day, whatever the client sent')
  await as(db, 'service_role', null)
  eq((await db.query("insert into inventory_counts (tenant_id, business_day, status) values ($1, '2026-01-05', 'open') returning business_day::text as day", [T_DAY])).rows[0].day, '2026-01-05', 'a job (no JWT subject) keeps the day it sends')
}

async function checkDrawerExpense(db) {
  await reset(db)
  await db.query('select public.ensure_expense_categories($1)', [T_NIGHT])
  const category = await scalar(db, "select id from expense_categories where tenant_id = $1 and system_key = 'ice'", [T_NIGHT])
  const shift = await scalar(db, "insert into staff_shifts (tenant_id, staff_user_id, staff_name, opening_float, opened_at) values ($1, $2, 'Cara', 500, '2026-10-19T20:00:00+08:00') returning id", [T_NIGHT, U.cashier])
  const late = await scalar(db, "insert into shift_cash_movements (tenant_id, shift_id, kind, amount, reason, recorded_by, recorded_by_name, created_at) values ($1, $2, 'pay_out', 150, 'ice', $3, 'Cara', '2026-10-20T01:00:00+08:00') returning id", [T_NIGHT, shift, U.cashier])
  const day = await scalar(db, `insert into expenses (tenant_id, category_id, amount_cents, paid_from, created_by_name, shift_cash_movement_id)
      values ($1, $2, 15000, 'drawer', 'Cara', $3) returning spent_on::text`, [T_NIGHT, category, late])
  eq(day, '2026-10-19', 'a 1 AM ice run is spent on the business day of that night\'s sales')
}

async function main() {
  const db = await buildCashDb({
    through: '20261027140100_business_day_adopters.sql',
    afterBase: async (d) => {
      await d.exec(STUBS)
      await d.exec(readMigration('20260916123000_daily_order_number.sql'))
      await d.exec(readMigration('20260812120000_inventory_count_sessions.sql'))
      await d.exec(readMigration('20261022120000_expenses.sql'))
      await d.exec(readMigration('20261022120100_expenses_rpcs.sql'))
      await d.exec(readMigration('20261022130200_expenses_opt_in.sql'))
      await d.exec(PEOPLE.replace(/insert into business_day_cutoffs[^;]+;/, ''))
    },
  })
  try {
    await reset(db)
    await db.query("insert into business_day_cutoffs (tenant_id, effective_from, cutoff_minutes) values ($1, '2026-01-01', 240)", [T_NIGHT])
    await checkOrderNumbers(db)
    await checkInventoryCounts(db)
    await checkDrawerExpense(db)
    console.log(`Business-day adopters: ${checks} checks passed (order number resets at the cutoff incl. anon + platform staff, inventory count day, drawer expense day).`)
  } finally {
    await db.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
