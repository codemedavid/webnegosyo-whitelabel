-- Expenses — the four writers that do more than one row (contract §5)
--
--   record_drawer_expense  cashier pays an expense from their open drawer:
--                          the shift_cash_movements pay_out AND the expense,
--                          one transaction.
--   sort_drawer_payout     an `expenses` holder files an existing pay-out
--                          (older app builds) as an expense. Inserts only.
--   void_expense           recorded -> void, with a reason. A drawer row on
--                          an OPEN shift puts the cash back (pay_in); on a
--                          closed shift it is refused (use replace_expense).
--   replace_expense        void + a corrected copy (replaces_expense_id); the
--                          drawer is not touched (the copy keeps the link).
--   Only these two set the mark expenses_guard requires for recorded -> void.
--
-- All SECURITY INVOKER with search_path '': every policy and guard trigger
-- of 20261022120000 and of shift_cash_movements (20261001120000) applies to
-- the caller exactly as for a direct write. These functions add no power;
-- they only bundle writes so they commit together.
--
-- Errors (SQLSTATE, message):
--   22023 note_required | reason_required | recorded_by_name_required |
--         amount_out_of_range | drawer_locked | unknown_patch_key |
--         drawer_amount_mismatch | not_a_pay_out | drawer_shift_closed
--   42501 another store's category, no `expenses`, no branch reach
--   P0002 shift_not_found | movement_not_found | expense_not_found
--   23505 drawer_payout_already_sorted (a pay-out is filed once, ever)
--   plus the existing drawer guard ("This shift is already closed").
--
-- Rollback at end.

-- ============================================
-- Shared: the category a drawer expense is filed under
-- ============================================
-- Read under the caller's RLS (store members read their store's
-- categories), so another store's id is simply not found → 42501.
create or replace function public.expense_category_for(p_tenant_id uuid, p_category_id uuid, p_note text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  c record;
begin
  select ec.tenant_id, ec.name, ec.needs_note into c
    from public.expense_categories ec where ec.id = p_category_id;
  if not found or c.tenant_id <> p_tenant_id then
    raise exception 'Category belongs to a different store' using errcode = '42501';
  end if;
  if c.needs_note and nullif(btrim(p_note), '') is null then
    raise exception 'note_required' using errcode = '22023';
  end if;
  return c.name;
end;
$$;

revoke all on function public.expense_category_for(uuid, uuid, text) from public, anon;
grant execute on function public.expense_category_for(uuid, uuid, text) to authenticated, service_role;

-- ============================================
-- record_drawer_expense
-- ============================================
create or replace function public.record_drawer_expense(
  p_shift_id uuid,
  p_amount_cents bigint,
  p_category_id uuid,
  p_note text,
  p_supplier_id uuid,
  p_paid_to_name text,
  p_recorded_by_name text,
  p_client_request_id uuid
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
  v_name text := btrim(coalesce(p_recorded_by_name, ''));
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
    paid_from, shift_cash_movement_id, client_request_id, created_by_name
  ) values (
    v_tenant, p_category_id, p_supplier_id, p_paid_to_name, p_note, p_amount_cents,
    'drawer', v_movement, p_client_request_id, v_name
  )
  returning id into v_expense;

  return v_expense;
end;
$$;

-- ============================================
-- sort_drawer_payout
-- ============================================
create or replace function public.sort_drawer_payout(
  p_movement_id uuid,
  p_category_id uuid,
  p_note text,
  p_supplier_id uuid,
  p_paid_to_name text,
  p_recorded_by_name text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  m record;
  v_expense uuid;
  v_name text := btrim(coalesce(p_recorded_by_name, ''));
begin
  select scm.tenant_id, scm.amount into m
    from public.shift_cash_movements scm where scm.id = p_movement_id;
  if not found then
    raise exception 'movement_not_found' using errcode = 'P0002';
  end if;
  if current_user in ('anon', 'authenticated') and not public.app_user_has_permission(m.tenant_id, 'expenses') then
    raise exception 'Sorting pay-outs needs the Expenses permission' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'recorded_by_name_required' using errcode = '22023';
  end if;
  perform public.expense_category_for(m.tenant_id, p_category_id, p_note);

  -- expenses_drawer_link checks kind, amount and branch reach, and takes the
  -- branch and date from the movement. The partial unique index refuses a
  -- pay-out that is already sorted.
  insert into public.expenses (
    tenant_id, category_id, supplier_id, paid_to_name, note, amount_cents,
    paid_from, shift_cash_movement_id, created_by_name
  ) values (
    m.tenant_id, p_category_id, p_supplier_id, p_paid_to_name, p_note, round(m.amount * 100)::bigint,
    'drawer', p_movement_id, v_name
  )
  returning id into v_expense;

  return v_expense;
end;
$$;

-- ============================================
-- void_expense
-- ============================================
-- Who: `expenses` + branch reach may void any row; a cashier with `pos` may
-- void the drawer expense THEY recorded while its shift is open (Undo after
-- save; policy expenses_void_own_drawer).
-- A drawer expense keeps the drawer honest: while its shift is OPEN the cash
-- goes back in with a pay_in ("Correction: <reason>") in the same
-- transaction, under the drawer's own policy (own shift, or a cash manager).
-- Once the shift is CLOSED a drawer expense cannot be voided (22023
-- drawer_shift_closed): use replace_expense to re-file it instead.
create or replace function public.void_expense(p_expense_id uuid, p_reason text, p_actor_name text default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  e record;
  v_shift record;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_actor text;
  v_client boolean := current_user in ('anon', 'authenticated');
  v_rows integer;
begin
  if char_length(v_reason) not between 1 and 200 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select x.tenant_id, x.outlet_id, x.paid_from, x.created_by, x.amount_cents, x.shift_cash_movement_id
    into e
    from public.expenses x where x.id = p_expense_id and x.status = 'recorded';
  if not found then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;

  if v_client and not (
    (public.app_user_has_permission(e.tenant_id, 'expenses')
      and public.app_user_may_reach_branch(e.tenant_id, e.outlet_id))
    or (e.paid_from = 'drawer' and e.created_by = auth.uid()
      and public.app_user_has_permission(e.tenant_id, 'pos'))
  ) then
    raise exception 'Voiding needs the Expenses permission for this branch' using errcode = '42501';
  end if;

  if e.paid_from = 'drawer' then
    select s.id, s.status into v_shift
      from public.shift_cash_movements m
      join public.staff_shifts s on s.id = m.shift_id
     where m.id = e.shift_cash_movement_id;
    if not found then
      raise exception 'movement_not_found' using errcode = 'P0002';
    end if;
    if v_shift.status <> 'open' then
      raise exception 'drawer_shift_closed'
        using errcode = '22023',
              hint = 'The shift is closed; use Fix (replace_expense) to change the category instead.';
    end if;

    select coalesce(nullif(btrim(au.display_name), ''), nullif(split_part(coalesce(au.email, ''), '@', 1), ''))
      into v_actor
      from public.app_users au where au.user_id = auth.uid() limit 1;
    v_actor := left(coalesce(nullif(btrim(p_actor_name), ''), v_actor, 'Staff'), 80);

    -- The drawer's guard refuses a shift that closed meanwhile.
    insert into public.shift_cash_movements (tenant_id, shift_id, kind, amount, reason, recorded_by_name)
    values (e.tenant_id, v_shift.id, 'pay_in', e.amount_cents::numeric / 100,
            left('Correction: ' || v_reason, 200), v_actor);
  end if;

  -- The mark expenses_guard looks for; transaction-local and cleared below.
  perform set_config('app.expense_void', p_expense_id::text, true);
  update public.expenses
     set status = 'void', void_reason = v_reason, voided_by = auth.uid(), voided_at = now()
   where id = p_expense_id and status = 'recorded';
  get diagnostics v_rows = row_count;
  perform set_config('app.expense_void', '', true);

  if v_rows = 0 then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- ============================================
-- replace_expense
-- ============================================
create or replace function public.replace_expense(p_expense_id uuid, p_reason text, p_patch jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_patchable constant text[] := array[
    'category_id', 'amount_cents', 'spent_on', 'paid_from', 'outlet_id', 'note', 'supplier_id',
    'paid_to_name', 'is_stock_purchase', 'doc_type', 'invoice_no', 'supplier_tin', 'vat_cents',
    'ewt_cents', 'ewt_rate', 'form_2307_given'
  ];
  v_drawer_locked constant text[] := array['amount_cents', 'paid_from', 'outlet_id', 'spent_on'];
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_key text;
  v_old public.expenses%rowtype;
  v_new public.expenses%rowtype;
  v_name text;
  v_id uuid;
  v_rows integer;
begin
  if jsonb_typeof(v_patch) <> 'object' then
    raise exception 'unknown_patch_key' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(v_patch) loop
    if not (v_key = any (v_patchable)) then
      raise exception 'unknown_patch_key' using errcode = '22023', detail = v_key;
    end if;
  end loop;

  select * into v_old from public.expenses where id = p_expense_id and status = 'recorded';
  if not found then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;

  v_new := jsonb_populate_record(v_old, v_patch);

  if v_old.paid_from = 'drawer' then
    foreach v_key in array v_drawer_locked loop
      if (to_jsonb(v_new) -> v_key) is distinct from (to_jsonb(v_old) -> v_key) then
        raise exception 'drawer_locked' using errcode = '22023', detail = v_key;
      end if;
    end loop;
  elsif v_new.paid_from = 'drawer' then
    -- Only a real pay-out makes a drawer expense (sort_drawer_payout).
    raise exception 'drawer_locked' using errcode = '22023', detail = 'paid_from';
  end if;

  -- Void the old row WITHOUT touching the drawer: the cash did leave, the
  -- copy below files it again (same movement). Only `expenses` + reach.
  if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 200 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if current_user in ('anon', 'authenticated') and not (
    public.app_user_has_permission(v_old.tenant_id, 'expenses')
    and public.app_user_may_reach_branch(v_old.tenant_id, v_old.outlet_id)
  ) then
    raise exception 'Fixing needs the Expenses permission for this branch' using errcode = '42501';
  end if;
  perform set_config('app.expense_void', p_expense_id::text, true);
  update public.expenses
     set status = 'void', void_reason = btrim(p_reason), voided_by = auth.uid(), voided_at = now()
   where id = p_expense_id and status = 'recorded';
  get diagnostics v_rows = row_count;
  perform set_config('app.expense_void', '', true);
  if v_rows = 0 then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;

  select coalesce(nullif(btrim(au.display_name), ''), nullif(split_part(coalesce(au.email, ''), '@', 1), ''))
    into v_name
    from public.app_users au where au.user_id = auth.uid() limit 1;

  -- The drawer link stays: the old row is void now, so the partial unique
  -- index has room for the new one.
  insert into public.expenses (
    tenant_id, outlet_id, category_id, supplier_id, paid_to_name, staff_user_id, note,
    amount_cents, spent_on, paid_from, shift_cash_movement_id, is_stock_purchase,
    doc_type, invoice_no, supplier_tin, vat_cents, ewt_cents, ewt_rate, form_2307_given,
    replaces_expense_id, created_by_name
  ) values (
    v_old.tenant_id, v_new.outlet_id, v_new.category_id, v_new.supplier_id, v_new.paid_to_name,
    v_old.staff_user_id, v_new.note, v_new.amount_cents, v_new.spent_on, v_new.paid_from,
    v_old.shift_cash_movement_id, v_new.is_stock_purchase, v_new.doc_type, v_new.invoice_no,
    v_new.supplier_tin, v_new.vat_cents, v_new.ewt_cents, v_new.ewt_rate, v_new.form_2307_given,
    v_old.id, left(coalesce(v_name, v_old.created_by_name), 80)
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ============================================
-- Grants: signed-in accounts only
-- ============================================
revoke all on function public.record_drawer_expense(uuid, bigint, uuid, text, uuid, text, text, uuid) from public, anon;
revoke all on function public.sort_drawer_payout(uuid, uuid, text, uuid, text, text) from public, anon;
revoke all on function public.void_expense(uuid, text, text) from public, anon;
revoke all on function public.replace_expense(uuid, text, jsonb) from public, anon;
grant execute on function public.record_drawer_expense(uuid, bigint, uuid, text, uuid, text, text, uuid) to authenticated, service_role;
grant execute on function public.sort_drawer_payout(uuid, uuid, text, uuid, text, text) to authenticated, service_role;
grant execute on function public.void_expense(uuid, text, text) to authenticated, service_role;
grant execute on function public.replace_expense(uuid, text, jsonb) to authenticated, service_role;

-- ============================================
-- Rollback (manual)
-- ============================================
-- drop function if exists public.replace_expense(uuid, text, jsonb);
-- drop function if exists public.void_expense(uuid, text, text);
-- drop function if exists public.sort_drawer_payout(uuid, uuid, text, uuid, text, text);
-- drop function if exists public.record_drawer_expense(uuid, bigint, uuid, text, uuid, text, text, uuid);
-- drop function if exists public.expense_category_for(uuid, uuid, text);
