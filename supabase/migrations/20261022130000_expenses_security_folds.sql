-- Expenses security folds (review of PR #88, 2026-10-22). Fix-forward only:
-- redefines functions and one policy; no rows are changed.
--
-- 1. A replacement row is accepted only from replace_expense (transaction mark
--    `app.expense_replace`), so a voided drawer expense cannot be re-filed on
--    its pay-out after the cash went back (phantom expense). Also: nothing may
--    claim a staff payee until Pay staff exists (staff_user_id forced NULL).
-- 2. replace_expense sets that mark around its one insert.
-- 3. get_store_activity(_summary): expense rows need the owner or `expenses`
--    (or being the one who recorded it); activity_view alone is not enough.
-- 4. suppliers_read: `expenses` or `pos`, not every store account.
-- 5. A Fix (replace_expense) moves the receipt rows to the corrected copy.
--
-- Rollback: re-run the bodies from 20261022120000 (expenses_guard),
-- 20261022120100 (replace_expense), the live 2026-10-22 activity bodies (the
-- same as section 3 minus the `v_sees_expenses` lines) and the old
-- suppliers_read (app_user_belongs_to_store only); drop trigger
-- expenses_90_carry_receipts.

-- ============================================
-- 1. expenses_guard
-- ============================================
create or replace function public.expenses_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_editable constant text[] := array[
    -- Money-bearing fields (is_stock_purchase, vat/ewt) change only through
    -- replace_expense, so the history shows the correction.
    'note', 'supplier_id', 'paid_to_name', 'doc_type', 'invoice_no',
    'supplier_tin', 'form_2307_given', 'updated_at'
  ];
  v_void_cols constant text[] := array['status', 'void_reason', 'voided_by', 'voided_at', 'updated_at'];
begin
  if current_user not in ('anon', 'authenticated') then
    if tg_op = 'DELETE' then
      return old;
    end if;
    if tg_op = 'UPDATE' then
      new.updated_at := now();
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Expenses are never deleted. Void it instead.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'recorded' then
      raise exception 'An expense is recorded first; void it with void_expense' using errcode = '42501';
    end if;
    new.created_by := auth.uid();
    new.created_by_name := coalesce(public.expense_actor_name(), 'Staff');
    new.created_at := now();
    new.updated_at := now();
    new.void_reason := null;
    new.voided_by := null;
    new.voided_at := null;
    -- Pay staff (Phase 2) is not built: nothing may claim a staff payee yet.
    new.staff_user_id := null;
    -- A replacement is filed only by replace_expense, which marks the row it
    -- voided. Without this, a cashier could void a drawer expense (the cash
    -- goes back) and then insert a "replacement" on the same pay-out, putting
    -- a phantom expense in the book while the drawer nets to zero.
    if new.replaces_expense_id is not null
       and coalesce(current_setting('app.expense_replace', true), '') <> new.replaces_expense_id::text then
      raise exception 'Fix an expense with replace_expense' using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if old.status <> 'recorded' then
    raise exception 'A voided expense cannot be changed' using errcode = '42501';
  end if;

  if new.status = 'void' then
    if coalesce(current_setting('app.expense_void', true), '') <> old.id::text then
      raise exception 'Void an expense with void_expense' using errcode = '42501';
    end if;
    if (to_jsonb(new) - v_void_cols) <> (to_jsonb(old) - v_void_cols) then
      raise exception 'Voiding an expense changes nothing else' using errcode = '42501';
    end if;
    new.void_reason := btrim(new.void_reason);
    new.voided_by := auth.uid();
    new.voided_at := now();
    new.updated_at := now();
    return new;
  end if;

  if (to_jsonb(new) - v_editable) <> (to_jsonb(old) - v_editable) then
    raise exception 'Money, date, branch, category and source never change. Fix it with replace_expense.'
      using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ============================================
-- 2. replace_expense
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

  v_name := public.expense_actor_name();

  -- Lets expenses_guard accept this one replacement (and only this one).
  perform set_config('app.expense_replace', p_expense_id::text, true);

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
  perform set_config('app.expense_replace', '', true);

  return v_id;
end;
$$;

-- ============================================
-- 3. Store Activity: expense rows only for those who may see the book
-- ============================================
-- expense.recorded / expense.voided carry the amount, category, note and void
-- reason. activity_view / approve_requests are not `expenses`, so the owner,
-- `expenses` holders and the person who recorded it see these rows; nobody
-- else (salaries, rent and owner draws stay private). Bodies copied from the
-- live definitions (2026-10-22) with ONLY the expenses line added.
create or replace function public.get_store_activity(p_tenant_id uuid, p_limit integer DEFAULT 50, p_before_occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_until timestamp with time zone DEFAULT NULL::timestamp with time zone, p_categories text[] DEFAULT NULL::text[], p_outlet_id uuid DEFAULT NULL::uuid, p_actor_user_id uuid DEFAULT NULL::uuid, p_flagged_only boolean DEFAULT false, p_include_routine boolean DEFAULT false, p_search text DEFAULT NULL::text, p_subject_type text DEFAULT NULL::text, p_subject_ref text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, outlet_id uuid, outlet_name text, occurred_at timestamp with time zone, category text, kind text, is_routine boolean, actor_user_id uuid, actor_name text, approved_by_name text, amount numeric, quantity numeric, unit text, reason text, note text, subject_type text, subject_ref text, order_number text, before jsonb, after jsonb, summary jsonb, flags text[], reviewed_at timestamp with time zone, reviewed_by_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s record;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_search text := nullif(btrim(left(coalesce(p_search, ''), 80)), '');
  v_pattern text;
  v_since timestamptz := p_since;
  v_sees_expenses boolean;
begin
  select * into s from public.store_activity_caller_scope(p_tenant_id);
  v_sees_expenses := s.o_owner or public.app_user_has_permission(p_tenant_id, 'expenses');
  if coalesce(p_flagged_only, false) and not s.o_full then
    return;
  end if;
  if v_search is not null then
    v_pattern := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_since := coalesce(v_since, now() - interval '93 days');
  end if;

  return query
  select a.id, a.outlet_id, o.name, a.occurred_at, a.category, a.kind,
         a.is_routine, a.actor_user_id, a.actor_name, a.approved_by_name, a.amount,
         a.quantity, a.unit, a.reason, a.note, a.subject_type, a.subject_ref,
         a.order_number, a.before, a.after, a.summary,
         case when s.o_full then a.flags else '{}'::text[] end,
         case when s.o_full then a.reviewed_at end,
         case when s.o_full then a.reviewed_by_name end
  from public.store_activity a
  left join public.outlets o on o.id = a.outlet_id
  where a.tenant_id = p_tenant_id
    and (a.category <> 'team' or s.o_owner)
    and (a.category <> 'expenses' or v_sees_expenses or a.actor_user_id = s.o_uid)
    and (s.o_full or a.actor_user_id = s.o_uid)
    and (not s.o_full or s.o_branch is null or a.outlet_id is null or a.outlet_id = s.o_branch or a.actor_user_id = s.o_uid)
    and (p_before_occurred_at is null
         or a.occurred_at < p_before_occurred_at
         or (p_before_id is not null and a.occurred_at = p_before_occurred_at and a.id < p_before_id))
    and (v_since is null or a.occurred_at >= v_since)
    and (p_until is null or a.occurred_at < p_until)
    and (p_categories is null or a.category = any (p_categories))
    and (p_outlet_id is null or a.outlet_id = p_outlet_id)
    and (p_actor_user_id is null or a.actor_user_id = p_actor_user_id)
    and (not coalesce(p_flagged_only, false) or a.flags <> '{}'::text[])
    and (coalesce(p_include_routine, false) or not a.is_routine)
    and (p_subject_type is null or a.subject_type = p_subject_type)
    and (p_subject_ref is null or a.subject_ref = p_subject_ref)
    and (v_pattern is null
         or a.order_number ilike v_pattern
         or (a.summary ->> 'title') ilike v_pattern
         or a.reason ilike v_pattern)
  order by a.occurred_at desc, a.id desc
  limit v_limit;
end;
$function$;

create or replace function public.get_store_activity_summary(p_tenant_id uuid, p_since timestamp with time zone, p_until timestamp with time zone, p_outlet_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s record;
  v_until timestamptz := coalesce(p_until, now());
  v_result jsonb;
  v_sees_expenses boolean;
begin
  select * into s from public.store_activity_caller_scope(p_tenant_id);
  v_sees_expenses := s.o_owner or public.app_user_has_permission(p_tenant_id, 'expenses');
  if p_since is null or p_since >= v_until then
    raise exception 'A window (p_since < p_until) is required' using errcode = '22023';
  end if;
  if v_until - p_since > interval '93 days' then
    raise exception 'The window may be at most 93 days' using errcode = '22023';
  end if;

  with visible as (
    select a.kind, a.is_routine, a.actor_user_id, a.actor_name, a.amount, a.quantity, a.occurred_at, a.flags, a.reviewed_at,
           (a.kind = 'discount.applied' and coalesce(a.summary ->> 'statutory', 'false') = 'true') as statutory
    from public.store_activity a
    where a.tenant_id = p_tenant_id
      and a.occurred_at >= p_since and a.occurred_at < v_until
      and (p_outlet_id is null or a.outlet_id = p_outlet_id)
      and (a.category <> 'team' or s.o_owner)
      and (a.category <> 'expenses' or v_sees_expenses or a.actor_user_id = s.o_uid)
      and (s.o_full or a.actor_user_id = s.o_uid)
      and (not s.o_full or s.o_branch is null or a.outlet_id is null or a.outlet_id = s.o_branch or a.actor_user_id = s.o_uid)
  )
  select jsonb_build_object(
    'byKind', coalesce((
      select jsonb_agg(jsonb_build_object('kind', k.kind, 'statutory', k.statutory, 'count', k.n,
               'amount', k.amount, 'quantity', k.quantity) order by k.kind, k.statutory)
      from (select v.kind, v.statutory, count(*) n, sum(v.amount) amount, sum(v.quantity) quantity
            from visible v where not v.is_routine group by v.kind, v.statutory) k), '[]'::jsonb),
    'byActor', coalesce((
      select jsonb_agg(jsonb_build_object('actorUserId', b.actor_user_id, 'actorName', b.actor_name,
               'kind', b.kind, 'count', b.n, 'amount', b.amount) order by b.actor_name nulls last, b.kind)
      from (select v.actor_user_id, max(v.actor_name) actor_name, v.kind, count(*) n, sum(v.amount) amount
            from visible v where not v.is_routine group by v.actor_user_id, v.kind) b), '[]'::jsonb),
    'byDay', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'kind', d.kind, 'count', d.n, 'amount', d.amount)
               order by d.day, d.kind)
      from (select (v.occurred_at at time zone 'Asia/Manila')::date as day, v.kind, count(*) n, sum(v.amount) amount
            from visible v where not v.is_routine group by 1, 2) d), '[]'::jsonb),
    'routine', coalesce((
      select jsonb_agg(jsonb_build_object('kind', r.kind, 'count', r.n, 'amount', r.amount) order by r.kind)
      from (select v.kind, count(*) n, sum(v.amount) amount
            from visible v where v.is_routine group by v.kind) r), '[]'::jsonb),
    'flaggedOpen', case when s.o_full then
      (select count(*) from visible v where v.flags <> '{}'::text[] and v.reviewed_at is null)::integer
      else 0 end
  ) into v_result;
  return v_result;
end;
$function$;

-- ============================================
-- 4. Suppliers: payees (TIN, phone, staff names) for people who pay them
-- ============================================
-- `expenses` keeps the book; `pos` pays from the drawer and picks "Paid to".
-- Kitchen-only and other accounts no longer read the list.
drop policy if exists suppliers_read on public.suppliers;
create policy suppliers_read on public.suppliers for select to authenticated
  using (
    public.app_user_belongs_to_store(tenant_id)
    and (public.app_user_has_permission(tenant_id, 'expenses') or public.app_user_has_permission(tenant_id, 'pos'))
  );

-- ============================================
-- 5. A Fix keeps its receipts
-- ============================================
-- replace_expense voids the old row and files a corrected copy; the receipt
-- photos stayed on the void row, so the live row read "No receipt", the
-- export said Receipt: no, and re-attaching was refused (void). The photos
-- now move to the copy. Only replace_expense can insert a replacement
-- (section 1), so this never runs for anything else.
--
-- The path check tied segment 2 to expense_id; a moved receipt keeps its
-- storage object (paths are server-built, the bucket is service-role only),
-- so segment 2 is now "the expense it was uploaded to" — still a uuid.
alter table public.expense_receipts drop constraint if exists expense_receipts_path_ck;
alter table public.expense_receipts add constraint expense_receipts_path_ck check (
  split_part(object_path, '/', 1) = tenant_id::text
  and object_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$'
);

create or replace function public.expenses_carry_receipts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.expense_receipts r
     set expense_id = new.id
   where r.expense_id = new.replaces_expense_id
     and r.tenant_id = new.tenant_id;
  return null;
end;
$$;

revoke all on function public.expenses_carry_receipts() from public, anon, authenticated;

drop trigger if exists expenses_90_carry_receipts on public.expenses;
create trigger expenses_90_carry_receipts
  after insert on public.expenses
  for each row
  when (new.replaces_expense_id is not null)
  execute function public.expenses_carry_receipts();
