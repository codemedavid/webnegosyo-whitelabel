-- Refund check answers only the order's own store — follow-up to 20261012170000.
--
-- order_refund_insert_check must stay EXECUTE-able by `authenticated` (the
-- invoker trigger order_payments_refund_guard runs it AS the inserting staff
-- member). Called directly over /rest/v1/rpc it was an oracle: for ANY order
-- id its refusal told how much was left to refund (and it took the order's
-- row lock). Now a signed-in caller who may not refund at that order's store
-- gets nothing back — no lock, no answer; their INSERT is refused by RLS
-- (order_payments_insert_admin) anyway. The server (auth.uid() IS NULL:
-- service role, execute_refund) is unchanged.
--
-- Rollback: re-run order_refund_insert_check from 20261012170000.

create or replace function public.order_refund_insert_check(p_order_id uuid, p_amount numeric, p_is_client boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_rows integer;
  v_charged numeric;
  v_refunded numeric;
  v_actor uuid := auth.uid();
  v_tenant uuid;
begin
  -- A signed-in caller learns nothing about another store's order.
  if v_actor is not null then
    select o.tenant_id into v_tenant from public.orders o where o.id = p_order_id;
    if v_tenant is null or not public.app_user_has_permission(v_tenant, 'order_refund') then
      return; -- RLS refuses the row itself
    end if;
  end if;

  select o.id, o.tenant_id, o.total, o.payment_status, o.created_at
    into v_order
    from public.orders o where o.id = p_order_id
    for update;
  if not found then
    return; -- the foreign key refuses the row
  end if;

  select count(*),
         coalesce(sum(p.amount) filter (where p.kind = 'charge'), 0),
         coalesce(sum(p.amount) filter (where p.kind = 'refund'), 0)
    into v_rows, v_charged, v_refunded
    from public.order_payments p where p.order_id = p_order_id;
  -- Same implicit-ledger rule as approval_order_ledger: paid by status, no rows.
  if v_rows = 0 and coalesce(v_order.payment_status, '') in ('paid', 'verified') then
    v_charged := v_order.total;
  end if;

  if v_refunded + p_amount > v_charged then
    raise exception 'This refund is more than was paid on this order.' using errcode = '23514';
  end if;

  -- A signed-in caller is always held to the client limits, whatever p_is_client says.
  if not coalesce(p_is_client, false) and v_actor is null then
    return; -- the server (execute_refund, service role) has done its own checks
  end if;

  if v_actor is null or not public.approval_refund_within_own_limit(
    v_order.tenant_id, v_actor, 'refund', p_amount, v_order.created_at, v_refunded
  ) then
    raise exception 'This refund needs approval. Ask a manager to approve it.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.order_refund_insert_check(uuid, numeric, boolean) from public, anon;
grant execute on function public.order_refund_insert_check(uuid, numeric, boolean) to authenticated, service_role;
