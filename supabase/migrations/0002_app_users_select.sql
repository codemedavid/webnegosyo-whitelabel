-- Allow authenticated users to read their own app_users role row
drop policy if exists app_users_select_self on public.app_users;
create policy app_users_select_self on public.app_users
  for select
  using (user_id = auth.uid());


