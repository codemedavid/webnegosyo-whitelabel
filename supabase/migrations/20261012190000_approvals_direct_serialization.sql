-- Direct refunds are serialized; the refund check answers only a branch the
-- caller reaches; append-only ledgers cannot be truncated. Follow-up to
-- 20261012170300_approvals_hardening.sql and 20261012180200_refund_check_membership.sql.
--
-- 1. Race on cumulative limits (review 2026-10-15). create_and_execute_approval
--    quoted a direct refund (order's refunds so far + this <= cap; the person's
--    direct refunds today + this <= manager cap) WITHOUT a lock, and
--    execute_refund re-checks only money (<= net paid), not the limit. Two
--    direct asks racing on one order (a refund and a cancel_paid, which the
--    one-open index does not serialize, or two 'balance' refunds) could each
--    pass a ₱300 cap and give back ₱600. Now the requester (advisory lock) and
--    the order row (FOR UPDATE) are locked BEFORE the quote, so the second ask
--    quotes after the first committed. The register's own refund rows
--    (order_refund_insert_check) take the same per-person lock first, so the
--    daily total holds across both paths. Lock order everywhere: person, then
--    order, then (execute_refund) the request's own row — decide_approval
--    never takes a person lock, so no cycle.
-- 2. order_refund_insert_check: a signed-in caller who holds order_refund but
--    cannot see the order's branch (app_user_may_see_order — the same rule as
--    the order_payments INSERT policy) is now REFUSED with one uniform error,
--    also for an order that does not exist: no lock, no amounts, no existence
--    oracle. A silent return would be unsafe here: for an order with no branch
--    the INSERT policy checks the writer-sent outlet, so the row could land
--    with no limit check at all.
-- 3. TRUNCATE skips row triggers, so the append-only guards never see it.
--    The service role keeps SELECT/INSERT; it never updates or deletes
--    store_activity (reviews go through mark_store_activity_reviewed).
--
-- Rollback: re-run create_and_execute_approval from 20261012160000 and
-- order_refund_insert_check from 20261012180200; drop function
-- public.approval_direct_lock_key(uuid, uuid); grant truncate back if wanted.

set lock_timeout = '5s';

-- One advisory-lock key per (store, person) for direct refunds.
create or replace function public.approval_direct_lock_key(p_tenant_id uuid, p_user_id uuid)
returns bigint
language sql
immutable
parallel safe
set search_path = ''
as $$
  select hashtextextended('approval_direct:' || p_tenant_id::text || ':' || p_user_id::text, 0)
$$;

revoke all on function public.approval_direct_lock_key(uuid, uuid) from public, anon, authenticated;

create or replace function public.create_and_execute_approval(
  p_tenant_id uuid, p_user_id uuid, p_kind text, p_external_order_id text, p_payload jsonb,
  p_reason_code text, p_note text, p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
  v_id uuid;
begin
  -- Serialize money-out asks before the quote reads the cumulative limits.
  if p_kind in ('refund', 'cancel_paid') then
    perform pg_advisory_xact_lock(public.approval_direct_lock_key(p_tenant_id, p_user_id));
    perform 1 from public.orders o
     where o.id = public.store_activity_try_uuid(p_external_order_id) and o.tenant_id = p_tenant_id
     for update;
  end if;

  v_out := public.create_approval_request(p_tenant_id, p_user_id, p_kind, p_external_order_id, p_payload,
    p_reason_code, p_note, p_idempotency_key, true);
  if not coalesce((v_out ->> 'ok')::boolean, false) or coalesce((v_out ->> 'replayed')::boolean, false) then
    return v_out;
  end if;
  v_id := (v_out -> 'request' ->> 'id')::uuid;
  return public.execute_approval(v_id, p_tenant_id);
end;
$$;

revoke all on function public.create_and_execute_approval(uuid, uuid, text, text, jsonb, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_and_execute_approval(uuid, uuid, text, text, jsonb, text, text, text)
  to service_role;

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
  v_outlet uuid;
begin
  -- A signed-in caller learns nothing about an order outside their reach:
  -- one uniform refusal, taken before any lock.
  if v_actor is not null then
    select o.tenant_id, o.outlet_id into v_tenant, v_outlet from public.orders o where o.id = p_order_id;
    if v_tenant is null
       or not public.app_user_has_permission(v_tenant, 'order_refund')
       or not public.app_user_may_see_order(v_tenant, v_outlet) then
      raise exception 'This refund is not allowed on this order.' using errcode = '42501';
    end if;
    -- Same per-person lock as create_and_execute_approval, before the order lock.
    perform pg_advisory_xact_lock(public.approval_direct_lock_key(v_tenant, v_actor));
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

-- 3. Append-only ledgers: no TRUNCATE for the service role.
revoke truncate on public.order_payments, public.order_revisions from service_role;
revoke update, delete, truncate, references, trigger on public.store_activity from service_role;

reset lock_timeout;
