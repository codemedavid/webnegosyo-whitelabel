-- Rollback of 20261111090000_library_writes_need_menu.sql: back to the policies
-- of 20260720120000_addon_library.sql and 20260725120000_modifier_group_library.sql
-- (any admin of the store may write).

set lock_timeout = '3s';

drop policy if exists addon_library_insert_staff on public.addon_library;
drop policy if exists addon_library_update_staff on public.addon_library;
drop policy if exists addon_library_delete_staff on public.addon_library;

create policy "Admins can insert addon library entries for their tenant" on public.addon_library
  for insert with check (
    tenant_id in (
      select au.tenant_id from public.app_users au
      where au.user_id = auth.uid() and au.role = any (array['admin', 'superadmin'])
    )
  );
create policy "Admins can update addon library entries for their tenant" on public.addon_library
  for update using (
    tenant_id in (
      select au.tenant_id from public.app_users au
      where au.user_id = auth.uid() and au.role = any (array['admin', 'superadmin'])
    )
  );
create policy "Admins can delete addon library entries for their tenant" on public.addon_library
  for delete using (
    tenant_id in (
      select au.tenant_id from public.app_users au
      where au.user_id = auth.uid() and au.role = any (array['admin', 'superadmin'])
    )
  );

drop policy if exists modifier_group_library_insert_staff on public.modifier_group_library;
drop policy if exists modifier_group_library_update_staff on public.modifier_group_library;
drop policy if exists modifier_group_library_delete_staff on public.modifier_group_library;

create policy "Admins can insert modifier group library entries for their tenant" on public.modifier_group_library
  for insert with check (
    tenant_id in (
      select au.tenant_id from public.app_users au
      where au.user_id = auth.uid() and au.role = any (array['admin', 'superadmin'])
    )
  );
create policy "Admins can update modifier group library entries for their tenant" on public.modifier_group_library
  for update using (
    tenant_id in (
      select au.tenant_id from public.app_users au
      where au.user_id = auth.uid() and au.role = any (array['admin', 'superadmin'])
    )
  );
create policy "Admins can delete modifier group library entries for their tenant" on public.modifier_group_library
  for delete using (
    tenant_id in (
      select au.tenant_id from public.app_users au
      where au.user_id = auth.uid() and au.role = any (array['admin', 'superadmin'])
    )
  );
