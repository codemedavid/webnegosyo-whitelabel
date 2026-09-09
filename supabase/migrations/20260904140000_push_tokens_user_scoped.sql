-- =============================================================================
-- push_tokens: writes are per-user, reads stay per-tenant
-- =============================================================================
-- 20260727120000_platform_order_parity.sql gave push_tokens one blanket
-- policy, `push_tokens_write_admin` (FOR ALL), that let ANY admin of a tenant
-- insert, update or delete ANY row of that tenant. The merchant app writes
-- `user_id` from its own session (app/_layout.tsx), so nothing stopped one
-- staff account from re-pointing a colleague's device token, or deleting
-- every device in the store so no one is rung for new orders.
--
-- After this migration a row can be written or deleted only by the account
-- it belongs to (user_id = auth.uid()) AND only inside a tenant that account
-- is an admin of. The tenant-wide SELECT policy is untouched: the order-push
-- fan-out (/api/push/notify-order, the platform trigger in
-- 20260822130000_platform_order_push.sql) and the superadmin read every
-- device in a store by tenant, and the service role bypasses RLS anyway.
--
-- The app's registration is `upsert ... on conflict (tenant_id, token)`.
-- Because the conflict row now has to be the caller's own, a device whose
-- token was last filed under a DIFFERENT user of the same tenant is refused
-- until that row goes away; the app already deletes its own stale row on
-- account switch (platformPushCleanup), so this only bites a device that
-- changed hands without signing out. Worth it: the alternative is the
-- tenant-wide write above.
-- =============================================================================

drop policy if exists push_tokens_write_admin on public.push_tokens;

-- Membership test shared by every write policy below: the caller is an admin
-- of the row's tenant (or the platform superadmin).
create policy push_tokens_insert_own on public.push_tokens
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and (
          au.role = 'superadmin'
          or (au.role = 'admin' and au.tenant_id = push_tokens.tenant_id)
        )
    )
  );

create policy push_tokens_update_own on public.push_tokens
  for update
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and (
          au.role = 'superadmin'
          or (au.role = 'admin' and au.tenant_id = push_tokens.tenant_id)
        )
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and (
          au.role = 'superadmin'
          or (au.role = 'admin' and au.tenant_id = push_tokens.tenant_id)
        )
    )
  );

create policy push_tokens_delete_own on public.push_tokens
  for delete
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.app_users au
      where au.user_id = auth.uid()
        and (
          au.role = 'superadmin'
          or (au.role = 'admin' and au.tenant_id = push_tokens.tenant_id)
        )
    )
  );

-- push_tokens_select_by_tenant (tenant-wide read) is deliberately kept.
