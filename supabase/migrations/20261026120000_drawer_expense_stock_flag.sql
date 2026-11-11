-- ============================================================================
-- record_drawer_expense keeps "Did this go into your stock count?"
-- ============================================================================
-- "Take from a cashier's drawer" (2026-10-26) lets the owner's + Expense pay
-- from any open drawer, so ingredient buys now leave drawers far more often.
-- The sheet asked the stock question on the drawer path too, but the RPC had
-- no place for the answer: every drawer ingredient buy was saved
-- is_stock_purchase = false, so Profit counted it as an expense AND as the
-- cost of the stock it became (ingredients must be counted once, plan §2.2).
--
-- One new trailing argument with a default. Older app builds keep calling
-- with the original eight named arguments and get `false`, exactly as before.
-- The old signature is dropped so a named call resolves to one function.
-- The body is the live one (pg_get_functiondef, 2026-10-26) plus the flag.
-- ============================================================================

drop function if exists public.record_drawer_expense(uuid, bigint, uuid, text, uuid, text, text, uuid);

create function public.record_drawer_expense(
  p_shift_id uuid,
  p_amount_cents bigint,
  p_category_id uuid,
  p_note text,
  p_supplier_id uuid,
  p_paid_to_name text,
  p_recorded_by_name text,
  p_client_request_id uuid,
  p_is_stock_purchase boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_existing uuid;
  v_category_name text;
  v_movement uuid;
  v_expense uuid;
  -- Signed-in callers are named from app_users; only the service role's
  -- p_recorded_by_name is used as sent.
  v_name text := case when current_user in ('anon', 'authenticated')
    then coalesce(public.expense_actor_name(), 'Staff')
    else btrim(coalesce(p_recorded_by_name, '')) end;
begin
  select s.tenant_id into v_tenant from public.staff_shifts s where s.id = p_shift_id;
  if not found then
    raise exception 'shift_not_found' using errcode = 'P0002';
  end if;

  -- An offline retry: the first attempt already landed.
  if p_client_request_id is not null then
    select e.id into v_existing
      from public.expenses e
     where e.tenant_id = v_tenant and e.client_request_id = p_client_request_id;
    if found then
      return v_existing;
    end if;
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 1000000000 then
    raise exception 'amount_out_of_range' using errcode = '22023';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'recorded_by_name_required' using errcode = '22023';
  end if;
  v_category_name := public.expense_category_for(v_tenant, p_category_id, p_note);

  -- The drawer's own rules apply unchanged: open shift, own drawer or a cash
  -- manager, branch copied, actor and clock stamped.
  insert into public.shift_cash_movements (tenant_id, shift_id, kind, amount, reason, recorded_by_name)
  values (
    v_tenant, p_shift_id, 'pay_out', p_amount_cents::numeric / 100,
    left(coalesce(nullif(btrim(p_note), ''), v_category_name), 200),
    v_name
  )
  returning id into v_movement;

  insert into public.expenses (
    tenant_id, category_id, supplier_id, paid_to_name, note, amount_cents,
    paid_from, shift_cash_movement_id, client_request_id, created_by_name,
    is_stock_purchase
  ) values (
    v_tenant, p_category_id, p_supplier_id, p_paid_to_name, p_note, p_amount_cents,
    'drawer', v_movement, p_client_request_id, v_name,
    coalesce(p_is_stock_purchase, false)
  )
  returning id into v_expense;

  return v_expense;
end;
$$;

revoke all on function public.record_drawer_expense(uuid, bigint, uuid, text, uuid, text, text, uuid, boolean) from public, anon;
grant execute on function public.record_drawer_expense(uuid, bigint, uuid, text, uuid, text, text, uuid, boolean) to authenticated, service_role;

-- Rollback:
-- (re-run the record_drawer_expense block of 20261022120100_expenses_rpcs.sql
--  after: drop function if exists public.record_drawer_expense(uuid, bigint, uuid, text, uuid, text, text, uuid, boolean);)
