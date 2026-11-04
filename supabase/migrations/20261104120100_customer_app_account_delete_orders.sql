-- Customer app (Phase 4): deleting the app account also removes its order index.
--
-- delete_customer_app_account (20261026160000) removes the sessions, the app
-- profile and — only when nothing else points at it — the customer record.
-- customer_app_orders (20261104120000) cascades from customers, but the
-- customer record is usually KEPT (it holds orders or stamps), so the index
-- rows survived and a number that signed in again saw its old app history.
--
-- Body copied verbatim from the LIVE function (pg_get_functiondef, 2026-11-04;
-- identical to 20261026160000) plus one statement: the customer's app-order
-- index rows go BEFORE the customer delete. The orders themselves are never
-- touched — they belong to the store (public.orders, Convex, a tenant DB).
-- Signature, SECURITY DEFINER, search_path and grants are unchanged.
-- Plan: docs/plans/2026-11-04-customer-app-p4-ordering.md §3.

create or replace function public.delete_customer_app_account(p_tenant_id uuid, p_customer_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  customer_row public.customers%rowtype;
  removed_profile int;
  removed_customer int := 0;
begin
  select * into customer_row from public.customers where id=p_customer_id and tenant_id=p_tenant_id for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  delete from public.loyalty_otp_challenges c
    where c.tenant_id=p_tenant_id and c.purpose='login' and c.verified_at is null
      and c.phone_hash in (select s.phone_hash from public.customer_app_sessions s
        where s.tenant_id=p_tenant_id and s.customer_id=p_customer_id);
  delete from public.customer_app_sessions where tenant_id=p_tenant_id and customer_id=p_customer_id;
  delete from public.customer_app_profiles where tenant_id=p_tenant_id and customer_id=p_customer_id;
  get diagnostics removed_profile = row_count;
  delete from public.customer_app_orders where tenant_id = p_tenant_id and customer_id = p_customer_id;
  if customer_row.created_source='app'
    and not exists(select 1 from public.orders where customer_id=p_customer_id)
    and not exists(select 1 from public.loyalty_balances where customer_id=p_customer_id)
    and not exists(select 1 from public.sms_sends where customer_id=p_customer_id) then
    delete from public.customers where id=p_customer_id;
    get diagnostics removed_customer = row_count;
  end if;
  return jsonb_build_object('ok',true,'removedProfile',removed_profile,'removedCustomer',removed_customer);
end;
$$;

-- Same grants as 20261026160000: service role only.
revoke all on function public.delete_customer_app_account(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_customer_app_account(uuid, uuid) to service_role;

-- Rollback: re-run the function block of 20261026160000_customer_app_auth.sql
-- (the same body without the customer_app_orders delete).
