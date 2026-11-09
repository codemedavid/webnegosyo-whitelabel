// product_costs SELECT needs the `costs` key (20261107140000), pinned in PGlite.
// Policies and helper bodies are the live ones (read 2026-11-07, SELECT only).
// Asserts rows seen per role (RLS answers empty, never an error) before and after.
//
//   node tests/sql/run-product-costs-need-costs.cjs             must pass
//   node tests/sql/run-product-costs-need-costs.cjs --baseline  old policy only; the checks must FAIL there
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')

const MIGRATION = '20261107140000_product_costs_need_costs.sql'
const IS_BASELINE = process.argv.includes('--baseline')

const T_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_B = 'bbbbbbbb-0000-4000-8000-000000000001'
const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  legacy: '00000000-0000-4000-8000-000000000002',
  costs: '00000000-0000-4000-8000-000000000003',
  pos: '00000000-0000-4000-8000-000000000004',
  analyticsOnly: '00000000-0000-4000-8000-000000000005',
  menu: '00000000-0000-4000-8000-000000000006',
  superadmin: '00000000-0000-4000-8000-000000000007',
  otherOwner: '00000000-0000-4000-8000-000000000008',
  platformStaff: '00000000-0000-4000-8000-000000000009',
}
const ROW_A = 'cccccccc-0000-4000-8000-00000000000a'
const ROW_B = 'cccccccc-0000-4000-8000-00000000000b'

const SCHEMA = `
  create table tenants (id uuid primary key);
  create table app_users (user_id uuid primary key, tenant_id uuid, role text, is_owner boolean,
    permissions text[], outlet_id uuid, platform_permissions text[]);
  create table product_costs (id uuid primary key, tenant_id uuid, menu_item_id uuid, cost_price numeric, cost_notes text);

  CREATE OR REPLACE FUNCTION public.app_user_has_permission(p_tenant_id uuid, p_permission text)
   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
  AS $function$
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
  $function$;
  -- Stand-in for the live platform-staff predicate (same shape: reads platform_permissions).
  create function public.app_user_platform_can(p text[]) returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.platform_permissions && p)
  $$;

  alter table product_costs enable row level security;
  create policy product_costs_select_by_tenant on product_costs for select using (
    EXISTS ( SELECT 1 FROM app_users au WHERE ((au.user_id = auth.uid()) AND ((au.role = 'superadmin'::text) OR ((au.role = 'admin'::text) AND (au.tenant_id = product_costs.tenant_id))))));
  create policy platform_staff_select on product_costs for select to authenticated
    using (( SELECT app_user_platform_can(ARRAY['stores.view'::text, 'tenants.view'::text, 'overview.view'::text])));
  create policy product_costs_insert_staff on product_costs for insert to authenticated with check (app_user_has_permission(tenant_id, 'costs'));
  create policy product_costs_update_staff on product_costs for update to authenticated using (app_user_has_permission(tenant_id, 'costs')) with check (app_user_has_permission(tenant_id, 'costs'));
  create policy product_costs_delete_staff on product_costs for delete to authenticated using (app_user_has_permission(tenant_id, 'costs'));
  grant select, insert, update, delete on product_costs to anon, authenticated;
`

const SEED = `
  insert into tenants values ('${T_A}'), ('${T_B}');
  insert into auth.users select unnest(array[${Object.values(U).map((u) => `'${u}'::uuid`).join(',')}]);
  insert into app_users (user_id, role, tenant_id, is_owner, permissions, platform_permissions) values
    ('${U.owner}', 'admin', '${T_A}', true, '{}', null),
    ('${U.legacy}', 'admin', '${T_A}', false, null, null),
    ('${U.costs}', 'admin', '${T_A}', false, '{costs}', null),
    ('${U.pos}', 'admin', '${T_A}', false, '{pos,menu}', null),
    ('${U.analyticsOnly}', 'admin', '${T_A}', false, '{analytics}', null),
    ('${U.menu}', 'admin', '${T_A}', false, '{menu,inventory}', null),
    ('${U.superadmin}', 'superadmin', null, false, null, null),
    ('${U.otherOwner}', 'admin', '${T_B}', true, '{}', null),
    ('${U.platformStaff}', 'admin', null, false, null, '{stores.view}');
  insert into product_costs values
    ('${ROW_A}', '${T_A}', gen_random_uuid(), 42.5, 'a'),
    ('${ROW_B}', '${T_B}', gen_random_uuid(), 77, 'b');
`

// who -> rows [A, B] they can read (after the migration)
const EXPECT = {
  owner: [1, 0], legacy: [1, 0], costs: [1, 0],
  pos: [0, 0], analyticsOnly: [0, 0], menu: [0, 0],
  superadmin: [1, 1], otherOwner: [0, 1], platformStaff: [1, 1],
}

let failures = 0
const check = (label, actual, expected) => {
  try { assert.deepEqual(actual, expected); console.log(`ok   ${label}`) }
  catch { failures++; console.log(`FAIL ${label}: got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`) }
}

async function visible(db, uid, tenant) {
  await as(db, 'authenticated', U[uid])
  const { rows } = await db.query('select cost_price from product_costs where tenant_id = $1', [tenant])
  await reset(db)
  return rows.length
}

async function main() {
  const db = new PGlite()
  await installPlatformAuth(db)
  await db.exec(SCHEMA)
  await db.exec(SEED)
  if (!IS_BASELINE) await db.exec(readMigration(MIGRATION))

  const expected = EXPECT
  for (const who of Object.keys(U)) {
    const got = [await visible(db, who, T_A), await visible(db, who, T_B)]
    check(`${who} reads [A,B] cost rows`, got, expected[who])
  }

  await asAnon(db)
  const anon = await db.query('select * from product_costs').catch((e) => ({ rows: [], err: e.message }))
  await reset(db)
  check('anon reads nothing', anon.rows.length, 0)

  // A reader without the key gets an empty answer, not an error (installed apps keep working).
  await as(db, 'authenticated', U.pos)
  const empty = await db.query('select menu_item_id, cost_price from product_costs where tenant_id = $1 order by menu_item_id', [T_A])
  await reset(db)
  check('pos list query does not throw and is empty', empty.rows.length, 0)

  // The editor's upsert-with-RETURNING still works for `costs` and is refused for pos.
  await as(db, 'authenticated', U.costs)
  const up = await db.query(
    `update product_costs set cost_price = 50 where id = '${ROW_A}' returning id`)
  await reset(db)
  check('costs account can update and read back', up.rows.length, 1)
  await as(db, 'authenticated', U.pos)
  const upPos = await db.query(`update product_costs set cost_price = 1 where id = '${ROW_A}' returning id`)
  await reset(db)
  check('pos account update touches no row', upPos.rows.length, 0)

  if (IS_BASELINE) {
    // The old policy must fail the new expectations, so each check bites.
    if (failures === 0) { console.error('baseline passed: the checks do not bite'); process.exit(1) }
    console.log(`baseline: ${failures} check(s) fail on the old policy, as they should`)
    return
  }
  if (failures > 0) { console.error(`${failures} check(s) failed`); process.exit(1) }
  console.log('all checks passed')
}
main().catch((e) => { console.error(e); process.exit(1) })
