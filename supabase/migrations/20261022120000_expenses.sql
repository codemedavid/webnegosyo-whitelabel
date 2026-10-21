-- Expenses — the book (Phase 1 of docs/plans/2026-10-21-expense-tracker.md)
--
-- One row per peso the store spent, however it was paid:
--   * expense_categories — per-store copies of the seed list (§4 of the
--                          contract), seeded on first use by
--                          ensure_expense_categories(); never deleted.
--   * suppliers          — "Paid to". Reports Phase 3 (Deliveries) reuses it.
--   * expenses           — append-only. Money, date, branch, category and
--                          source never change after saving; a correction is
--                          void + replacement (replace_expense, 120100).
--   * expense_receipts   — photo/PDF rows, written by the service role only
--                          (upload route); the bucket is in 120200.
--
-- Contract: docs/plans/expenses/contract.md (§1-§5). Money is integer
-- centavos; shift_cash_movements stays numeric pesos and the drawer link
-- checks round(amount * 100) = amount_cents.
--
-- Client roles (anon / authenticated) are held by triggers, like the
-- inventory ledger (20261012170000):
--   expenses_10_guard        stamps the actor/clock, refuses DELETE, refuses
--                            every UPDATE except the editable details and the
--                            recorded -> void move made by void_expense.
--   expenses_20_drawer_link  a paid_from = 'drawer' row must point at a
--                            pay_out of the same store and amount that the
--                            caller recorded (with pos/expenses) or may sort
--                            (expenses + branch reach). Branch, date and
--                            status come from the movement.
--   expenses_25_movement_once a pay-out is filed ONCE: any expense row on it
--                            (recorded or void) closes it, except the
--                            replacement of that movement's voided row.
--   expenses_30_integrity    same-store category/supplier/branch, the
--                            needs_note rule, the business-date window.
--
-- Foreign keys between rows that a tenant deletion cascades through are NO
-- ACTION (the default), not RESTRICT: RESTRICT is checked mid-cascade and
-- would make deleting a store fail depending on trigger order. For a direct
-- DELETE the two behave the same.
--
-- Additive: four new tables, no change to existing ones. Rollback at end.

-- ============================================
-- 1. expense_categories
-- ============================================
create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  system_key text,
  name text not null,
  icon text,
  grp text not null,
  needs_note boolean not null default false,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),

  constraint expense_categories_name_ck check (char_length(btrim(name)) between 1 and 60),
  constraint expense_categories_icon_ck check (icon is null or char_length(icon) <= 8),
  constraint expense_categories_grp_ck check (grp in (
    'ingredients', 'staff', 'occupancy', 'utilities', 'operating', 'admin', 'other', 'capex', 'not_expense'
  )),
  constraint expense_categories_system_key_ck check (system_key is null or system_key ~ '^[a-z][a-z0-9_]{0,39}$')
);

comment on table public.expense_categories is
  'Per-store expense categories. Seeded by ensure_expense_categories (system_key set); archived, never deleted.';

create unique index if not exists expense_categories_system_key_uq
  on public.expense_categories (tenant_id, system_key) where system_key is not null;
create unique index if not exists expense_categories_live_name_uq
  on public.expense_categories (tenant_id, lower(btrim(name))) where archived_at is null;
create index if not exists expense_categories_tenant_sort_idx
  on public.expense_categories (tenant_id, sort_order);

-- ============================================
-- 2. suppliers ("Paid to")
-- ============================================
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  kind text not null default 'supplier',
  tin text,
  default_category_id uuid references public.expense_categories(id),
  phone text,
  note text,
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),

  constraint suppliers_name_ck check (char_length(btrim(name)) between 1 and 80),
  constraint suppliers_kind_ck check (kind in ('supplier', 'landlord', 'utility', 'staff', 'government', 'other')),
  constraint suppliers_tin_ck check (tin is null or tin ~ '^\d{9}(\d{3,5})?$'),
  constraint suppliers_phone_ck check (phone is null or char_length(phone) <= 30),
  constraint suppliers_note_ck check (note is null or char_length(note) <= 200)
);

comment on table public.suppliers is
  'Who a store pays (UI: "Paid to"). Shared with Reports Phase 3 deliveries. Archived, never deleted.';

create unique index if not exists suppliers_live_name_uq
  on public.suppliers (tenant_id, lower(btrim(name))) where archived_at is null;

-- ============================================
-- 3. expenses
-- ============================================
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- NULL = store-wide.
  outlet_id uuid references public.outlets(id),
  category_id uuid not null references public.expense_categories(id),
  supplier_id uuid references public.suppliers(id),
  paid_to_name text,
  -- Reserved for Pay staff (Phase 2). No FK: evidence survives the account.
  staff_user_id uuid,
  note text,
  amount_cents bigint not null,
  -- Asia/Manila business date the cost belongs to.
  spent_on date not null default ((now() at time zone 'Asia/Manila')::date),
  paid_from text not null,
  shift_cash_movement_id uuid references public.shift_cash_movements(id),
  is_stock_purchase boolean not null default false,
  doc_type text,
  invoice_no text,
  supplier_tin text,
  vat_cents bigint,
  ewt_cents bigint,
  ewt_rate numeric(5, 2),
  form_2307_given boolean not null default false,
  status text not null default 'recorded',
  void_reason text,
  voided_by uuid,
  voided_at timestamptz,
  replaces_expense_id uuid references public.expenses(id),
  client_request_id uuid,
  created_by uuid,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint expenses_amount_ck check (amount_cents > 0 and amount_cents <= 1000000000),
  constraint expenses_paid_from_ck check (paid_from in ('drawer', 'cash', 'gcash', 'maya', 'bank', 'card', 'owner')),
  constraint expenses_drawer_link_ck check ((paid_from = 'drawer') = (shift_cash_movement_id is not null)),
  constraint expenses_paid_to_name_ck check (paid_to_name is null or char_length(paid_to_name) <= 80),
  constraint expenses_note_ck check (note is null or char_length(note) <= 200),
  constraint expenses_doc_type_ck check (doc_type is null or doc_type in ('vat_invoice', 'non_vat_invoice', 'acknowledgement', 'none')),
  constraint expenses_invoice_no_ck check (invoice_no is null or char_length(invoice_no) <= 40),
  constraint expenses_supplier_tin_ck check (supplier_tin is null or supplier_tin ~ '^\d{9}(\d{3,5})?$'),
  constraint expenses_vat_ck check (vat_cents is null or (vat_cents >= 0 and vat_cents < amount_cents)),
  constraint expenses_ewt_ck check (ewt_cents is null or (ewt_cents >= 0 and ewt_cents < amount_cents)),
  constraint expenses_ewt_rate_ck check (ewt_rate is null or (ewt_rate >= 0 and ewt_rate <= 100)),
  constraint expenses_status_ck check (status in ('recorded', 'void')),
  constraint expenses_void_reason_ck check (void_reason is null or char_length(btrim(void_reason)) between 1 and 200),
  constraint expenses_void_consistency_ck check ((status = 'void') = (voided_at is not null and void_reason is not null)),
  constraint expenses_created_by_name_ck check (char_length(btrim(created_by_name)) between 1 and 80),
  constraint expenses_not_self_replacing_ck check (replaces_expense_id is null or replaces_expense_id <> id)
);

comment on table public.expenses is
  'Append-only expense book (integer centavos). Corrections are void + replacement. Contract: docs/plans/expenses/contract.md.';
comment on column public.expenses.spent_on is 'Asia/Manila business date. Drawer rows: the Manila date of the pay-out.';
comment on column public.expenses.shift_cash_movement_id is 'The drawer pay_out this expense sorts. Required iff paid_from = drawer; one recorded expense per movement.';

create index if not exists expenses_tenant_spent_idx
  on public.expenses (tenant_id, spent_on desc) where status = 'recorded';
create index if not exists expenses_tenant_outlet_spent_idx
  on public.expenses (tenant_id, outlet_id, spent_on desc);
create index if not exists expenses_tenant_category_spent_idx
  on public.expenses (tenant_id, category_id, spent_on);
create index if not exists expenses_movement_idx
  on public.expenses (shift_cash_movement_id);
-- At most one RECORDED expense per pay-out, race-proof (expenses_25_movement_once
-- also counts void rows: a pay-out is filed once, ever, bar replacements).
create unique index if not exists expenses_movement_recorded_uq
  on public.expenses (shift_cash_movement_id) where status = 'recorded' and shift_cash_movement_id is not null;
-- Offline retries from the app carry the same id.
create unique index if not exists expenses_client_request_uq
  on public.expenses (tenant_id, client_request_id) where client_request_id is not null;
-- A voided row has at most one replacement (history reads as a chain).
create unique index if not exists expenses_replaces_uq
  on public.expenses (replaces_expense_id) where replaces_expense_id is not null;

-- ============================================
-- 4. expense_receipts
-- ============================================
create table if not exists public.expense_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  expense_id uuid not null references public.expenses(id),
  -- Copied from the expense by trigger (branch-scoped reads).
  outlet_id uuid,
  object_path text not null,
  mime text not null,
  bytes integer not null,
  uploaded_by uuid,
  created_at timestamptz not null default now(),

  constraint expense_receipts_object_path_uq unique (object_path),
  constraint expense_receipts_path_ck check (
    split_part(object_path, '/', 1) = tenant_id::text
    and split_part(object_path, '/', 2) = expense_id::text
    and object_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$'
  ),
  constraint expense_receipts_mime_ck check (mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  constraint expense_receipts_bytes_ck check (bytes > 0 and bytes <= 5242880)
);

comment on table public.expense_receipts is
  'Receipt files for an expense, in the private bucket expense-receipts. Service-role writes only; reads follow the expense.';

create index if not exists expense_receipts_expense_idx on public.expense_receipts (expense_id);

-- ============================================
-- 5. Triggers
-- ============================================

-- 5a. expense_categories: trimmed names; a client never sets or moves a
-- system_key and never moves a row to another store.
create or replace function public.expense_categories_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.system_key is not null then
      raise exception 'Seed categories are created by the store, not by hand' using errcode = '42501';
    end if;
    new.created_at := now();
    return new;
  end if;
  if new.tenant_id is distinct from old.tenant_id
     or new.system_key is distinct from old.system_key
     or new.created_at is distinct from old.created_at then
    raise exception 'A category cannot move to another store or change its seed key' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists expense_categories_guard on public.expense_categories;
create trigger expense_categories_guard
  before insert or update on public.expense_categories
  for each row execute function public.expense_categories_guard();

-- 5b. suppliers: trimmed name, same-store default category, actor stamped.
create or replace function public.suppliers_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  if new.default_category_id is not null and not exists (
    select 1 from public.expense_categories c where c.id = new.default_category_id and c.tenant_id = new.tenant_id
  ) then
    raise exception 'Category belongs to a different store' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'A supplier cannot move to another store' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists suppliers_guard on public.suppliers;
create trigger suppliers_guard
  before insert or update on public.suppliers
  for each row execute function public.suppliers_guard();

-- Who added the supplier, from the JWT (Phase 0 security floor helper).
drop trigger if exists suppliers_stamp_actor on public.suppliers;
create trigger suppliers_stamp_actor
  before insert on public.suppliers
  for each row execute function public.stamp_client_actor('created_by');

-- Nobody rewrites who added a supplier.
create or replace function public.suppliers_keep_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists suppliers_keep_creator on public.suppliers;
create trigger suppliers_keep_creator
  before update on public.suppliers
  for each row execute function public.suppliers_keep_creator();

-- 5c. expenses_10_guard — the append-only rules for client roles.
-- SECURITY INVOKER on purpose: current_user must be the role doing the write.
-- void_expense marks its own UPDATE with the transaction-local setting
-- app.expense_void = <expense id>; nothing else may move a row to 'void'.
create or replace function public.expenses_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_editable constant text[] := array[
    'note', 'supplier_id', 'paid_to_name', 'is_stock_purchase', 'doc_type', 'invoice_no',
    'supplier_tin', 'vat_cents', 'ewt_cents', 'ewt_rate', 'form_2307_given', 'updated_at'
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
    new.created_at := now();
    new.updated_at := now();
    new.void_reason := null;
    new.voided_by := null;
    new.voided_at := null;
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

drop trigger if exists expenses_10_guard on public.expenses;
create trigger expenses_10_guard
  before insert or update or delete on public.expenses
  for each row execute function public.expenses_guard();

-- 5d. expenses_20_drawer_link — a drawer expense sorts a real pay-out.
-- SECURITY INVOKER: the movement is read under the caller's RLS (a movement
-- the caller cannot see is one they may not sort), and current_user tells the
-- service role apart.
create or replace function public.expenses_drawer_link()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  m record;
  v_client boolean := current_user in ('anon', 'authenticated');
begin
  if new.paid_from <> 'drawer' then
    return new;
  end if;
  if new.shift_cash_movement_id is null then
    raise exception 'drawer_movement_required' using errcode = '22023';
  end if;

  select scm.tenant_id, scm.outlet_id, scm.kind, scm.amount, scm.created_at, scm.recorded_by
    into m
    from public.shift_cash_movements scm
   where scm.id = new.shift_cash_movement_id;
  if not found or m.tenant_id <> new.tenant_id then
    raise exception 'Drawer pay-out belongs to a different store' using errcode = '42501';
  end if;
  if m.kind <> 'pay_out' then
    raise exception 'not_a_pay_out' using errcode = '22023';
  end if;
  if round(m.amount * 100) <> new.amount_cents then
    raise exception 'drawer_amount_mismatch' using errcode = '22023';
  end if;

  if v_client and not coalesce((
    -- (a) the person who took the cash out, while they hold pos or expenses
    (m.recorded_by = auth.uid()
      and (public.app_user_has_permission(new.tenant_id, 'pos')
           or public.app_user_has_permission(new.tenant_id, 'expenses')))
    -- (b) whoever keeps the books for that branch (sorting old pay-outs)
    or (public.app_user_has_permission(new.tenant_id, 'expenses')
        and public.app_user_may_reach_branch(new.tenant_id, m.outlet_id))
  ), false) then
    raise exception 'You may not sort this drawer pay-out' using errcode = '42501';
  end if;

  new.outlet_id := m.outlet_id;
  new.spent_on := (m.created_at at time zone 'Asia/Manila')::date;
  new.status := 'recorded';
  new.void_reason := null;
  new.voided_by := null;
  new.voided_at := null;
  return new;
end;
$$;

drop trigger if exists expenses_20_drawer_link on public.expenses;
create trigger expenses_20_drawer_link
  before insert on public.expenses
  for each row execute function public.expenses_drawer_link();

-- 5d'. expenses_25_movement_once — a pay-out is sorted once, ever.
-- A voided drawer expense either had its cash put back (void_expense adds a
-- pay_in) or was re-filed by replace_expense, so its pay-out is NOT unsorted:
-- "unsorted" = a pay_out with no expense row of any status (contract §10).
-- The only new row allowed on a used movement is the replacement of its
-- voided row. SECURITY DEFINER so rows the caller cannot see still count
-- (the partial unique index alone only covers recorded rows).
create or replace function public.expenses_movement_once()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.paid_from <> 'drawer' or new.shift_cash_movement_id is null then
    return new;
  end if;
  if exists (select 1 from public.expenses e where e.shift_cash_movement_id = new.shift_cash_movement_id)
     and not exists (
       select 1 from public.expenses e
        where e.id = new.replaces_expense_id
          and e.shift_cash_movement_id = new.shift_cash_movement_id
          and e.status = 'void'
     ) then
    raise exception 'drawer_payout_already_sorted' using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_25_movement_once on public.expenses;
create trigger expenses_25_movement_once
  before insert on public.expenses
  for each row execute function public.expenses_movement_once();

-- 5e. expenses_30_integrity — same store, the note rule, the date window.
-- SECURITY DEFINER: reads categories/suppliers/branches whatever the caller
-- may see, so "another store's row" and "invisible row" are one answer.
-- current_user is the owner here, so the caller's role is checked in 5c/5d.
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

drop trigger if exists expenses_30_integrity on public.expenses;
create trigger expenses_30_integrity
  before insert or update on public.expenses
  for each row execute function public.expenses_integrity();

-- 5f. Business-date window, client roles only (needs current_user, so it is
-- its own INVOKER trigger). Drawer rows take the pay-out's date in 5d;
-- server importers may backfill older history.
create or replace function public.expenses_spent_on_window()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if current_user not in ('anon', 'authenticated') or new.paid_from = 'drawer' then
    return new;
  end if;
  if new.spent_on > v_today + 1 then
    raise exception 'spent_on_in_future' using errcode = '22023';
  end if;
  if new.spent_on < v_today - 400 then
    raise exception 'spent_on_too_old' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_40_spent_on_window on public.expenses;
create trigger expenses_40_spent_on_window
  before insert on public.expenses
  for each row execute function public.expenses_spent_on_window();

-- 5g. expense_receipts: same store as the expense, branch copied from it.
create or replace function public.expense_receipts_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
begin
  select x.tenant_id, x.outlet_id into e from public.expenses x where x.id = new.expense_id;
  if not found or e.tenant_id <> new.tenant_id then
    raise exception 'Expense belongs to a different store' using errcode = '42501';
  end if;
  new.outlet_id := e.outlet_id;
  return new;
end;
$$;

drop trigger if exists expense_receipts_link on public.expense_receipts;
create trigger expense_receipts_link
  before insert or update on public.expense_receipts
  for each row execute function public.expense_receipts_link();

revoke all on function public.expense_categories_guard() from public, anon, authenticated;
revoke all on function public.suppliers_guard() from public, anon, authenticated;
revoke all on function public.suppliers_keep_creator() from public, anon, authenticated;
revoke all on function public.expenses_guard() from public, anon, authenticated;
revoke all on function public.expenses_drawer_link() from public, anon, authenticated;
revoke all on function public.expenses_movement_once() from public, anon, authenticated;
revoke all on function public.expenses_integrity() from public, anon, authenticated;
revoke all on function public.expenses_spent_on_window() from public, anon, authenticated;
revoke all on function public.expense_receipts_link() from public, anon, authenticated;

-- ============================================
-- 6. Row-level security (authenticated only; anon has no grant at all)
-- ============================================
alter table public.expense_categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_receipts enable row level security;

revoke all on public.expense_categories, public.suppliers, public.expenses, public.expense_receipts
  from public, anon, authenticated;
grant select, insert, update on public.expense_categories, public.suppliers, public.expenses to authenticated;
grant select on public.expense_receipts to authenticated;
grant select, insert, update, delete on public.expense_categories, public.suppliers, public.expenses, public.expense_receipts
  to service_role;

-- Categories: any account of the store reads them (the cashier's drawer
-- sheet needs the list); store-wide `expenses` holders manage them.
drop policy if exists expense_categories_read on public.expense_categories;
create policy expense_categories_read on public.expense_categories for select to authenticated
  using (public.app_user_belongs_to_store(tenant_id));

drop policy if exists expense_categories_insert on public.expense_categories;
create policy expense_categories_insert on public.expense_categories for insert to authenticated
  with check (
    system_key is null
    and public.app_user_has_permission(tenant_id, 'expenses')
    and public.app_user_may_reach_branch(tenant_id, null)
  );

drop policy if exists expense_categories_update on public.expense_categories;
create policy expense_categories_update on public.expense_categories for update to authenticated
  using (public.app_user_has_permission(tenant_id, 'expenses') and public.app_user_may_reach_branch(tenant_id, null))
  with check (public.app_user_has_permission(tenant_id, 'expenses') and public.app_user_may_reach_branch(tenant_id, null));

-- Suppliers: same shape.
drop policy if exists suppliers_read on public.suppliers;
create policy suppliers_read on public.suppliers for select to authenticated
  using (public.app_user_belongs_to_store(tenant_id));

drop policy if exists suppliers_insert on public.suppliers;
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (public.app_user_has_permission(tenant_id, 'expenses') and public.app_user_may_reach_branch(tenant_id, null));

drop policy if exists suppliers_update on public.suppliers;
create policy suppliers_update on public.suppliers for update to authenticated
  using (public.app_user_has_permission(tenant_id, 'expenses') and public.app_user_may_reach_branch(tenant_id, null))
  with check (public.app_user_has_permission(tenant_id, 'expenses') and public.app_user_may_reach_branch(tenant_id, null));

-- Expenses: the book is for `expenses` holders (branch-scoped); a cashier
-- sees the drawer expenses they recorded themselves.
drop policy if exists expenses_read on public.expenses;
create policy expenses_read on public.expenses for select to authenticated
  using (
    (public.app_user_has_permission(tenant_id, 'expenses') and public.app_user_may_reach_branch(tenant_id, outlet_id))
    or (paid_from = 'drawer' and created_by = auth.uid())
  );

-- RLS WITH CHECK runs after the BEFORE triggers: created_by is the caller,
-- and a drawer row's branch is the movement's (5d already checked who).
drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses for insert to authenticated
  with check (
    (paid_from <> 'drawer'
      and public.app_user_has_permission(tenant_id, 'expenses')
      and public.app_user_may_reach_branch(tenant_id, outlet_id))
    or (paid_from = 'drawer'
      and created_by = auth.uid()
      and public.app_user_may_reach_branch(tenant_id, outlet_id)
      and (public.app_user_has_permission(tenant_id, 'pos') or public.app_user_has_permission(tenant_id, 'expenses')))
  );

drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses for update to authenticated
  using (public.app_user_has_permission(tenant_id, 'expenses') and public.app_user_may_reach_branch(tenant_id, outlet_id))
  with check (public.app_user_has_permission(tenant_id, 'expenses') and public.app_user_may_reach_branch(tenant_id, outlet_id));

-- Undo after save: a cashier may void the drawer expense THEY recorded while
-- that drawer's shift is still open (void_expense puts the cash back with a
-- pay_in). WITH CHECK only admits the void, so this policy edits nothing else.
drop policy if exists expenses_void_own_drawer on public.expenses;
create policy expenses_void_own_drawer on public.expenses for update to authenticated
  using (
    paid_from = 'drawer' and status = 'recorded' and created_by = auth.uid()
    and public.app_user_has_permission(tenant_id, 'pos')
    and public.app_user_may_reach_branch(tenant_id, outlet_id)
    and exists (
      select 1 from public.shift_cash_movements m
        join public.staff_shifts s on s.id = m.shift_id
       where m.id = expenses.shift_cash_movement_id and s.status = 'open'
    )
  )
  with check (paid_from = 'drawer' and status = 'void' and created_by = auth.uid());
-- No DELETE policy (and no DELETE grant): void instead.

-- Receipts follow the expense: the subquery runs under the caller's
-- expenses policy. Writes are the service role's (upload route).
drop policy if exists expense_receipts_read on public.expense_receipts;
create policy expense_receipts_read on public.expense_receipts for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_receipts.expense_id));

-- ============================================
-- 7. ensure_expense_categories — the seed list (contract §4)
-- ============================================
-- SECURITY DEFINER: a cashier's first drawer sheet may be the first reader,
-- and seed rows carry a system_key no client may write. Idempotent: every
-- unique conflict (seed key already there, or a live category with the same
-- name the owner made) is skipped, and an archived seed row stays archived.
create or replace function public.ensure_expense_categories(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
begin
  if p_tenant_id is null then
    raise exception 'tenant required' using errcode = '22023';
  end if;
  -- The service role (or a direct server connection, which has no JWT) may
  -- seed any store; a signed-in account only its own.
  if not (
    (auth.uid() is null and coalesce(v_role, 'service_role') = 'service_role')
    or public.app_user_belongs_to_store(p_tenant_id)
  ) then
    raise exception 'Not a member of this store' using errcode = '42501';
  end if;

  insert into public.expense_categories (tenant_id, system_key, name, grp, icon, needs_note, sort_order)
  select p_tenant_id, s.system_key, s.name, s.grp, s.icon, s.needs_note, s.sort_order
    from (values
      -- seed:begin (system_key, name, grp, icon, needs_note, sort_order)
      ('ingredients',       'Ingredients (Palengke)',              'ingredients', 'IN', false,   0),
      ('ice',               'Ice (Yelo)',                          'ingredients', 'IC', false,  10),
      ('drinks',            'Drinks & bar stock',                  'ingredients', 'DR', false,  20),
      ('packaging',         'Packaging (Lalagyan)',                'ingredients', 'PK', false,  30),
      ('wages',             'Salaries & wages (Sahod)',            'staff',       'SW', false,  40),
      ('gov_contributions', 'SSS / PhilHealth / Pag-IBIG',         'staff',       'GC', false,  50),
      ('staff_meals',       'Staff meals & allowances',            'staff',       'SM', false,  60),
      ('thirteenth_month',  '13th month',                          'staff',       '13', false,  70),
      ('rent',              'Rent (Upa)',                          'occupancy',   'RE', false,  80),
      ('electricity',       'Electricity (Kuryente)',              'utilities',   'EL', false,  90),
      ('water',             'Water (Tubig)',                       'utilities',   'WA', false, 100),
      ('lpg',               'Gas / LPG',                           'utilities',   'LP', false, 110),
      ('internet',          'Internet & load',                     'utilities',   'NT', false, 120),
      ('delivery_fees',     'Delivery & rider fees',               'operating',   'DF', false, 130),
      ('platform_fees',     'Platform & payment fees',             'operating',   'PF', false, 140),
      ('transport',         'Transport (Pamasahe)',                'operating',   'TR', false, 150),
      ('cleaning',          'Cleaning & supplies',                 'operating',   'CL', false, 160),
      ('repairs',           'Repairs (Pagawa)',                    'operating',   'RP', false, 170),
      ('marketing',         'Marketing & ads',                     'operating',   'MK', false, 180),
      ('permits',           'Permits & taxes',                     'admin',       'PT', false, 190),
      ('accounting',        'Accountant & software',               'admin',       'AC', false, 200),
      ('bank_charges',      'Bank charges',                        'admin',       'BC', false, 210),
      ('other',             'Other',                               'other',       'OT', true, 220),
      ('equipment',         'Big purchase (equipment)',            'capex',       'EQ', false, 230),
      ('owner_draw',        'Owner took cash (Kinuha ng may-ari)', 'not_expense', 'OW', false, 240),
      ('bank_deposit',      'Bank deposit',                        'not_expense', 'BD', false, 250),
      ('loan_payment',      'Loan payment',                        'not_expense', 'LN', false, 260)
      -- seed:end
    ) as s(system_key, name, grp, icon, needs_note, sort_order)
  on conflict do nothing;
end;
$$;

comment on function public.ensure_expense_categories(uuid) is
  'Seeds the store''s expense categories (contract §4). Idempotent. Store members and the service role only.';

revoke all on function public.ensure_expense_categories(uuid) from public, anon;
grant execute on function public.ensure_expense_categories(uuid) to authenticated, service_role;

-- ============================================
-- Rollback (manual)
-- ============================================
-- drop function if exists public.ensure_expense_categories(uuid);
-- drop table if exists public.expense_receipts;
-- drop table if exists public.expenses;
-- drop table if exists public.suppliers;
-- drop table if exists public.expense_categories;
-- drop function if exists public.expense_receipts_link();
-- drop function if exists public.expenses_spent_on_window();
-- drop function if exists public.expenses_integrity();
-- drop function if exists public.expenses_movement_once();
-- drop function if exists public.expenses_drawer_link();
-- drop function if exists public.expenses_guard();
-- drop function if exists public.suppliers_keep_creator();
-- drop function if exists public.suppliers_guard();
-- drop function if exists public.expense_categories_guard();
