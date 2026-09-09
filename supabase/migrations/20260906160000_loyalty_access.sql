-- Program mutations run through the authenticated management API. Direct
-- PostgREST access must not bypass its permission and immutable-version checks.
create or replace function public.loyalty_has_permission(p_tenant_id uuid, p_permission text)
returns boolean language sql stable security invoker set search_path = public
as $$
  select exists (
    select 1 from public.app_users au where au.user_id = auth.uid()
      and (au.role = 'superadmin' or (
        au.role = 'admin' and au.tenant_id = p_tenant_id
        and (au.is_owner is true or au.permissions is null or p_permission = any(au.permissions))
      ))
  );
$$;
revoke all on function public.loyalty_has_permission(uuid, text) from public, anon;
grant execute on function public.loyalty_has_permission(uuid, text) to authenticated, service_role;

drop policy if exists loyalty_programs_tenant_access on public.loyalty_programs;
drop policy if exists loyalty_programs_tenant_select on public.loyalty_programs;
create policy loyalty_programs_tenant_select on public.loyalty_programs for select to authenticated
  using (public.loyalty_has_permission(tenant_id, 'loyalty_manage')
    or public.loyalty_has_permission(tenant_id, 'customers'));

drop policy if exists loyalty_program_versions_tenant_insert on public.loyalty_program_versions;
drop policy if exists loyalty_program_versions_tenant_select on public.loyalty_program_versions;
create policy loyalty_program_versions_tenant_select on public.loyalty_program_versions for select to authenticated
  using (public.loyalty_has_permission(tenant_id, 'loyalty_manage')
    or public.loyalty_has_permission(tenant_id, 'customers'));

drop policy if exists loyalty_balances_tenant_select on public.loyalty_balances;
create policy loyalty_balances_tenant_select on public.loyalty_balances for select to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers')
    or public.loyalty_has_permission(tenant_id, 'loyalty_manage'));

drop policy if exists loyalty_ledger_tenant_select on public.loyalty_ledger;
create policy loyalty_ledger_tenant_select on public.loyalty_ledger for select to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers')
    or public.loyalty_has_permission(tenant_id, 'loyalty_manage'));

drop policy if exists loyalty_entitlements_tenant_select on public.loyalty_entitlements;
create policy loyalty_entitlements_tenant_select on public.loyalty_entitlements for select to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers')
    or public.loyalty_has_permission(tenant_id, 'loyalty_manage'));

-- Holds and tokens are accessed only by server operations, like OTP/outbox.
drop policy if exists loyalty_reservations_tenant_select on public.loyalty_reservations;
