-- ===========================================================================
-- Add-on library and modifier-group library: writes need the `menu` key.
--
-- Both tables were created before staff permission keys reached row-level
-- security (20261026130000 moved the menu tables over; these two were missed).
-- Their INSERT / UPDATE / DELETE policies only asked "is this an admin of the
-- store?", and every staff account is role 'admin' with a `permissions` list.
-- The server code already checks `menu` before each write
-- (addon-library-service.ts, modifier-library-service.ts, actions/addon-groups.ts),
-- so this makes the database agree with the screens.
--
-- What changes
--   * The three "Admins can insert / update / delete ..." policies on each table
--     are replaced by policies TO authenticated asking
--     app_user_has_permission(tenant_id, 'menu'): the owner, a legacy
--     full-access account (permissions IS NULL), staff holding `menu`, or a
--     superadmin. It already contains the store-membership check.
--   * UPDATE gains a WITH CHECK, so a row cannot be moved to another store.
--   * Reads ("Public can view active ..."), the superadmin FOR ALL policy, the
--     platform_staff_* policies and the service role (MCP provisioning,
--     onboarding) are untouched.
--
-- Safe to apply before or after any deploy: no client other than the web admin
-- writes these tables, and the web admin has required `menu` since they shipped.
-- Idempotent. Runner: tests/sql/run-library-writes-need-menu.cjs.
-- Rollback: supabase/rollbacks/20261111090000_library_writes_need_menu.down.sql
-- ===========================================================================

set lock_timeout = '3s';

-- addon_library ------------------------------------------------------------
drop policy if exists "Admins can insert addon library entries for their tenant" on public.addon_library;
drop policy if exists "Admins can update addon library entries for their tenant" on public.addon_library;
drop policy if exists "Admins can delete addon library entries for their tenant" on public.addon_library;

drop policy if exists addon_library_insert_staff on public.addon_library;
create policy addon_library_insert_staff on public.addon_library for insert to authenticated
  with check (public.app_user_has_permission(tenant_id, 'menu'));

drop policy if exists addon_library_update_staff on public.addon_library;
create policy addon_library_update_staff on public.addon_library for update to authenticated
  using (public.app_user_has_permission(tenant_id, 'menu'))
  with check (public.app_user_has_permission(tenant_id, 'menu'));

drop policy if exists addon_library_delete_staff on public.addon_library;
create policy addon_library_delete_staff on public.addon_library for delete to authenticated
  using (public.app_user_has_permission(tenant_id, 'menu'));

-- modifier_group_library ---------------------------------------------------
-- The original names are longer than 63 characters; Postgres truncates them on
-- the way in and on the way out, so the full spelling matches the stored name.
drop policy if exists "Admins can insert modifier group library entries for their tenant" on public.modifier_group_library;
drop policy if exists "Admins can update modifier group library entries for their tenant" on public.modifier_group_library;
drop policy if exists "Admins can delete modifier group library entries for their tenant" on public.modifier_group_library;

drop policy if exists modifier_group_library_insert_staff on public.modifier_group_library;
create policy modifier_group_library_insert_staff on public.modifier_group_library for insert to authenticated
  with check (public.app_user_has_permission(tenant_id, 'menu'));

drop policy if exists modifier_group_library_update_staff on public.modifier_group_library;
create policy modifier_group_library_update_staff on public.modifier_group_library for update to authenticated
  using (public.app_user_has_permission(tenant_id, 'menu'))
  with check (public.app_user_has_permission(tenant_id, 'menu'));

drop policy if exists modifier_group_library_delete_staff on public.modifier_group_library;
create policy modifier_group_library_delete_staff on public.modifier_group_library for delete to authenticated
  using (public.app_user_has_permission(tenant_id, 'menu'));
