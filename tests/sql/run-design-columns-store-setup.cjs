// Design columns need `store_setup` (20261109120000), pinned in PGlite as the
// role that really runs each query.
//
// Loads the REAL Welcome Builder + Page Designer column migrations and the REAL
// guard migration over a stub of tenants + app_users carrying the live tenants
// UPDATE policies (tenants_update_staff, tenants_write_superadmin,
// platform_staff_update) and the permission helpers copied verbatim from their
// latest migrations (app_user_has_permission 20261027120100,
// app_user_holds_any_permission 20261013120200, app_user_platform_can
// 20260929180000). Asserts, per design column and per role:
//   - owner, legacy full-access staff, staff with store_setup (store-wide or
//     branch-locked), superadmin, platform staff with stores.edit and the
//     service role may change them (1 row);
//   - staff with only analytics / settings are refused (42501) on EVERY column,
//     and the row is untouched;
//   - another store's owner and anon reach no row (0), and the guard itself
//     refuses anon even where a policy would let it through;
//   - analytics/settings staff still save unrelated columns, also while
//     re-sending the design columns unchanged.
const { PGlite } = require('@electric-sql/pglite')
const assert = require('node:assert/strict')
const { installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')

const MIGRATION = '20261109120000_design_columns_need_store_setup.sql'
const T = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_OTHER = 'bbbbbbbb-0000-4000-8000-000000000001'
const OUTLET = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const U = {
  owner: '00000000-0000-4000-8000-000000000001',
  setupStaff: '00000000-0000-4000-8000-000000000002',
  branchSetupStaff: '00000000-0000-4000-8000-000000000003',
  legacyStaff: '00000000-0000-4000-8000-000000000004',
  analyticsStaff: '00000000-0000-4000-8000-000000000005',
  settingsStaff: '00000000-0000-4000-8000-000000000006',
  otherOwner: '00000000-0000-4000-8000-000000000007',
  superadmin: '00000000-0000-4000-8000-000000000008',
  platformEditor: '00000000-0000-4000-8000-000000000009',
  platformViewer: '00000000-0000-4000-8000-00000000000a',
}

// A value that differs from the column's current one, per column.
const DESIGN_CHANGES = {
  checkout_design: `coalesce(checkout_design, '') || ' '`,
  checkout_design_enabled: 'not checkout_design_enabled',
  confirmation_design: `coalesce(confirmation_design, '') || ' '`,
  confirmation_design_enabled: 'not confirmation_design_enabled',
  tracking_design: `coalesce(tracking_design, '') || ' '`,
  tracking_design_enabled: 'not tracking_design_enabled',
  confirmation_redirect: `case confirmation_redirect when 'stay' then 'instant' else 'stay' end`,
  confirmation_redirect_seconds: 'case confirmation_redirect_seconds when 9 then 10 else 9 end',
  hero_design: `coalesce(hero_design, '') || ' '`,
  hero_preset: `case hero_preset when 'custom' then 'theme' else 'custom' end`,
  hero_section_enabled: 'not hero_section_enabled',
  welcome_design: `coalesce(welcome_design, '') || ' '`,
  welcome_design_enabled: 'not welcome_design_enabled',
}
const DESIGN_COLUMNS = Object.keys(DESIGN_CHANGES)

const STUB = `
  create table public.tenants (
    id uuid primary key, name text, is_active boolean not null default true,
    header_color text,
    hero_preset text default 'theme',
    hero_design text,
    hero_section_enabled boolean not null default true
  );
  create table public.app_users (
    user_id uuid not null, tenant_id uuid, role text not null,
    is_owner boolean default false, outlet_id uuid, permissions text[],
    platform_permissions text[]
  );

  -- app_user_has_permission: verbatim from 20261027120100_cash_manage_permission.sql
  create or replace function public.app_user_has_permission(p_tenant_id uuid, p_permission text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
  as $$
    select exists (
      select 1
        from public.app_users au
       where au.user_id = auth.uid()
         and (
           au.role = 'superadmin'
           or (
             au.role = 'admin'
             and au.tenant_id = p_tenant_id
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
  revoke all on function public.app_user_has_permission(uuid, text) from public, anon;
  grant execute on function public.app_user_has_permission(uuid, text) to authenticated, service_role;

  -- app_user_holds_any_permission: verbatim from 20261013120200_order_reads_need_permission.sql
  create or replace function public.app_user_holds_any_permission(p_tenant_id uuid, p_keys text[])
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
  as $$
    select exists (
      select 1
        from unnest(p_keys) as key
       where public.app_user_has_permission(p_tenant_id, key)
    );
  $$;
  revoke all on function public.app_user_holds_any_permission(uuid, text[]) from public;
  grant execute on function public.app_user_holds_any_permission(uuid, text[]) to anon, authenticated, service_role;

  -- app_user_platform_can: verbatim from 20260929180000_platform_staff.sql
  create or replace function public.app_user_platform_can(p_permissions text[])
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
  as $$
    select exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and au.role = 'platform_staff'
        and au.platform_permissions && p_permissions
    );
  $$;
  revoke all on function public.app_user_platform_can(text[]) from public, anon;
  grant execute on function public.app_user_platform_can(text[]) to authenticated;

  -- tenants policies (0001_initial, 20261026130000, 20260929180000).
  alter table public.tenants enable row level security;
  create policy tenants_read_active on public.tenants for select using (is_active = true);
  create policy tenants_write_superadmin on public.tenants
    for all
    using (exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin'))
    with check (exists (select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin'));
  create policy tenants_update_staff on public.tenants for update to authenticated
    using (public.app_user_holds_any_permission(id, array['store_setup', 'settings', 'analytics']))
    with check (public.app_user_holds_any_permission(id, array['store_setup', 'settings', 'analytics']));
  create policy platform_staff_update on public.tenants
    for update to authenticated
    using ((select public.app_user_platform_can(array['stores.edit'])))
    with check ((select public.app_user_platform_can(array['stores.edit'])));

  -- app_users_select_self (0002): the helpers are definers, but keep it live-shaped.
  alter table public.app_users enable row level security;
  create policy app_users_select_self on public.app_users for select using (user_id = auth.uid());
`

const SEED = `
  insert into public.tenants (id, name) values ('${T}', 'Lolys'), ('${T_OTHER}', 'Other');
  insert into public.app_users (user_id, tenant_id, role, is_owner, outlet_id, permissions, platform_permissions) values
    ('${U.owner}', '${T}', 'admin', true, null, null, null),
    ('${U.setupStaff}', '${T}', 'admin', false, null, array['store_setup'], null),
    ('${U.branchSetupStaff}', '${T}', 'admin', false, '${OUTLET}', array['store_setup'], null),
    ('${U.legacyStaff}', '${T}', 'admin', false, null, null, null),
    ('${U.analyticsStaff}', '${T}', 'admin', false, null, array['analytics', 'reports', 'menu'], null),
    ('${U.settingsStaff}', '${T}', 'admin', false, null, array['settings', 'orders'], null),
    ('${U.otherOwner}', '${T_OTHER}', 'admin', true, null, null, null),
    ('${U.superadmin}', null, 'superadmin', false, null, null, null),
    ('${U.platformEditor}', null, 'platform_staff', false, null, null, array['stores.edit', 'stores.view']),
    ('${U.platformViewer}', null, 'platform_staff', false, null, null, array['stores.view']);
`

let checks = 0
function eq(actual, expected, message) {
  checks += 1
  assert.deepEqual(actual, expected, message)
}

async function snapshot(db, tenant = T) {
  await reset(db)
  const { rows } = await db.query(`select to_jsonb(t) as row from public.tenants t where id = $1`, [tenant])
  return rows[0].row
}

/** Run a statement as `role`/`uid`; answers rows affected, or the SQLSTATE it raised. */
async function tryUpdate(db, role, uid, sql, params = [T]) {
  if (role === 'anon') await asAnon(db)
  else await as(db, role, uid)
  try {
    const result = await db.query(sql, params)
    return result.affectedRows ?? 0
  } catch (error) {
    return error.code ?? String(error.message)
  } finally {
    await reset(db)
  }
}

const changeSql = (column) => `update public.tenants set ${column} = ${DESIGN_CHANGES[column]} where id = $1`

async function expectAllowed(db, label, role, uid) {
  for (const column of DESIGN_COLUMNS) {
    const before = await snapshot(db)
    eq(await tryUpdate(db, role, uid, changeSql(column)), 1, `${label} changes ${column}`)
    const after = await snapshot(db)
    assert.notDeepEqual(after[column], before[column], `${label}: ${column} really changed`)
  }
}

async function expectRefused(db, label, role, uid, expected) {
  const before = await snapshot(db)
  for (const column of DESIGN_COLUMNS) {
    eq(await tryUpdate(db, role, uid, changeSql(column)), expected, `${label} cannot change ${column}`)
  }
  eq(await snapshot(db), before, `${label}: the row is untouched`)
}

async function main() {
  const db = new PGlite()
  await installPlatformAuth(db)
  await db.exec(STUB)
  await db.exec(readMigration('20261007130000_welcome_builder_design.sql'))
  await db.exec(readMigration('20261104120000_page_designer.sql'))
  await db.exec(SEED)
  await db.exec(readMigration(MIGRATION))
  // Applied by hand, maybe twice: re-running is harmless.
  await db.exec(readMigration(MIGRATION))

  // The function is not callable by API roles, yet the trigger still fires for them.
  await reset(db)
  const { rows: grants } = await db.query(`
    select r as role, has_function_privilege(r, 'public.guard_tenant_design_columns()', 'execute') as can
      from unnest(array['anon', 'authenticated']) as r`)
  eq(grants, [{ role: 'anon', can: false }, { role: 'authenticated', can: false }], 'API roles cannot execute the guard')

  // Refused: staff whose keys open the row but not store setup.
  await expectRefused(db, 'analytics-only staff', 'authenticated', U.analyticsStaff, '42501')
  await expectRefused(db, 'settings-only staff', 'authenticated', U.settingsStaff, '42501')
  // Refused by RLS before the guard: no row reached.
  await expectRefused(db, "another store's owner", 'authenticated', U.otherOwner, 0)
  await expectRefused(db, 'platform staff with stores.view only', 'authenticated', U.platformViewer, 0)
  await expectRefused(db, 'anon', 'anon', null, 0)

  // Allowed.
  await expectAllowed(db, 'owner', 'authenticated', U.owner)
  await expectAllowed(db, 'staff with store_setup', 'authenticated', U.setupStaff)
  await expectAllowed(db, 'branch-locked staff with store_setup', 'authenticated', U.branchSetupStaff)
  await expectAllowed(db, 'legacy full-access staff (permissions null)', 'authenticated', U.legacyStaff)
  await expectAllowed(db, 'superadmin', 'authenticated', U.superadmin)
  await expectAllowed(db, 'platform staff with stores.edit', 'authenticated', U.platformEditor)
  await expectAllowed(db, 'service role', 'service_role', null)

  // The real Hero Builder publish payload, as the action sends it.
  eq(
    await tryUpdate(db, 'authenticated', U.analyticsStaff,
      `update public.tenants set hero_design = '{"version":5}', hero_preset = 'custom', hero_section_enabled = true where id = $1 returning id`),
    '42501', 'analytics staff cannot publish a hero')
  eq(
    await tryUpdate(db, 'authenticated', U.setupStaff,
      `update public.tenants set hero_design = '{"version":5}', hero_preset = 'custom', hero_section_enabled = true where id = $1 returning id`),
    1, 'store_setup staff publish a hero')

  // Unrelated saves keep working for analytics / settings staff.
  for (const [label, uid] of [['analytics-only staff', U.analyticsStaff], ['settings-only staff', U.settingsStaff]]) {
    eq(
      await tryUpdate(db, 'authenticated', uid, `update public.tenants set header_color = $2 where id = $1`, [T, `#${label.length}0000`]),
      1, `${label} saves an unrelated column`)
    const before = await snapshot(db)
    const resend = DESIGN_COLUMNS.map((column) => `${column} = ${column}`).join(', ')
    eq(
      await tryUpdate(db, 'authenticated', uid, `update public.tenants set name = 'Lolys ${uid.slice(-1)}', ${resend} where id = $1`),
      1, `${label} re-sends every design column unchanged with another change`)
    const after = await snapshot(db)
    for (const column of DESIGN_COLUMNS) eq(after[column], before[column], `${label}: ${column} unchanged`)
  }

  // Defence in depth: the guard refuses anon even if a policy ever let anon in.
  await reset(db)
  await db.exec(`create policy test_anon_update on public.tenants for update to anon using (true) with check (true)`)
  eq(await tryUpdate(db, 'anon', null, changeSql('welcome_design_enabled')), '42501', 'the guard itself refuses anon')
  eq(await tryUpdate(db, 'anon', null, `update public.tenants set name = 'anon' where id = $1`), 1, 'anon past RLS may still change an unrelated column (guard is column-scoped)')
  await reset(db)
  await db.exec('drop policy test_anon_update on public.tenants')

  console.log(`design columns need store_setup: ${checks} checks passed`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
