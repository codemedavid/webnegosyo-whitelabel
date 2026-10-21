// Expenses (docs/plans/expenses/contract.md), pinned in an isolated
// PostgreSQL (PGlite) as the role that really runs each query.
//
// Loads the REAL migrations
//   20260823120000_staff_shifts.sql, 20260916150000_staff_shift_custody.sql,
//   20260927120000_staff_shift_server_timestamps.sql, 20261001120000_cash_drawers.sql
//                                                    the drawer + its guard/policies
//   20261013120050_staff_permission_keys.sql         app_user_has_permission
//   20261012150000_store_activity.sql                the activity table + writer
//   20261022120000_expenses.sql                      tables, triggers, RLS, seed
//   20261022120100_expenses_rpcs.sql                 the four RPCs
//   20261022120200_expenses_activity_and_bucket.sql  activity kinds + bucket
// over a stub of the live platform schema. Stub provenance — read from the
// live platform DB (SELECT only) on 2026-10-21, bodies copied verbatim:
//   app_user_may_reach_branch, app_user_belongs_to_store, stamp_client_actor,
//   app_users_select_self (policy). Tables keep only the columns these read.
//
// Every write asserts the AFFECTED ROWS or the SQLSTATE: RLS refusals are
// silent (0 rows), so "no error" is never taken as success.
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
  legacy: '00000000-0000-4000-8000-000000000002',
  book: '00000000-0000-4000-8000-000000000003',
  cashier: '00000000-0000-4000-8000-000000000004',
  cashier2: '00000000-0000-4000-8000-000000000005',
  branchBook: '00000000-0000-4000-8000-000000000006',
  menu: '00000000-0000-4000-8000-000000000007',
  kitchen: '00000000-0000-4000-8000-000000000008',
  ownerB: '00000000-0000-4000-8000-000000000009',
}

const S = {
  cash1: 'cccccccc-0000-4000-8000-000000000001',
  cash2: 'cccccccc-0000-4000-8000-000000000002',
  closed: 'cccccccc-0000-4000-8000-000000000003',
  kitchen: 'cccccccc-0000-4000-8000-000000000004',
  b: 'cccccccc-0000-4000-8000-000000000005',
}

const M = {
  old: 'dddddddd-0000-4000-8000-000000000001', // cashier, ₱150 pay-out from an older app build
  other: 'dddddddd-0000-4000-8000-000000000002', // cashier2's pay-out
  payIn: 'dddddddd-0000-4000-8000-000000000003', // cashier's pay-in
  own: 'dddddddd-0000-4000-8000-000000000004', // cashier, ₱45.25
  onClosed: 'dddddddd-0000-4000-8000-000000000005', // cashier, ₱99, shift closed since
  b: 'dddddddd-0000-4000-8000-000000000006', // store B
}

// No hours on any day = every moment is after hours, for stores that enforce them.
const ALWAYS_CLOSED = JSON.stringify(Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, { closed: true }])))

const STUB_SCHEMA = `
  create table tenants (
    id uuid primary key, operating_hours jsonb, timezone text, enforce_operating_hours boolean default false
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
  -- store_activity (20261012150000) alters these two; nothing here reads them.
  create table orders (id uuid primary key default gen_random_uuid(), tenant_id uuid);
  create table order_status_events (id uuid primary key default gen_random_uuid());
  create schema storage;
  create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );

  -- Copied from live on 2026-10-21 (pg_get_functiondef).
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

const SEED = `
  insert into tenants (id, operating_hours, enforce_operating_hours) values
    ('${T_A}', '${ALWAYS_CLOSED}', true), ('${T_B}', null, false);
  insert into outlets (id, tenant_id) values ('${OUT_A1}', '${T_A}'), ('${OUT_A2}', '${T_A}'), ('${OUT_B1}', '${T_B}');
  insert into auth.users select unnest(array[${Object.values(U).map((id) => `'${id}'::uuid`).join(',')}]);
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, outlet_id, display_name) values
    ('${U.owner}',      'admin', '${T_A}', true,  '{}',         null,        'Olivia Owner'),
    ('${U.legacy}',     'admin', '${T_A}', false, null,         null,        'Lee Legacy'),
    ('${U.book}',       'admin', '${T_A}', false, '{expenses}', null,        'Bea Books'),
    ('${U.cashier}',    'admin', '${T_A}', false, '{pos}',      '${OUT_A1}', 'Cara Cashier'),
    ('${U.cashier2}',   'admin', '${T_A}', false, '{pos}',      '${OUT_A1}', 'Cy Cashier'),
    ('${U.branchBook}', 'admin', '${T_A}', false, '{expenses}', '${OUT_A1}', 'Bran Books'),
    ('${U.menu}',       'admin', '${T_A}', false, '{menu}',     null,        'Mo Menu'),
    ('${U.kitchen}',    'admin', '${T_A}', false, '{kitchen}',  null,        'Kit Kitchen'),
    ('${U.ownerB}',     'admin', '${T_B}', true,  '{}',         null,        'Bo Owner');
  insert into staff_shifts (id, tenant_id, outlet_id, staff_user_id, staff_name, opening_float) values
    ('${S.cash1}',   '${T_A}', '${OUT_A1}', '${U.cashier}',  'Cara', 500),
    ('${S.cash2}',   '${T_A}', '${OUT_A1}', '${U.cashier2}', 'Cy',   500),
    ('${S.kitchen}', '${T_A}', null,        '${U.kitchen}',  'Kit',  0),
    ('${S.b}',       '${T_B}', null,        '${U.ownerB}',   'Bo',   0);
  -- A shift that closes after a pay-out was taken from it.
  insert into staff_shifts (id, tenant_id, outlet_id, staff_user_id, staff_name, opening_float) values
    ('${S.closed}', '${T_A}', '${OUT_A1}', '${U.legacy}', 'Lee', 0);
  insert into shift_cash_movements (id, tenant_id, shift_id, kind, amount, reason, recorded_by, recorded_by_name) values
    ('${M.old}',      '${T_A}', '${S.cash1}',  'pay_out', 150.00, 'ice',      '${U.cashier}',  'Cara'),
    ('${M.other}',    '${T_A}', '${S.cash2}',  'pay_out',  80.50, 'rider',    '${U.cashier2}', 'Cy'),
    ('${M.payIn}',    '${T_A}', '${S.cash1}',  'pay_in',  200.00, 'change',   '${U.cashier}',  'Cara'),
    ('${M.own}',      '${T_A}', '${S.cash1}',  'pay_out',  45.25, 'tape',     '${U.cashier}',  'Cara'),
    ('${M.onClosed}', '${T_A}', '${S.closed}', 'pay_out',  99.00, 'gas',      '${U.legacy}',   'Lee'),
    ('${M.b}',        '${T_B}', '${S.b}',      'pay_out',  60.00, 'yelo',     '${U.ownerB}',   'Bo');
  update staff_shifts set status = 'closed', closed_at = now(), expected_cash = 0, closing_count = 0 where id = '${S.closed}';
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
async function rows(db, sql, params) {
  return (await db.query(sql, params)).rows
}
async function affected(db, sql, params) {
  return (await db.query(sql, params)).affectedRows
}
// Fixture owner (bypasses RLS) reads.
async function admin(db, sql, params) {
  await reset(db)
  return rows(db, sql, params)
}

const cat = {}
async function loadCategories(db) {
  for (const row of await admin(db, 'select system_key, id from expense_categories where tenant_id = $1 and system_key is not null', [T_A])) {
    cat[row.system_key] = row.id
  }
  cat.bRent = await scalar(db, "select id from expense_categories where tenant_id = $1 and system_key = 'rent'", [T_B])
}

const INSERT_EXPENSE = `insert into expenses (tenant_id, outlet_id, category_id, amount_cents, paid_from, created_by_name, note, spent_on, client_request_id, created_by)
  values ($1, $2, $3, $4, $5, 'Someone', $6, coalesce($7::date, (now() at time zone 'Asia/Manila')::date), $8, $9) returning id`
function insertExpense(db, { tenant = T_A, outlet = null, category, cents = 10000, paidFrom = 'cash', note = null, spentOn = null, requestId = null, createdBy = null }) {
  return db.query(INSERT_EXPENSE, [tenant, outlet, category, cents, paidFrom, note, spentOn, requestId, createdBy])
}
const RECORD = 'select public.record_drawer_expense($1, $2, $3, $4, null, null, $5, $6) as id'
const movementCount = async (db) => Number((await admin(db, 'select count(*) from shift_cash_movements'))[0].count)

async function checkSeeding(db) {
  await asAnon(db)
  await refused(db.query('select public.ensure_expense_categories($1)', [T_A]), '42501', 'anon cannot seed categories')
  await as(db, 'authenticated', U.owner)
  await refused(db.query('select public.ensure_expense_categories($1)', [T_B]), '42501', 'owner of A cannot seed store B')
  await db.query('select public.ensure_expense_categories($1)', [T_A])
  eq(Number(await scalar(db, 'select count(*) from expense_categories where tenant_id = $1', [T_A])), 27, 'seed writes the 27 categories')
  await as(db, 'authenticated', U.menu)
  await db.query('select public.ensure_expense_categories($1)', [T_A])
  eq(Number(await scalar(db, 'select count(*) from expense_categories')), 27, 'seed is idempotent (any member may call it); members read the list')
  eq(await scalar(db, "select needs_note from expense_categories where system_key = 'other'"), true, '"Other" needs a note')
  eq(await scalar(db, "select sort_order from expense_categories where system_key = 'loan_payment'"), 260, 'sort_order = row index × 10 (0-based, like SEED_CATEGORIES)')
  await as(db, 'service_role', null)
  await db.query('select public.ensure_expense_categories($1)', [T_B])
  eq(Number(await scalar(db, 'select count(*) from expense_categories where tenant_id = $1', [T_B])), 27, 'service role seeds any store')
  await loadCategories(db)
}

async function checkAnon(db) {
  await asAnon(db)
  for (const table of ['expense_categories', 'suppliers', 'expenses', 'expense_receipts']) {
    await refused(db.query(`select count(*) from ${table}`), '42501', `anon cannot read ${table}`)
  }
  await refused(insertExpense(db, { category: cat.rent }), '42501', 'anon cannot write expenses')
  await refused(db.query(RECORD, [S.cash1, 100, cat.ice, null, 'x', null]), '42501', 'anon cannot call record_drawer_expense')
  await refused(db.query("select public.void_expense(gen_random_uuid(), 'x')"), '42501', 'anon cannot call void_expense')
}

async function checkOwner(db) {
  await as(db, 'authenticated', U.owner)
  const { rows: inserted } = await insertExpense(db, { category: cat.rent, cents: 1500000, createdBy: U.menu })
  eq(inserted.length, 1, 'owner records a store-wide expense (RETURNING passes the read policy)')
  const id = inserted[0].id
  const row = (await rows(db, 'select created_by, status, abs(extract(epoch from now() - created_at)) < 60 as fresh from expenses where id = $1', [id]))[0]
  eq(row, { created_by: U.owner, status: 'recorded', fresh: true }, 'created_by / created_at are stamped by the server')
  eq(await scalar(db, 'select created_by_name from expenses where id = $1', [id]), 'Olivia Owner', 'created_by_name comes from app_users, not the client')

  await refused(db.query("insert into expenses (tenant_id, category_id, amount_cents, paid_from, created_by_name, status, void_reason, voided_at) values ($1, $2, 100, 'cash', 'x', 'void', 'r', now())", [T_A, cat.rent]), '42501', 'a client cannot insert a void row')
  await refused(db.query('update expenses set amount_cents = 1 where id = $1', [id]), '42501', 'money is immutable')
  await refused(db.query('update expenses set category_id = $2 where id = $1', [id, cat.lpg]), '42501', 'category is immutable')
  await refused(db.query("update expenses set spent_on = spent_on - 1 where id = $1", [id]), '42501', 'date is immutable')
  await refused(db.query('update expenses set outlet_id = $2 where id = $1', [id, OUT_A1]), '42501', 'branch is immutable')
  await refused(db.query("update expenses set paid_from = 'bank' where id = $1", [id]), '42501', 'source is immutable')
  await refused(db.query("update expenses set status = 'void', void_reason = 'x', voided_at = now() where id = $1", [id]), '42501', 'void only through void_expense')
  eq(await affected(db, "update expenses set note = 'March', invoice_no = 'SI-1', doc_type = 'vat_invoice', supplier_tin = '123456789', form_2307_given = true where id = $1", [id]), 1, 'owner edits the details')
  await refused(db.query('update expenses set vat_cents = 100 where id = $1', [id]), '42501', 'VAT changes only through replace_expense')
  await refused(db.query('update expenses set ewt_cents = 100, ewt_rate = 1 where id = $1', [id]), '42501', 'EWT changes only through replace_expense')
  await refused(db.query('update expenses set is_stock_purchase = true where id = $1', [id]), '42501', 'the stock flag changes only through replace_expense')
  await refused(db.query('delete from expenses where id = $1', [id]), '42501', 'DELETE is refused')

  await refused(insertExpense(db, { category: cat.other }), '22023', 'needs_note: "Other" without a note', /note_required/)
  await refused(insertExpense(db, { category: cat.other, note: '   ' }), '22023', 'needs_note: a blank note is no note', /note_required/)
  eq((await insertExpense(db, { category: cat.other, note: 'Plumber' })).rows.length, 1, '"Other" with a note is recorded')
  const otherId = await scalar(db, "select id from expenses where note = 'Plumber'")
  await refused(db.query("update expenses set note = '' where id = $1", [otherId]), '22023', 'needs_note holds on edits too', /note_required/)

  await refused(insertExpense(db, { category: cat.bRent }), '42501', "another store's category is refused")
  await refused(insertExpense(db, { category: cat.rent, outlet: OUT_B1 }), '42501', "another store's branch is refused")
  await refused(insertExpense(db, { category: cat.rent, spentOn: '2099-01-01' }), '22023', 'a date in the future is refused', /spent_on_in_future/)
  await refused(db.query(`insert into expenses (tenant_id, category_id, amount_cents, paid_from, created_by_name, spent_on) values ($1, $2, 100, 'cash', 'x', (now() at time zone 'Asia/Manila')::date - 401)`, [T_A, cat.rent]), '22023', 'more than 400 days back is refused', /spent_on_too_old/)
  await refused(insertExpense(db, { category: cat.rent, cents: 0 }), '23514', 'amount must be positive')

  const requestId = 'eeeeeeee-0000-4000-8000-000000000001'
  eq((await insertExpense(db, { category: cat.lpg, requestId })).rows.length, 1, 'first offline attempt lands')
  await refused(insertExpense(db, { category: cat.lpg, requestId }), '23505', 'a retried client_request_id cannot double-record')

  await refused(db.query("select public.void_expense($1, '  ')", [id]), '22023', 'void needs a reason', /reason_required/)
  await db.query("select public.void_expense($1, 'Typed twice')", [id])
  const voided = (await rows(db, 'select status, void_reason, voided_by, voided_at is not null as stamped from expenses where id = $1', [id]))[0]
  eq(voided, { status: 'void', void_reason: 'Typed twice', voided_by: U.owner, stamped: true }, 'void stamps the voider and time')
  await refused(db.query("select public.void_expense($1, 'again')", [id]), 'P0002', 'a void row cannot be voided again')
  await refused(db.query("update expenses set note = 'late' where id = $1", [id]), '42501', 'a void row is frozen')
  eq(await scalar(db, "select current_setting('app.expense_void', true)"), '', 'the void mark does not outlive the call')
  return id
}

async function checkStaffWithoutKey(db) {
  await as(db, 'authenticated', U.menu)
  eq(Number(await scalar(db, 'select count(*) from expenses')), 0, 'staff without expenses see no expenses')
  await refused(insertExpense(db, { category: cat.rent }), '42501', 'staff without expenses cannot record')
  eq(await affected(db, "update expenses set note = 'x'"), 0, 'staff without expenses update nothing')
  await refused(db.query("insert into expense_categories (tenant_id, name, grp) values ($1, 'Snacks', 'operating')", [T_A]), '42501', 'staff without expenses cannot add categories')
  await refused(db.query("insert into suppliers (tenant_id, name) values ($1, 'Aling Nena')", [T_A]), '42501', 'staff without expenses cannot add suppliers')

  await as(db, 'authenticated', U.legacy)
  eq(Number(await scalar(db, 'select count(*) from expenses')) > 0, true, 'legacy full access (permissions NULL) holds expenses')
}

async function checkBookkeeper(db) {
  await as(db, 'authenticated', U.book)
  eq(Number(await scalar(db, 'select count(*) from expenses where outlet_id is null')) > 0, true, 'expenses holder reads the store-wide book')
  const { rows: sup } = await db.query("insert into suppliers (tenant_id, name, kind, tin, default_category_id, created_by) values ($1, ' Petron ', 'supplier', '123456789000', $2, $3) returning id, name, created_by", [T_A, cat.lpg, U.owner])
  eq(sup.map(({ name, created_by }) => ({ name, created_by })), [{ name: 'Petron', created_by: U.book }], 'supplier name trimmed, creator stamped')
  await refused(db.query("insert into suppliers (tenant_id, name, tin) values ($1, 'Bad TIN', '12-34')", [T_A]), '23514', 'TIN format is checked')
  await refused(db.query("insert into suppliers (tenant_id, name, default_category_id) values ($1, 'X', $2)", [T_A, cat.bRent]), '42501', "a supplier's default category is from its own store")
  eq(await affected(db, 'update suppliers set created_by = $2 where id = $1', [sup[0].id, U.owner]), 1, 'supplier update passes the policy')
  eq(await scalar(db, 'select created_by from suppliers where id = $1', [sup[0].id]), U.book, 'but who added it never changes')

  eq((await rows(db, "insert into expense_categories (tenant_id, name, grp, icon) values ($1, 'Snacks', 'operating', 'SN') returning id", [T_A])).length, 1, 'expenses holder adds a category')
  await refused(db.query("insert into expense_categories (tenant_id, name, grp) values ($1, 'snacks ', 'operating')", [T_A]), '23505', 'two live categories cannot share a name')
  await refused(db.query("insert into expense_categories (tenant_id, name, grp, system_key) values ($1, 'Fake', 'other', 'fake')", [T_A]), '42501', 'a client cannot write a system_key')
  eq(await affected(db, "update expense_categories set name = 'Yelo', icon = 'YE' where id = $1", [cat.ice]), 1, 'seed categories can be renamed')
  await refused(db.query("update expense_categories set system_key = 'other_ice' where id = $1", [cat.ice]), '42501', 'system_key never changes')
  eq(await affected(db, 'update expense_categories set archived_at = now() where id = $1', [cat.thirteenth_month]), 1, 'categories are archived')
  await refused(db.query('delete from expense_categories where id = $1', [cat.thirteenth_month]), '42501', 'categories are never deleted')
  await refused(db.query("update expense_categories set grp = 'operating' where id = $1", [cat.ice]), '42501', 'a starter category keeps its group')
  await refused(db.query('update expense_categories set needs_note = true where id = $1', [cat.ice]), '42501', 'a starter category keeps its note rule')
  const snacks = await scalar(db, "select id from expense_categories where name = 'Snacks'")
  await refused(db.query("update expense_categories set grp = 'nope' where id = $1", [snacks]), '23514', 'grp is a closed list')
  eq(await affected(db, "update expense_categories set grp = 'staff', needs_note = true where id = $1", [snacks]), 1, 'an unused custom category can change group and note rule')
  eq((await insertExpense(db, { category: snacks, note: 'merienda' })).rows.length, 1, 'an expense lands in it')
  await refused(db.query("update expense_categories set grp = 'operating' where id = $1", [snacks]), '42501', 'once used, its group cannot change (history)')
  eq(await affected(db, "update expense_categories set name = 'Merienda', needs_note = false where id = $1", [snacks]), 1, 'but it can still be renamed')

  // Branch rows for the branch-locked checks below.
  eq((await insertExpense(db, { category: cat.water, outlet: OUT_A1 })).rows.length, 1, 'book records at branch 1')
  eq((await insertExpense(db, { category: cat.water, outlet: OUT_A2 })).rows.length, 1, 'book records at branch 2')

  await as(db, 'authenticated', U.ownerB)
  eq(Number(await scalar(db, 'select count(*) from expenses where tenant_id = $1', [T_A])), 0, "another store's owner sees none of A's book")
  eq(Number(await scalar(db, 'select count(*) from expense_categories where tenant_id = $1', [T_A])), 0, "nor A's categories")
}

async function checkBranchLocked(db) {
  await as(db, 'authenticated', U.branchBook)
  eq((await insertExpense(db, { category: cat.electricity, outlet: OUT_A1 })).rows.length, 1, 'branch admin records at its branch')
  await refused(insertExpense(db, { category: cat.electricity, outlet: OUT_A2 }), '42501', 'branch admin cannot record at another branch')
  await refused(insertExpense(db, { category: cat.electricity, outlet: null }), '42501', 'branch admin cannot record store-wide')
  const outlets = (await rows(db, 'select distinct outlet_id from expenses')).map((row) => row.outlet_id)
  eq(outlets, [OUT_A1], 'branch admin reads only its branch (not the other, not store-wide)')
  await refused(db.query("insert into expense_categories (tenant_id, name, grp) values ($1, 'Branch only', 'other')", [T_A]), '42501', 'categories need a store-wide account')
  const storeWide = (await admin(db, 'select id from expenses where outlet_id is null and status = $1 limit 1', ['recorded']))[0].id
  await as(db, 'authenticated', U.branchBook)
  await refused(db.query("select public.void_expense($1, 'not mine')", [storeWide]), 'P0002', 'branch admin cannot void a store-wide row (invisible)')
  eq(await affected(db, "update expenses set note = 'x' where outlet_id is null"), 0, 'branch admin edits nothing store-wide')
}

async function checkCashier(db) {
  const before = await movementCount(db)
  await as(db, 'authenticated', U.cashier)
  eq(Number(await scalar(db, 'select count(*) from expense_categories where system_key is not null')), 27, 'a cashier reads the categories (drawer sheet)')
  const requestId = 'eeeeeeee-0000-4000-8000-000000000002'
  const id = await scalar(db, RECORD, [S.cash1, 125000, cat.lpg, null, 'Somebody Else', requestId])
  eq(typeof id, 'string', 'record_drawer_expense returns the expense id')
  const movement = (await admin(db, `select m.kind, m.amount, m.reason, m.recorded_by, m.recorded_by_name, m.outlet_id
    from expenses e join shift_cash_movements m on m.id = e.shift_cash_movement_id where e.id = $1`, [id]))[0]
  eq(movement, { kind: 'pay_out', amount: '1250.00', reason: 'Gas / LPG', recorded_by: U.cashier, recorded_by_name: 'Cara Cashier', outlet_id: OUT_A1 }, 'the pay_out row is written in pesos with the category as reason, named from app_users (the sent name is ignored)')
  const expense = (await admin(db, `select outlet_id, paid_from, amount_cents, created_by, created_by_name, status,
    spent_on = (now() at time zone 'Asia/Manila')::date as today from expenses where id = $1`, [id]))[0]
  eq(expense, { outlet_id: OUT_A1, paid_from: 'drawer', amount_cents: 125000, created_by: U.cashier, created_by_name: 'Cara Cashier', status: 'recorded', today: true }, 'the expense takes branch and Manila date from the movement')
  eq(await movementCount(db), before + 1, 'one movement per drawer expense')

  await as(db, 'authenticated', U.cashier)
  eq(await scalar(db, RECORD, [S.cash1, 125000, cat.lpg, null, 'Cara', requestId]), id, 'a retried client_request_id returns the same expense')
  eq(await movementCount(db), before + 1, 'and takes no more cash out of the drawer')

  await as(db, 'authenticated', U.cashier)
  eq((await rows(db, 'select id from expenses')).map((row) => row.id), [id], 'a cashier sees only the drawer expenses they recorded')
  await refused(db.query(RECORD, [S.closed, 1000, cat.lpg, null, 'Cara', null]), 'P0001', 'a closed shift is refused (drawer guard)', /already closed/)
  await refused(db.query(RECORD, [S.cash2, 1000, cat.lpg, null, 'Cara', null]), '42501', "a cashier cannot pay from someone else's drawer")
  await refused(db.query(RECORD, [S.cash1, 1000, cat.other, '  ', 'Cara', null]), '22023', 'needs_note on the drawer path', /note_required/)
  await refused(db.query(RECORD, [S.cash1, 1000, cat.bRent, null, 'Cara', null]), '42501', "another store's category on the drawer path")
  eq(await movementCount(db), before + 1, 'refused drawer expenses leave no pay-out behind')

  await as(db, 'authenticated', U.cashier)
  const direct = (movementId, cents, category = cat.ice) => db.query(
    "insert into expenses (tenant_id, category_id, amount_cents, paid_from, shift_cash_movement_id, created_by_name) values ($1, $2, $3, 'drawer', $4, 'Cara') returning id",
    [T_A, category, cents, movementId])
  await refused(db.query("insert into expenses (tenant_id, category_id, amount_cents, paid_from, created_by_name) values ($1, $2, 100, 'drawer', 'Cara')", [T_A, cat.ice]), '22023', 'a drawer row needs a real movement', /drawer_movement_required/)
  await refused(direct(M.other, 8050), '42501', "a cashier cannot link someone else's pay-out")
  await refused(direct(M.own, 4500), '22023', 'the amount must match the pay-out', /drawer_amount_mismatch/)
  await refused(direct(M.payIn, 20000), '22023', 'only a pay_out can be an expense', /not_a_pay_out/)
  await refused(direct(M.b, 6000), '42501', "another store's pay-out is refused")
  eq((await direct(M.own, 4525)).rows.length, 1, 'the recorder may file their own pay-out')
  await refused(direct(M.own, 4525), '23505', 'a pay-out cannot be linked twice')
  await refused(insertExpense(db, { category: cat.ice, outlet: OUT_A1 }), '42501', 'a cashier cannot record a non-drawer expense')
  await refused(db.query("update expenses set note = 'x' where id = $1", [id]), '42501', 'a cashier cannot edit their drawer expense (the own-drawer policy only admits a void)')
  await refused(db.query("select public.replace_expense($1, 'oops', $2)", [id, JSON.stringify({ category_id: cat.ice })]), '42501', 'a cashier cannot re-file (Fix needs expenses)')
  await refused(db.query('select public.sort_drawer_payout($1, $2, null, null, null, $3)', [M.old, cat.ice, 'Cara']), '42501', 'a cashier cannot sort pay-outs (needs expenses)')

  // A former member keeps no window into the book (L2).
  await reset(db)
  await db.query('update app_users set tenant_id = $2 where user_id = $1', [U.cashier, T_B])
  await as(db, 'authenticated', U.cashier)
  eq(Number(await scalar(db, 'select count(*) from expenses')), 0, 'a cashier moved out of the store no longer sees their old drawer expenses')
  await reset(db)
  await db.query('update app_users set tenant_id = $2 where user_id = $1', [U.cashier, T_A])

  const kitchenBefore = await movementCount(db)
  await as(db, 'authenticated', U.kitchen)
  await refused(db.query(RECORD, [S.kitchen, 1000, cat.lpg, null, 'Kit', null]), '42501', 'paying from a drawer needs pos (or expenses)')
  eq(await movementCount(db), kitchenBefore, 'and the refused pay-out is rolled back with it')
  return id
}

async function checkSorting(db) {
  await as(db, 'authenticated', U.book)
  const id = await scalar(db, 'select public.sort_drawer_payout($1, $2, null, null, null, $3)', [M.old, cat.ice, 'Bea'])
  const row = (await admin(db, 'select amount_cents, outlet_id, paid_from, created_by from expenses where id = $1', [id]))[0]
  eq(row, { amount_cents: 15000, outlet_id: OUT_A1, paid_from: 'drawer', created_by: U.book }, 'sort_drawer_payout files the old pay-out')
  await as(db, 'authenticated', U.book)
  await refused(db.query('select public.sort_drawer_payout($1, $2, null, null, null, $3)', [M.old, cat.ice, 'Bea']), '23505', 'an already-sorted pay-out cannot be sorted twice')
  eq(typeof await scalar(db, 'select public.sort_drawer_payout($1, $2, null, null, null, $3)', [M.onClosed, cat.lpg, 'Bea']), 'string', 'sorting works on a closed shift')
  await refused(db.query('select public.sort_drawer_payout($1, $2, null, null, null, $3)', [M.b, cat.lpg, 'Bea']), 'P0002', "another store's pay-out is not found")
  await refused(db.query('select public.sort_drawer_payout($1, $2, null, null, null, $3)', [M.payIn, cat.lpg, 'Bea']), '22023', 'a pay-in is not an expense', /not_a_pay_out/)

  await refused(db.query('select public.sort_drawer_payout($1, $2, null, null, null, $3)', [M.other, cat.other, 'Bea']), '22023', 'needs_note when sorting', /note_required/)

  await as(db, 'authenticated', U.branchBook)
  eq(typeof await scalar(db, 'select public.sort_drawer_payout($1, $2, null, null, null, $3)', [M.other, cat.delivery_fees, 'Bran']), 'string', 'a branch book-keeper sorts a pay-out of their branch')
}

async function checkReplace(db, drawerExpenseId) {
  await as(db, 'authenticated', U.owner)
  await refused(db.query("select public.replace_expense($1, 'fix', $2)", [drawerExpenseId, JSON.stringify({ amount_cents: 1 })]), '22023', 'a drawer row refuses an amount change', /drawer_locked/)
  await refused(db.query("select public.replace_expense($1, 'fix', $2)", [drawerExpenseId, JSON.stringify({ spent_on: '2026-01-01' })]), '22023', 'a drawer row refuses a date change', /drawer_locked/)
  await refused(db.query("select public.replace_expense($1, 'fix', $2)", [drawerExpenseId, JSON.stringify({ paid_from: 'cash' })]), '22023', 'a drawer row refuses a source change', /drawer_locked/)
  await refused(db.query("select public.replace_expense($1, 'fix', $2)", [drawerExpenseId, JSON.stringify({ created_by: U.menu })]), '22023', 'unknown patch keys are refused', /unknown_patch_key/)
  const newId = await scalar(db, "select public.replace_expense($1, 'wrong category', $2)", [drawerExpenseId, JSON.stringify({ category_id: cat.owner_draw, note: 'Owner took it' })])
  const pair = await admin(db, `select id, status, category_id, amount_cents, shift_cash_movement_id, replaces_expense_id, voided_by, void_reason, created_by, created_by_name
    from expenses where id in ($1, $2) order by status`, [drawerExpenseId, newId])
  eq(pair.map((row) => row.status), ['recorded', 'void'], 'the old row is void, the copy recorded')
  eq(pair[0].category_id, cat.owner_draw, 'the copy has the new category')
  eq(pair[0].amount_cents, 125000, 'and the same amount')
  eq(pair[0].shift_cash_movement_id, pair[1].shift_cash_movement_id, 'and keeps the drawer link')
  eq(pair[0].replaces_expense_id, drawerExpenseId, 'and points at what it replaces')
  eq([pair[0].created_by, pair[0].created_by_name], [U.owner, 'Olivia Owner'], 'the replacement is recorded by whoever fixed it')
  eq([pair[1].voided_by, pair[1].void_reason], [U.owner, 'wrong category'], 'the old row names the voider and the reason')

  await as(db, 'authenticated', U.owner)
  const cashId = (await insertExpense(db, { category: cat.marketing, cents: 50000 })).rows[0].id
  await refused(db.query("select public.replace_expense($1, 'fix', $2)", [cashId, JSON.stringify({ paid_from: 'drawer' })]), '22023', 'a non-drawer row cannot become a drawer row', /drawer_locked/)
  const replacing = (target) => db.query("insert into expenses (tenant_id, category_id, amount_cents, paid_from, created_by_name, replaces_expense_id) values ($1, $2, 100, 'cash', 'x', $3)", [T_A, cat.marketing, target])
  await refused(replacing(cashId), '42501', 'a direct insert cannot claim to replace a recorded row')
  const fixed = await scalar(db, "select public.replace_expense($1, 'typo', $2)", [cashId, JSON.stringify({ amount_cents: 55000, paid_from: 'gcash' })])
  eq((await rows(db, 'select amount_cents, paid_from from expenses where id = $1', [fixed]))[0], { amount_cents: 55000, paid_from: 'gcash' }, 'a non-drawer row is re-recorded with a new amount and source')
  await refused(replacing(cashId), '23505', 'a voided row has at most one replacement')
  await refused(db.query("select public.replace_expense($1, '', '{}')", [fixed]), '22023', 'replace needs a void reason', /reason_required/)
  eq(await scalar(db, 'select status from expenses where id = $1', [fixed]), 'recorded', 'a refused replace leaves the row recorded')
  await as(db, 'authenticated', U.menu)
  await refused(db.query("select public.replace_expense($1, 'x', '{}')", [fixed]), 'P0002', 'staff without expenses cannot replace (row not visible)')
  return newId
}

async function checkDrawerVoid(db) {
  const record = async (uid, shift, cents, requestId) => {
    await as(db, 'authenticated', uid)
    return scalar(db, RECORD, [shift, cents, cat.ice, null, 'Cashier', requestId])
  }
  const movementOf = async (expenseId) => (await admin(db, 'select shift_cash_movement_id as id from expenses where id = $1', [expenseId]))[0].id
  const corrections = (shift) => admin(db, "select amount, reason, recorded_by, recorded_by_name from shift_cash_movements where shift_id = $1 and kind = 'pay_in' and reason like 'Correction:%' order by created_at", [shift])

  // Undo after save: the cashier (pos only) voids what they just recorded.
  const undone = await record(U.cashier, S.cash1, 3000, 'eeeeeeee-0000-4000-8000-000000000101')
  await as(db, 'authenticated', U.cashier)
  await db.query("select public.void_expense($1, 'Wrong amount')", [undone])
  eq((await admin(db, 'select status, voided_by from expenses where id = $1', [undone]))[0], { status: 'void', voided_by: U.cashier }, 'a pos-only cashier voids their own drawer expense on their open shift')
  eq(await corrections(S.cash1), [{ amount: '30.00', reason: 'Correction: Wrong amount', recorded_by: U.cashier, recorded_by_name: 'Cara Cashier' }], 'the cash goes back in with a pay_in, named after the caller')
  const net = (await admin(db, `select sum(case kind when 'pay_in' then amount else -amount end) as net from shift_cash_movements
    where id = $1 or (shift_id = $2 and reason = 'Correction: Wrong amount')`, [await movementOf(undone), S.cash1]))[0].net
  eq(net, '0.00', "the pay-out and its correction net to zero in the drawer's expected cash")

  // A pay-out whose expense was voided is not unsorted: it cannot be filed again.
  await as(db, 'authenticated', U.book)
  await refused(db.query('select public.sort_drawer_payout($1, $2, null, null, null, $3)', [await movementOf(undone), cat.ice, 'Bea']), '23505', 'a voided drawer expense\'s pay-out cannot be sorted again', /drawer_payout_already_sorted/)
  await as(db, 'authenticated', U.cashier)
  await refused(db.query("insert into expenses (tenant_id, category_id, amount_cents, paid_from, shift_cash_movement_id, created_by_name) values ($1, $2, 3000, 'drawer', $3, 'Cara')", [T_A, cat.ice, await movementOf(undone)]), '23505', 'nor linked again directly', /drawer_payout_already_sorted/)

  // The owner (a cash manager) voids a cashier's drawer expense; actor name given.
  const byOwner = await record(U.cashier, S.cash1, 4000, 'eeeeeeee-0000-4000-8000-000000000102')
  await as(db, 'authenticated', U.owner)
  await db.query("select public.void_expense($1, 'Not ours', 'Someone Else')", [byOwner])
  eq((await corrections(S.cash1)).at(-1), { amount: '40.00', reason: 'Correction: Not ours', recorded_by: U.owner, recorded_by_name: 'Olivia Owner' }, 'expenses + branch reach voids any drawer expense; the pay_in is named from app_users (p_actor_name ignored for clients)')

  // expenses without cash management cannot put cash into someone else's drawer.
  const notBooks = await record(U.cashier, S.cash1, 5000, 'eeeeeeee-0000-4000-8000-000000000103')
  const before = (await corrections(S.cash1)).length
  await as(db, 'authenticated', U.book)
  await refused(db.query("select public.void_expense($1, 'x')", [notBooks]), '42501', "expenses alone cannot write into another person's open drawer (drawer policy)")
  eq([(await admin(db, 'select status from expenses where id = $1', [notBooks]))[0].status, (await corrections(S.cash1)).length], ['recorded', before], 'and nothing changed')

  // A cashier cannot void what is not their own drawer expense.
  const cy = await record(U.cashier2, S.cash2, 2500, 'eeeeeeee-0000-4000-8000-000000000104')
  await as(db, 'authenticated', U.cashier)
  await refused(db.query("select public.void_expense($1, 'x')", [cy]), 'P0002', "a cashier cannot void a colleague's drawer expense")
  const storeWide = (await admin(db, "select id from expenses where paid_from <> 'drawer' and status = 'recorded' limit 1"))[0].id
  await as(db, 'authenticated', U.cashier)
  await refused(db.query("select public.void_expense($1, 'x')", [storeWide]), 'P0002', 'a cashier cannot void a non-drawer expense')

  // Once the shift is closed: refused for everyone; Fix still works.
  await reset(db)
  await db.query("update staff_shifts set status = 'closed', closed_at = now(), expected_cash = 0, closing_count = 0 where id = $1", [S.cash2])
  await as(db, 'authenticated', U.cashier2)
  await refused(db.query("select public.void_expense($1, 'late')", [cy]), '22023', 'a drawer expense on a closed shift cannot be voided (cashier)', /drawer_shift_closed/)
  await as(db, 'authenticated', U.owner)
  await refused(db.query("select public.void_expense($1, 'late')", [cy]), '22023', 'nor by the owner', /drawer_shift_closed/)
  const refiled = await scalar(db, "select public.replace_expense($1, 'wrong category', $2)", [cy, JSON.stringify({ category_id: cat.delivery_fees })])
  eq((await admin(db, 'select category_id, status, shift_cash_movement_id = $2 as same_link from expenses where id = $1', [refiled, await movementOf(cy)]))[0], { category_id: cat.delivery_fees, status: 'recorded', same_link: true }, 'Fix re-files a closed-shift drawer expense on the same pay-out')
  eq((await corrections(S.cash2)).length, 0, 'and Fix never touches the drawer')
}

async function checkReceipts(db, ownerExpenseId, drawerExpenseId, voidedId) {
  const pathFor = (expenseId, file = 'ffffffff-0000-4000-8000-000000000001.jpg') => `${T_A}/${expenseId}/${file}`
  await as(db, 'authenticated', U.owner)
  await refused(db.query('insert into expense_receipts (tenant_id, expense_id, object_path, mime, bytes) values ($1, $2, $3, $4, 10)', [T_A, ownerExpenseId, pathFor(ownerExpenseId), 'image/jpeg']), '42501', 'clients never write receipt rows')

  await as(db, 'service_role', null)
  eq(await affected(db, 'insert into expense_receipts (tenant_id, expense_id, object_path, mime, bytes) values ($1, $2, $3, $4, 1000)', [T_A, ownerExpenseId, pathFor(ownerExpenseId), 'image/jpeg']), 1, 'the service role writes a receipt row')
  eq(await affected(db, 'insert into expense_receipts (tenant_id, expense_id, object_path, mime, bytes) values ($1, $2, $3, $4, 1000)', [T_A, drawerExpenseId, pathFor(drawerExpenseId, 'ffffffff-0000-4000-8000-000000000002.pdf'), 'application/pdf']), 1, 'a receipt on a drawer expense')
  eq(await scalar(db, 'select outlet_id from expense_receipts where expense_id = $1', [drawerExpenseId]), OUT_A1, 'the branch is copied from the expense')
  await refused(db.query('insert into expense_receipts (tenant_id, expense_id, object_path, mime, bytes) values ($1, $2, $3, $4, 10)', [T_A, ownerExpenseId, `${T_B}/${ownerExpenseId}/ffffffff-0000-4000-8000-000000000003.jpg`, 'image/jpeg']), '23514', 'the object path is <tenant>/<expense>/<uuid>.<ext>')
  await refused(db.query('insert into expense_receipts (tenant_id, expense_id, object_path, mime, bytes) values ($1, $2, $3, $4, 10)', [T_A, ownerExpenseId, pathFor(ownerExpenseId, 'ffffffff-0000-4000-8000-000000000004.gif'), 'image/gif']), '23514', 'only jpeg/png/webp/pdf')
  await refused(db.query('insert into expense_receipts (tenant_id, expense_id, object_path, mime, bytes) values ($1, $2, $3, $4, 5242881)', [T_A, ownerExpenseId, pathFor(ownerExpenseId, 'ffffffff-0000-4000-8000-000000000005.png'), 'image/png']), '23514', 'at most 5 MB')

  await as(db, 'authenticated', U.owner)
  eq(Number(await scalar(db, 'select count(*) from expense_receipts')), 2, 'the owner sees both receipts')
  await as(db, 'authenticated', U.cashier)
  eq((await rows(db, 'select expense_id from expense_receipts')).map((row) => row.expense_id), [drawerExpenseId], "a cashier sees only the receipt of their own drawer expense")
  await as(db, 'authenticated', U.menu)
  eq(Number(await scalar(db, 'select count(*) from expense_receipts')), 0, 'staff without expenses see no receipts')
  await as(db, 'authenticated', U.branchBook)
  eq((await rows(db, 'select expense_id from expense_receipts')).map((row) => row.expense_id), [drawerExpenseId], 'a branch admin sees only its branch receipts')
  await as(db, 'authenticated', U.owner)
  await refused(db.query('delete from expense_receipts'), '42501', 'clients cannot delete receipt rows')

  await as(db, 'service_role', null)
  const addReceipt = (expenseId, n) => db.query('insert into expense_receipts (tenant_id, expense_id, object_path, mime, bytes) values ($1, $2, $3, $4, 10)',
    [T_A, expenseId, `${T_A}/${expenseId}/ffffffff-0000-4000-8000-${String(n).padStart(12, '0')}.jpg`, 'image/jpeg'])
  await refused(addReceipt(voidedId, 900), '22023', 'no receipt on a void expense', /expense_void/)
  for (let n = 100; n < 109; n += 1) await addReceipt(ownerExpenseId, n)
  eq(Number(await scalar(db, 'select count(*) from expense_receipts where expense_id = $1', [ownerExpenseId])), 10, 'ten receipts fit')
  await refused(addReceipt(ownerExpenseId, 109), '22023', 'the eleventh is refused', /too_many_receipts/)
}

async function checkActivity(db, ownerVoidedId) {
  const activity = await admin(db, "select kind, count(*)::int as n from store_activity where tenant_id = $1 and category = 'expenses' group by kind order by kind", [T_A])
  const book = await admin(db, "select count(*)::int as recorded, count(*) filter (where status = 'void')::int as voided from expenses where tenant_id = $1", [T_A])
  eq(activity, [{ kind: 'expense.recorded', n: book[0].recorded }, { kind: 'expense.voided', n: book[0].voided }], 'one activity row per recorded expense and per void')

  const lpg = (await admin(db, `select a.summary ->> 'title' as title, a.amount, a.subject_type, a.actor_user_id, a.outlet_id, a.flags
    from store_activity a join expenses e on a.subject_ref = e.id::text
    where a.kind = 'expense.recorded' and e.paid_from = 'drawer' and e.amount_cents = 125000 and e.replaces_expense_id is null`))[0]
  eq(lpg, { title: 'Recorded an expense: Gas / LPG ₱1,250', amount: '-1250.00', subject_type: 'expense', actor_user_id: U.cashier, outlet_id: OUT_A1, flags: [] }, 'expense.recorded row: title, signed amount, actor, branch, no flag')

  const voided = (await admin(db, `select summary ->> 'title' as title, amount, reason, actor_user_id, flags from store_activity where kind = 'expense.voided' and subject_ref = $1`, [ownerVoidedId]))[0]
  eq(voided, { title: 'Voided an expense: Rent (Upa) ₱15,000 (Typed twice)', amount: '15000.00', reason: 'Typed twice', actor_user_id: U.owner, flags: ['after_hours'] }, 'expense.voided row is sensitive: after_hours in a store that enforces its hours')

  eq(Number((await admin(db, "select count(*) from store_activity where tenant_id = $1 and category = 'expenses' and 'after_hours' = any (flags) and kind = 'expense.recorded'", [T_A]))[0].count), 0, 'recording is not sensitive')
}

async function checkBucketAndTenantDeletion(db) {
  const bucket = (await admin(db, "select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'expense-receipts'"))[0]
  eq(bucket, { public: false, file_size_limit: 5242880, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] }, 'the receipts bucket is private, 5 MB, four types')

  // A store with a drawer expense, a replacement and a receipt can still be deleted.
  await as(db, 'authenticated', U.ownerB)
  const drawerId = await scalar(db, 'select public.sort_drawer_payout($1, $2, null, null, null, $3)', [M.b, cat.bRent, 'Bo'])
  const replacement = await scalar(db, "select public.replace_expense($1, 'wrong', $2)", [drawerId, JSON.stringify({ note: 'ice' })])
  await as(db, 'service_role', null)
  await db.query('insert into expense_receipts (tenant_id, expense_id, object_path, mime, bytes) values ($1, $2, $3, $4, 10)', [T_B, replacement, `${T_B}/${replacement}/ffffffff-0000-4000-8000-000000000009.webp`, 'image/webp'])
  await reset(db)
  eq(await affected(db, 'delete from tenants where id = $1', [T_B]), 1, 'deleting a store cascades through its expenses (NO ACTION, not RESTRICT)')
  eq(Number(await scalar(db, 'select count(*) from expenses where tenant_id = $1', [T_B])), 0, 'and nothing of it is left')
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
    ]) {
      await db.exec(readMigration(file))
    }
    // Some flag helpers in it are SQL functions over tables this stub omits.
    await db.exec('set check_function_bodies = off')
    await db.exec(readMigration('20261012150000_store_activity.sql'))
    await db.exec('set check_function_bodies = on')
    await db.exec(SEED)
    for (const file of [
      '20261022120000_expenses.sql',
      '20261022120100_expenses_rpcs.sql',
      '20261022120200_expenses_activity_and_bucket.sql',
      '20261022120210_expenses_activity_validate.sql',
    ]) {
      await db.exec(readMigration(file))
    }

    await checkSeeding(db)
    await checkAnon(db)
    const ownerVoidedId = await checkOwner(db)
    await checkStaffWithoutKey(db)
    await checkBookkeeper(db)
    await checkBranchLocked(db)
    const drawerExpenseId = await checkCashier(db)
    await checkSorting(db)
    const ownerExpenseId = (await admin(db, "select id from expenses where note = 'Plumber'"))[0].id
    await checkReceipts(db, ownerExpenseId, drawerExpenseId, ownerVoidedId)
    await checkReplace(db, drawerExpenseId)
    await checkDrawerVoid(db)
    await checkActivity(db, ownerVoidedId)
    await checkBucketAndTenantDeletion(db)
    console.log(`Expenses: ${checks} checks passed (seed, anon, owner, staff without key, book-keeper, branch lock, cashier drawer path, sorting, replace, drawer void, receipts, activity, bucket, store deletion).`)
  } finally {
    await db.close()
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
