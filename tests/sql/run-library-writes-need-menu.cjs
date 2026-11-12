// Add-on library and modifier-group library writes need `menu`
// (20261111090000), pinned in PGlite as the role that really runs each query.
// Builds both tables with the policies their own migrations created, proves a
// staff account without `menu` could write, runs the REAL migration, then the
// REAL rollback. Asserts affected rows per role and per verb:
//   - staff without `menu` (a cashier): 1 row before, refused / 0 rows after;
//   - staff with `menu`, a legacy full-access account, the owner, a superadmin:
//     still write, own store only; another store's menu staff: nothing;
//   - an UPDATE cannot move a row to another store;
//   - anon still reads active rows and writes nothing; the service role writes.
const { PGlite } = require('@electric-sql/pglite')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { REPO_ROOT, installPlatformAuth, as, asAnon, reset, readMigration } = require('./lib/platform-auth.cjs')

const T = 'aaaaaaaa-0000-4000-8000-000000000001'
const T_OTHER = 'bbbbbbbb-0000-4000-8000-000000000001'
const U = {
  cashier: '00000000-0000-4000-8000-000000000001',
  menu: '00000000-0000-4000-8000-000000000002',
  legacy: '00000000-0000-4000-8000-000000000003',
  owner: '00000000-0000-4000-8000-000000000004',
  otherMenu: '00000000-0000-4000-8000-000000000005',
  superadmin: '00000000-0000-4000-8000-000000000006',
}
const TABLES = ['addon_library', 'modifier_group_library']

// app_user_has_permission: body copied verbatim from the live function
// (20261027120100_cash_manage_permission.sql). The table policies are the ones
// 20260720120000_addon_library.sql and 20260725120000_modifier_group_library.sql
// created.
const oldPolicies = (table, label) => `
  create policy "Public can view active ${label} entries" on public.${table}
    for select using (is_active = true);
  create policy "Admins can insert ${label} entries for their tenant" on public.${table}
    for insert with check (tenant_id in (
      select au.tenant_id from public.app_users au
      where au.user_id = auth.uid() and au.role = any (array['admin', 'superadmin'])));
  create policy "Admins can update ${label} entries for their tenant" on public.${table}
    for update using (tenant_id in (
      select au.tenant_id from public.app_users au
      where au.user_id = auth.uid() and au.role = any (array['admin', 'superadmin'])));
  create policy "Admins can delete ${label} entries for their tenant" on public.${table}
    for delete using (tenant_id in (
      select au.tenant_id from public.app_users au
      where au.user_id = auth.uid() and au.role = any (array['admin', 'superadmin'])));
  create policy "Superadmins can manage all ${label} entries" on public.${table}
    for all using (exists (
      select 1 from public.app_users au where au.user_id = auth.uid() and au.role = 'superadmin'));
`

const STUB = `
  create table public.tenants (id uuid primary key, name text);
  create table public.app_users (
    user_id uuid not null, tenant_id uuid, role text not null,
    is_owner boolean default false, outlet_id uuid, permissions text[]
  );
  create table public.addon_library (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    name text not null, is_active boolean not null default true
  );
  create table public.modifier_group_library (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    name text not null, is_active boolean not null default true
  );
  alter table public.addon_library enable row level security;
  alter table public.modifier_group_library enable row level security;
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
               -- IMPLIED_BY in src/lib/staff-permissions.ts: strict subsets of a held grant.
               or (p_permission in ('kitchen', 'tables') and 'orders' = any (au.permissions))
               or (p_permission = 'reports' and 'analytics' = any (au.permissions))
             )
           )
         )
    );
  $$;
  ${oldPolicies('addon_library', 'addon library')}
  ${oldPolicies('modifier_group_library', 'modifier group library')}
`

const SEED = `
  insert into public.tenants values ('${T}', 'Store'), ('${T_OTHER}', 'Other');
  insert into public.app_users (user_id, tenant_id, role, is_owner, permissions) values
    ('${U.cashier}', '${T}', 'admin', false, array['pos', 'orders']),
    ('${U.menu}', '${T}', 'admin', false, array['menu']),
    ('${U.legacy}', '${T}', 'admin', false, null),
    ('${U.owner}', '${T}', 'admin', true, array[]::text[]),
    ('${U.otherMenu}', '${T_OTHER}', 'admin', false, array['menu']),
    ('${U.superadmin}', null, 'superadmin', false, null);
`

async function main() {
  const db = new PGlite()
  let checks = 0
  const check = (actual, expected, message) => {
    assert.equal(actual, expected, message)
    checks += 1
  }
  try {
    await installPlatformAuth(db)
    await db.exec(STUB)
    await db.exec(SEED)

    // One row per table that every probe below tries to change.
    const seedRow = async (table) => {
      const { rows } = await db.query(
        `insert into public.${table} (tenant_id, name) values ($1, 'Extra cheese') returning id`, [T])
      return rows[0].id
    }

    // Affected rows for one verb as one account; a refused INSERT (42501) is 0.
    async function attempt(table, verb, uid, rowId, role = 'authenticated') {
      await as(db, role, uid)
      try {
        if (verb === 'insert') {
          const { rows } = await db.query(
            `insert into public.${table} (tenant_id, name) values ($1, 'New') returning id`, [T])
          return rows.length
        }
        if (verb === 'update') {
          const { rows } = await db.query(
            `update public.${table} set name = 'Edited' where id = $1 returning id`, [rowId])
          return rows.length
        }
        if (verb === 'move') {
          const { rows } = await db.query(
            `update public.${table} set tenant_id = $2 where id = $1 returning id`, [rowId, T_OTHER])
          return rows.length
        }
        const { rows } = await db.query(`delete from public.${table} where id = $1 returning id`, [rowId])
        return rows.length
      } catch (error) {
        if (error.code === '42501') return 0
        throw error
      } finally {
        await reset(db)
      }
    }

    for (const table of TABLES) {
      const rowId = await seedRow(table)
      check(await attempt(table, 'insert', U.cashier, rowId), 1, `${table} baseline: staff without menu could insert`)
      check(await attempt(table, 'update', U.cashier, rowId), 1, `${table} baseline: staff without menu could update`)
    }

    await db.exec(readMigration('20261111090000_library_writes_need_menu.sql'))
    // Idempotent: a second run changes nothing and does not fail.
    await db.exec(readMigration('20261111090000_library_writes_need_menu.sql'))

    for (const table of TABLES) {
      const rowId = await seedRow(table)

      for (const verb of ['insert', 'update', 'delete']) {
        check(await attempt(table, verb, U.cashier, rowId), 0, `${table}: staff without menu cannot ${verb}`)
        check(await attempt(table, verb, U.otherMenu, rowId), 0, `${table}: another store's menu staff cannot ${verb}`)
        check(await attempt(table, verb, null, rowId, 'anon'), 0, `${table}: anon cannot ${verb}`)
      }

      for (const [who, uid] of [['menu staff', U.menu], ['legacy full access', U.legacy], ['owner', U.owner], ['superadmin', U.superadmin]]) {
        check(await attempt(table, 'insert', uid, rowId), 1, `${table}: ${who} can insert`)
        check(await attempt(table, 'update', uid, rowId), 1, `${table}: ${who} can update`)
      }

      check(await attempt(table, 'move', U.menu, rowId), 0, `${table}: menu staff cannot move a row to another store`)

      await asAnon(db)
      const visible = await db.query(`select id from public.${table} where id = $1`, [rowId])
      await reset(db)
      check(visible.rows.length, 1, `${table}: anon still reads active rows`)

      check(await attempt(table, 'update', null, rowId, 'service_role'), 1, `${table}: the service role still writes`)
      check(await attempt(table, 'delete', U.menu, rowId), 1, `${table}: menu staff can delete`)
    }

    await db.exec(readFileSync(
      path.join(REPO_ROOT, 'supabase/rollbacks/20261111090000_library_writes_need_menu.down.sql'),
      'utf8',
    ))
    for (const table of TABLES) {
      const rowId = await seedRow(table)
      check(await attempt(table, 'update', U.cashier, rowId), 1, `${table}: the rollback restores the old policy`)
    }

    console.log(`library writes need menu: ${checks} checks passed`)
  } finally {
    await db.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
