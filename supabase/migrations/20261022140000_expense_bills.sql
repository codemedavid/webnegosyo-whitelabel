-- Bills to pay — recurring expense REMINDERS (docs/plans/expenses/bills-contract.md §2).
--
-- What:
--   * expense_bills       — "Rent on the 5th", "Sahod on the 15th and the last
--                           day". A bill is a reminder: it never writes money
--                           and nothing in Spent / Profit / reports reads it.
--                           Bills are never deleted; 'ended' is final.
--   * expense_bill_marks  — "Nothing to pay this time" (skipped) and "Remind me
--                           tomorrow" (snoozed) for ONE due date. Undo = DELETE
--                           (the only DELETE anywhere in this feature).
--   * expenses.bill_id / bill_due_on — paying a bill is an ordinary expense row
--                           that names the bill and the due date it settles.
--                           At most one RECORDED expense per (bill, due date);
--                           voiding frees the date again.
--   * expenses_guard      — bill_id / bill_due_on join the in-place editable
--                           list ("I already recorded it" links an existing
--                           recorded row; money stays immutable).
--   * expenses_integrity  — a set bill_id is a bill of the same store.
--   * replace_expense     — the corrected copy keeps bill_id / bill_due_on
--                           (the voided row keeps them too).
--
-- Why: owners forget rent, kuryente and sahod until they are late; the phone
-- reminds them, and "Mark paid" files the expense they would have typed anyway.
--
-- Access (authenticated only, anon nothing): the `expenses` key (opt-in) plus
-- branch reach, exactly like the expense book. A branch-locked holder sees and
-- writes only their branch's bills; store-wide bills need a store-wide account.
--
-- Bodies: expenses_guard and replace_expense are copied from
-- 20261022130000_expenses_security_folds.sql (the live ones), expenses_integrity
-- from 20261022120000_expenses.sql; ONLY the bill lines are added.
-- No existing row is updated (the new expense columns start NULL everywhere).
--
-- Rollback (manual, in this order):
--   re-run expenses_guard + replace_expense from 20261022130000 and
--   expenses_integrity from 20261022120000;
--   drop index if exists public.expenses_bill_due_recorded_uq;
--   drop index if exists public.expenses_tenant_bill_idx;
--   alter table public.expenses drop constraint if exists expenses_bill_pair_ck,
--     drop column if exists bill_due_on, drop column if exists bill_id;
--   drop table if exists public.expense_bill_marks;
--   drop table if exists public.expense_bills;
--   drop function if exists public.expense_bill_marks_guard();
--   drop function if exists public.expense_bills_integrity();
--   drop function if exists public.expense_bills_guard();

set lock_timeout = '3s';

-- ============================================
-- 1. expense_bills
-- ============================================
create table if not exists public.expense_bills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- NULL = whole store. NO ACTION (not RESTRICT): a store deletion cascades through it.
  outlet_id uuid references public.outlets(id),
  name text not null,
  category_id uuid not null references public.expense_categories(id),
  supplier_id uuid references public.suppliers(id),
  paid_to_name text,
  paid_from text not null default 'cash',
  -- NULL = the amount changes every time (kuryente, tubig, LPG).
  amount_cents bigint,
  repeat_kind text not null,
  repeat_every smallint not null default 1,
  -- Days of the month, 1..31, or 0 = the month's last day.
  repeat_days smallint[],
  -- 0 Sunday .. 6 Saturday.
  repeat_weekday smallint,
  -- The first due date is on or after this day.
  starts_on date not null,
  ends_on date,
  remind_days_before smallint not null default 1,
  status text not null default 'active',
  -- Only while paused; NULL = paused until resumed by hand.
  paused_until date,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint expense_bills_name_ck check (char_length(btrim(name)) between 1 and 60),
  constraint expense_bills_paid_to_name_ck check (paid_to_name is null or char_length(paid_to_name) <= 80),
  -- v1 bills are never paid from the drawer.
  constraint expense_bills_paid_from_ck check (paid_from in ('cash', 'gcash', 'maya', 'bank', 'card', 'owner')),
  constraint expense_bills_amount_ck check (amount_cents is null or amount_cents between 1 and 1000000000),
  constraint expense_bills_repeat_kind_ck check (repeat_kind in ('monthly', 'twice_monthly', 'weekly', 'months', 'after_days')),
  -- A plain one-dimensional, 1-based list of 0..31 with no NULL element.
  constraint expense_bills_repeat_days_ck check (
    repeat_days is null or (
      array_ndims(repeat_days) = 1
      and array_lower(repeat_days, 1) = 1
      and array_position(repeat_days, null) is null
      and 0 <= all (repeat_days)
      and 31 >= all (repeat_days)
    )
  ),
  constraint expense_bills_weekday_ck check (repeat_weekday is null or repeat_weekday between 0 and 6),
  -- One shape per kind (the engine's BillRule). coalesce(cardinality) because a
  -- NULL array would otherwise make the whole CHECK unknown, i.e. pass.
  constraint expense_bills_shape_ck check (
    case repeat_kind
      when 'monthly' then
        repeat_every = 1 and coalesce(cardinality(repeat_days), 0) = 1 and repeat_weekday is null
      when 'twice_monthly' then
        repeat_every = 1 and coalesce(cardinality(repeat_days), 0) = 2
        and repeat_days[1] <> repeat_days[2] and repeat_weekday is null
      when 'weekly' then
        repeat_every in (1, 2) and repeat_weekday is not null and repeat_days is null
      when 'months' then
        repeat_every in (2, 3, 4, 6, 12) and coalesce(cardinality(repeat_days), 0) = 1 and repeat_weekday is null
      when 'after_days' then
        repeat_every between 1 and 90 and repeat_days is null and repeat_weekday is null
      else false
    end
  ),
  constraint expense_bills_window_ck check (ends_on is null or ends_on >= starts_on),
  constraint expense_bills_remind_ck check (remind_days_before between 0 and 14),
  constraint expense_bills_status_ck check (status in ('active', 'paused', 'ended')),
  constraint expense_bills_paused_until_ck check (paused_until is null or status = 'paused'),
  constraint expense_bills_created_by_name_ck check (created_by_name is null or char_length(created_by_name) <= 80)
);

comment on table public.expense_bills is
  'Bills to pay: recurring expense REMINDERS. Never money; paying = an expenses row with bill_id + bill_due_on. Contract: docs/plans/expenses/bills-contract.md.';

create index if not exists expense_bills_tenant_status_idx on public.expense_bills (tenant_id, status);

-- ============================================
-- 2. expense_bill_marks
-- ============================================
create table if not exists public.expense_bill_marks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bill_id uuid not null references public.expense_bills(id) on delete cascade,
  due_on date not null,
  kind text not null,
  snoozed_until date,
  created_by uuid,
  created_at timestamptz not null default now(),

  constraint expense_bill_marks_bill_due_uq unique (bill_id, due_on),
  constraint expense_bill_marks_kind_ck check (kind in ('skipped', 'snoozed')),
  constraint expense_bill_marks_snooze_ck check ((kind = 'snoozed') = (snoozed_until is not null))
);

comment on table public.expense_bill_marks is
  'One due date of a bill marked "Nothing to pay this time" (skipped) or "Remind me tomorrow" (snoozed). Undo = DELETE.';

create index if not exists expense_bill_marks_tenant_idx on public.expense_bill_marks (tenant_id, bill_id);

-- ============================================
-- 3. Bill triggers
-- ============================================

-- 3a. expense_bills_guard — who and when, the store never changes, 'ended' is
-- final. SECURITY INVOKER: current_user must be the role doing the write.
create or replace function public.expense_bills_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_client boolean := current_user in ('anon', 'authenticated');
begin
  new.name := btrim(new.name);
  new.paid_to_name := nullif(btrim(new.paid_to_name), '');

  if tg_op = 'INSERT' then
    if v_client then
      if new.status = 'ended' then
        raise exception 'A bill starts active or paused' using errcode = '42501';
      end if;
      new.created_by := auth.uid();
      new.created_by_name := coalesce(public.expense_actor_name(), 'Staff');
      new.created_at := now();
    end if;
    new.updated_at := now();
    return new;
  end if;

  -- UPDATE
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'A bill cannot move to another store' using errcode = '42501';
  end if;
  if v_client then
    -- Nobody rewrites who made the bill.
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
    -- A stopped bill is history: its past payments stay, it never comes back.
    if old.status = 'ended'
       and (to_jsonb(new) - 'updated_at') <> (to_jsonb(old) - 'updated_at') then
      raise exception 'This bill was stopped and cannot change' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists expense_bills_10_guard on public.expense_bills;
create trigger expense_bills_10_guard
  before insert or update on public.expense_bills
  for each row execute function public.expense_bills_guard();

-- 3b. expense_bills_integrity — same-store category / supplier / branch, like
-- expenses_integrity. SECURITY DEFINER: "another store's row" and "a row you
-- cannot see" are one answer.
create or replace function public.expense_bills_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
     and not exists (
       select 1 from public.expense_categories c where c.id = new.category_id and c.tenant_id = new.tenant_id
     ) then
    raise exception 'Category belongs to a different store' using errcode = '42501';
  end if;
  if new.supplier_id is not null
     and (tg_op = 'INSERT' or new.supplier_id is distinct from old.supplier_id)
     and not exists (select 1 from public.suppliers s where s.id = new.supplier_id and s.tenant_id = new.tenant_id) then
    raise exception 'Supplier belongs to a different store' using errcode = '42501';
  end if;
  if new.outlet_id is not null
     and (tg_op = 'INSERT' or new.outlet_id is distinct from old.outlet_id)
     and not exists (select 1 from public.outlets o where o.id = new.outlet_id and o.tenant_id = new.tenant_id) then
    raise exception 'Branch belongs to a different store' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists expense_bills_20_integrity on public.expense_bills;
create trigger expense_bills_20_integrity
  before insert or update on public.expense_bills
  for each row execute function public.expense_bills_integrity();

-- 3c. expense_bill_marks_guard — the mark's store is its bill's store; who and
-- when are stamped for client roles. SECURITY INVOKER on purpose: current_user
-- tells a client from the service role, and a client reads the bill under its
-- own RLS (a bill it cannot see is one it may not mark — the insert policy says
-- the same), while the service role sees every bill.
create or replace function public.expense_bill_marks_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.expense_bills b where b.id = new.bill_id and b.tenant_id = new.tenant_id) then
    raise exception 'Bill belongs to a different store' using errcode = '42501';
  end if;
  if current_user in ('anon', 'authenticated') then
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists expense_bill_marks_guard on public.expense_bill_marks;
create trigger expense_bill_marks_guard
  before insert on public.expense_bill_marks
  for each row execute function public.expense_bill_marks_guard();

revoke all on function public.expense_bills_guard() from public, anon, authenticated;
revoke all on function public.expense_bills_integrity() from public, anon, authenticated;
revoke all on function public.expense_bill_marks_guard() from public, anon, authenticated;

-- ============================================
-- 4. Row-level security (authenticated only; anon has no grant at all)
-- ============================================
alter table public.expense_bills enable row level security;
alter table public.expense_bill_marks enable row level security;

revoke all on public.expense_bills, public.expense_bill_marks from public, anon, authenticated;
-- No DELETE on bills (stop = status 'ended'); marks are never updated (re-snooze = delete + insert).
grant select, insert, update on public.expense_bills to authenticated;
grant select, insert, delete on public.expense_bill_marks to authenticated;
grant select, insert, update, delete on public.expense_bills, public.expense_bill_marks to service_role;

drop policy if exists expense_bills_read on public.expense_bills;
create policy expense_bills_read on public.expense_bills for select to authenticated
  using (public.app_user_has_permission(tenant_id, 'expenses') and public.app_user_may_reach_branch(tenant_id, outlet_id));

drop policy if exists expense_bills_insert on public.expense_bills;
create policy expense_bills_insert on public.expense_bills for insert to authenticated
  with check (public.app_user_has_permission(tenant_id, 'expenses') and public.app_user_may_reach_branch(tenant_id, outlet_id));

drop policy if exists expense_bills_update on public.expense_bills;
create policy expense_bills_update on public.expense_bills for update to authenticated
  using (public.app_user_has_permission(tenant_id, 'expenses') and public.app_user_may_reach_branch(tenant_id, outlet_id))
  with check (public.app_user_has_permission(tenant_id, 'expenses') and public.app_user_may_reach_branch(tenant_id, outlet_id));

-- Marks follow their bill: the subquery runs under the caller's bills policy,
-- so a bill out of the caller's branch reach is a bill they cannot mark.
-- Columns are table-qualified: an unqualified tenant_id inside the subquery
-- would bind to b.tenant_id and compare the bill with itself.
drop policy if exists expense_bill_marks_read on public.expense_bill_marks;
create policy expense_bill_marks_read on public.expense_bill_marks for select to authenticated
  using (
    public.app_user_has_permission(expense_bill_marks.tenant_id, 'expenses')
    and exists (
      select 1 from public.expense_bills b
       where b.id = expense_bill_marks.bill_id and b.tenant_id = expense_bill_marks.tenant_id
    )
  );

drop policy if exists expense_bill_marks_insert on public.expense_bill_marks;
create policy expense_bill_marks_insert on public.expense_bill_marks for insert to authenticated
  with check (
    public.app_user_has_permission(expense_bill_marks.tenant_id, 'expenses')
    and exists (
      select 1 from public.expense_bills b
       where b.id = expense_bill_marks.bill_id and b.tenant_id = expense_bill_marks.tenant_id
    )
  );

drop policy if exists expense_bill_marks_delete on public.expense_bill_marks;
create policy expense_bill_marks_delete on public.expense_bill_marks for delete to authenticated
  using (
    public.app_user_has_permission(expense_bill_marks.tenant_id, 'expenses')
    and exists (
      select 1 from public.expense_bills b
       where b.id = expense_bill_marks.bill_id and b.tenant_id = expense_bill_marks.tenant_id
    )
  );

-- ============================================
-- 5. expenses: the payment link
-- ============================================
alter table public.expenses add column if not exists bill_id uuid references public.expense_bills(id);
alter table public.expenses add column if not exists bill_due_on date;

comment on column public.expenses.bill_id is 'The bill this expense pays (Bills to pay). Set together with bill_due_on.';
comment on column public.expenses.bill_due_on is 'The due date of the bill this expense pays. One recorded expense per (bill_id, bill_due_on).';

alter table public.expenses drop constraint if exists expenses_bill_pair_ck;
alter table public.expenses add constraint expenses_bill_pair_ck check ((bill_id is null) = (bill_due_on is null));

-- At most one RECORDED expense per due date; a void row frees it (and keeps its link as history).
create unique index if not exists expenses_bill_due_recorded_uq
  on public.expenses (bill_id, bill_due_on) where status = 'recorded' and bill_id is not null;
create index if not exists expenses_tenant_bill_idx
  on public.expenses (tenant_id, bill_id) where bill_id is not null;

-- ============================================
-- 6. expenses_guard (from 20261022130000) + bill_id / bill_due_on editable
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
    'supplier_tin', 'form_2307_given', 'updated_at',
    -- "I already recorded it": link / unlink a recorded row to a bill's due date.
    'bill_id', 'bill_due_on'
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
-- 7. expenses_integrity (from 20261022120000) + the bill is this store's
-- ============================================
create or replace function public.expenses_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category record;
begin
  new.note := nullif(btrim(new.note), '');
  new.paid_to_name := nullif(btrim(new.paid_to_name), '');
  new.invoice_no := nullif(btrim(new.invoice_no), '');
  new.created_by_name := btrim(new.created_by_name);

  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'An expense cannot move to another store' using errcode = '42501';
  end if;

  select c.tenant_id, c.needs_note into v_category
    from public.expense_categories c where c.id = new.category_id;
  if not found or v_category.tenant_id <> new.tenant_id then
    raise exception 'Category belongs to a different store' using errcode = '42501';
  end if;
  if v_category.needs_note and new.note is null then
    raise exception 'note_required' using errcode = '22023';
  end if;

  if new.supplier_id is not null
     and (tg_op = 'INSERT' or new.supplier_id is distinct from old.supplier_id)
     and not exists (select 1 from public.suppliers s where s.id = new.supplier_id and s.tenant_id = new.tenant_id) then
    raise exception 'Supplier belongs to a different store' using errcode = '42501';
  end if;

  -- A payment names a bill of THIS store (any status: a stopped bill keeps its history).
  if new.bill_id is not null
     and (tg_op = 'INSERT' or new.bill_id is distinct from old.bill_id)
     and not exists (select 1 from public.expense_bills b where b.id = new.bill_id and b.tenant_id = new.tenant_id) then
    raise exception 'Bill belongs to a different store' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.outlet_id is not null
       and not exists (select 1 from public.outlets o where o.id = new.outlet_id and o.tenant_id = new.tenant_id) then
      raise exception 'Branch belongs to a different store' using errcode = '42501';
    end if;
    -- A replacement points at a row of the same store that is already void
    -- (replace_expense voids first), so lineage cannot be invented.
    if new.replaces_expense_id is not null and not exists (
      select 1 from public.expenses e
       where e.id = new.replaces_expense_id and e.tenant_id = new.tenant_id and e.status = 'void'
    ) then
      raise exception 'Only a voided expense of this store can be replaced' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ============================================
-- 8. replace_expense (from 20261022130000) + the copy keeps its bill
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
  -- index has room for the new one. The bill link stays too (same reason:
  -- expenses_bill_due_recorded_uq covers recorded rows only).
  insert into public.expenses (
    tenant_id, outlet_id, category_id, supplier_id, paid_to_name, staff_user_id, note,
    amount_cents, spent_on, paid_from, shift_cash_movement_id, is_stock_purchase,
    doc_type, invoice_no, supplier_tin, vat_cents, ewt_cents, ewt_rate, form_2307_given,
    replaces_expense_id, created_by_name, bill_id, bill_due_on
  ) values (
    v_old.tenant_id, v_new.outlet_id, v_new.category_id, v_new.supplier_id, v_new.paid_to_name,
    v_old.staff_user_id, v_new.note, v_new.amount_cents, v_new.spent_on, v_new.paid_from,
    v_old.shift_cash_movement_id, v_new.is_stock_purchase, v_new.doc_type, v_new.invoice_no,
    v_new.supplier_tin, v_new.vat_cents, v_new.ewt_cents, v_new.ewt_rate, v_new.form_2307_given,
    v_old.id, left(coalesce(v_name, v_old.created_by_name), 80), v_old.bill_id, v_old.bill_due_on
  )
  returning id into v_id;
  perform set_config('app.expense_replace', '', true);

  return v_id;
end;
$$;

revoke all on function public.expenses_guard() from public, anon, authenticated;
revoke all on function public.expenses_integrity() from public, anon, authenticated;
revoke all on function public.replace_expense(uuid, text, jsonb) from public, anon;
grant execute on function public.replace_expense(uuid, text, jsonb) to authenticated, service_role;

reset lock_timeout;
