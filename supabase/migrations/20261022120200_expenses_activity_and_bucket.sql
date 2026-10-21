-- Expenses — Store Activity rows + the private receipts bucket (contract §6, §2)
--
-- Store Activity gains a ninth category, `expenses`, with two kinds:
--   expense.recorded  every new expense (a drawer expense also has its
--                     cash.pay_out row from the movement; both are true)
--   expense.voided    recorded -> void. SENSITIVE: after_hours is added when
--                     the store enforces its hours.
-- and a new subject_type `expense`.
--
-- The vocabulary functions and store_activity_write are redefined from their
-- LIVE bodies (pg_get_functiondef, platform DB, 2026-10-21; identical to
-- 20261012150000) with ONLY the additions above. The category and
-- subject_type CHECKs are re-added as strict supersets. store_activity_is_routine
-- is unchanged (neither kind is routine).
--
-- tests/unit/activity/store-activity-taxonomy.test.ts reads the NEWEST
-- migration that defines each of these, so the TS mirror follows this file.
--
-- Rollback at end.

-- store_activity is written by hot triggers: never queue behind a long
-- transaction. The CHECKs are re-added NOT VALID, then validated (~77k rows).
set lock_timeout = '3s';

-- ============================================
-- Vocabulary
-- ============================================
create or replace function public.store_activity_category_of(p_kind text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_kind in ('order.cancelled', 'order.reopened', 'order.edited', 'order.deleted', 'order.placed', 'order.status_changed', 'order.completed') then 'orders'
    when p_kind in ('refund.issued', 'payment.recorded', 'payment.marked_paid', 'payment.proof_approved', 'payment.proof_rejected', 'discount.applied', 'voucher.redeemed', 'voucher.released', 'payment.charged') then 'money'
    when p_kind in ('shift.opened', 'shift.closed', 'cash.pay_in', 'cash.pay_out', 'cash.collected', 'receipt.reprinted') then 'cash'
    when p_kind in ('stock.received', 'stock.wasted', 'stock.counted', 'stock.adjusted', 'stock.transfer_sent', 'stock.transfer_received', 'stock.duplicate_blocked', 'stock.alert', 'stock.sale', 'stock.restored') then 'stock'
    when p_kind in ('loyalty.reward_claimed', 'loyalty.reward_voided', 'loyalty.stamps_adjusted', 'loyalty.program_changed', 'loyalty.stamps_earned', 'loyalty.reward_issued') then 'loyalty'
    when p_kind in ('menu.price_changed', 'menu.availability_changed', 'menu.item_added', 'menu.item_removed') then 'menu'
    when p_kind in ('staff.added', 'staff.removed', 'staff.access_changed', 'settings.changed', 'rules.changed', 'assistant.action_confirmed', 'campaign.status_changed', 'voucher.status_changed') then 'team'
    when p_kind in ('approval.requested', 'approval.approved', 'approval.declined', 'approval.expired', 'approval.withdrawn', 'approval.executed', 'approval.failed') then 'approvals'
    when p_kind in ('expense.recorded', 'expense.voided') then 'expenses'
  end
$$;

revoke all on function public.store_activity_category_of(text) from public, anon, authenticated;

alter table public.store_activity drop constraint if exists store_activity_category_ck;
alter table public.store_activity
  -- store_activity_category_ck
  add constraint store_activity_category_ck check (category in (
    'orders', 'money', 'cash', 'stock', 'loyalty', 'menu', 'team', 'approvals', 'expenses'
  )) not valid;

alter table public.store_activity drop constraint if exists store_activity_subject_type_ck;
alter table public.store_activity
  add constraint store_activity_subject_type_ck check (subject_type is null or subject_type in (
    'order', 'ingredient', 'menu_item', 'shift', 'member', 'voucher', 'staff', 'setting', 'approval', 'count', 'transfer', 'expense'
  )) not valid;

-- Both are strict supersets of what every existing row already passed.
-- NOT VALID + VALIDATE: the scan itself only needs SHARE UPDATE EXCLUSIVE.
-- Applied as ONE transaction the ADD's ACCESS EXCLUSIVE is still held until
-- commit, so the gain is real only when these two lines run separately (as
-- 20261012150500 did); the scan is ~77k narrow rows either way.
alter table public.store_activity validate constraint store_activity_category_ck;
alter table public.store_activity validate constraint store_activity_subject_type_ck;

-- ============================================
-- The writer: expense.voided joins the sensitive kinds
-- ============================================
create or replace function public.store_activity_write(
  p_tenant_id uuid,
  p_kind text,
  p_event_key text,
  p_source_table text,
  p_source_id text,
  p_occurred_at timestamptz default null,
  p_outlet_id uuid default null,
  p_actor_user_id uuid default null,
  p_actor_name text default null,
  p_amount numeric default null,
  p_quantity numeric default null,
  p_unit text default null,
  p_reason text default null,
  p_note text default null,
  p_subject_type text default null,
  p_subject_ref text default null,
  p_order_number text default null,
  p_backend text default null,
  p_external_order_id text default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_summary jsonb default '{}'::jsonb,
  p_flags text[] default '{}'::text[]
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz := coalesce(p_occurred_at, now());
  v_flags text[] := coalesce(p_flags, '{}'::text[]);
  v_summary jsonb := coalesce(p_summary, '{}'::jsonb);
  v_backfill boolean := coalesce(current_setting('app.store_activity_backfill', true), '') = 'on';
  v_written integer;
  v_sensitive constant text[] := array[
    'order.cancelled', 'order.reopened', 'order.edited', 'order.deleted',
    'refund.issued', 'payment.recorded', 'payment.marked_paid', 'discount.applied',
    'cash.pay_out', 'cash.collected', 'stock.wasted', 'stock.adjusted', 'menu.price_changed',
    'expense.voided'
  ];
begin
  if v_backfill then
    v_flags := array_remove(v_flags, 'after_hours');
  elsif p_kind = any (v_sensitive)
     and not ('after_hours' = any (v_flags))
     and public.store_activity_is_after_hours(p_tenant_id, p_outlet_id, v_at) then
    v_flags := v_flags || 'after_hours'::text;
  end if;
  if jsonb_typeof(v_summary -> 'title') = 'string' then
    v_summary := jsonb_set(v_summary, '{title}', to_jsonb(public.store_activity_scrub(v_summary ->> 'title')));
  end if;

  insert into public.store_activity (
    tenant_id, outlet_id, occurred_at, category, kind, is_routine,
    actor_user_id, actor_name, amount, quantity, unit, reason, note,
    subject_type, subject_ref, order_number, backend, external_order_id,
    before, after, summary, flags, source_table, source_id, event_key
  ) values (
    p_tenant_id, p_outlet_id, v_at, public.store_activity_category_of(p_kind), p_kind,
    public.store_activity_is_routine(p_kind),
    p_actor_user_id,
    coalesce(public.store_activity_actor_name(p_actor_user_id), nullif(btrim(p_actor_name), '')),
    round(p_amount, 2), p_quantity, p_unit,
    left(public.store_activity_scrub(nullif(btrim(p_reason), '')), 500),
    left(public.store_activity_scrub(nullif(btrim(p_note), '')), 1000),
    p_subject_type, p_subject_ref, p_order_number, p_backend, p_external_order_id,
    p_before, p_after, v_summary,
    array(select distinct f from unnest(v_flags) f order by f),
    p_source_table, p_source_id, p_event_key
  )
  on conflict (event_key) do nothing;
  get diagnostics v_written = row_count;
  if v_backfill and v_written > 0 then
    -- The backfill batch reports how many rows it actually wrote.
    perform set_config('app.store_activity_written',
      (coalesce(nullif(current_setting('app.store_activity_written', true), ''), '0')::integer + v_written)::text, true);
  end if;
  return v_written > 0;
end;
$$;

revoke all on function public.store_activity_write(uuid, text, text, text, text, timestamptz, uuid, uuid, text, numeric, numeric, text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, text[]) from public, anon, authenticated;

-- ============================================
-- expenses → expense.recorded / expense.voided
-- ============================================
-- One capture per event, shared by both triggers. Titles (contract §6):
--   "Recorded an expense: Gas / LPG ₱1,250"
--   "Voided an expense: Gas / LPG ₱1,250 (wrong category)"
-- amount is signed from the store's point of view: recorded = money out
-- (negative), voided = that money back in the books (positive).
create or replace function public.store_activity_capture_expense(r public.expenses, p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category text;
  v_pesos numeric := r.amount_cents::numeric / 100;
  v_label text;
begin
  select c.name into v_category from public.expense_categories c where c.id = r.category_id;
  v_label := coalesce(v_category, 'Expense') || ' ' || public.store_activity_peso(v_pesos);

  if p_event = 'recorded' then
    perform public.store_activity_write(
      p_tenant_id => r.tenant_id, p_kind => 'expense.recorded',
      p_event_key => 'expenses:recorded:' || r.id,
      p_source_table => 'expenses', p_source_id => r.id::text, p_occurred_at => r.created_at,
      p_outlet_id => r.outlet_id,
      p_actor_user_id => coalesce(public.store_activity_actor(), r.created_by), p_actor_name => r.created_by_name,
      p_amount => -v_pesos,
      p_note => r.note,
      p_subject_type => 'expense', p_subject_ref => r.id::text,
      p_summary => jsonb_strip_nulls(jsonb_build_object(
        'title', 'Recorded an expense: ' || v_label,
        'categoryName', v_category,
        'paidFrom', r.paid_from,
        'spentOn', r.spent_on,
        'replacesExpenseId', r.replaces_expense_id)));
  else
    perform public.store_activity_write(
      p_tenant_id => r.tenant_id, p_kind => 'expense.voided',
      p_event_key => 'expenses:voided:' || r.id,
      p_source_table => 'expenses', p_source_id => r.id::text, p_occurred_at => coalesce(r.voided_at, now()),
      p_outlet_id => r.outlet_id,
      p_actor_user_id => coalesce(public.store_activity_actor(), r.voided_by),
      p_amount => v_pesos,
      p_reason => r.void_reason,
      p_subject_type => 'expense', p_subject_ref => r.id::text,
      p_summary => jsonb_strip_nulls(jsonb_build_object(
        'title', 'Voided an expense: ' || v_label || coalesce(' (' || nullif(btrim(r.void_reason), '') || ')', ''),
        'categoryName', v_category,
        'paidFrom', r.paid_from,
        'spentOn', r.spent_on)));
  end if;
end;
$$;

-- Never blocks the expense: a failure becomes a WARNING, exactly like the
-- shift_cash_movements activity trigger.
create or replace function public.store_activity_on_expenses()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.store_activity_capture_expense(new, 'recorded');
  elsif old.status = 'recorded' and new.status = 'void' then
    perform public.store_activity_capture_expense(new, 'voided');
  end if;
  return null;
exception when others then
  raise warning 'store_activity trigger (expenses) failed: % (%)', sqlerrm, sqlstate;
  return null;
end;
$$;

drop trigger if exists store_activity_expenses_insert on public.expenses;
create trigger store_activity_expenses_insert
  after insert on public.expenses
  for each row execute function public.store_activity_on_expenses();

drop trigger if exists store_activity_expenses_void on public.expenses;
create trigger store_activity_expenses_void
  after update of status on public.expenses
  for each row when (old.status = 'recorded' and new.status = 'void')
  execute function public.store_activity_on_expenses();

revoke all on function public.store_activity_capture_expense(public.expenses, text) from public, anon, authenticated;
revoke all on function public.store_activity_on_expenses() from public, anon, authenticated;

reset lock_timeout;

-- ============================================
-- Receipts bucket: private, no storage.objects policies (service role only)
-- ============================================
-- The upload and signed-link routes check the session, then use the service
-- role — the Senior/PWD ID-photo pattern (20261014160000).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ============================================
-- Rollback (manual)
-- ============================================
-- (Empty the bucket through the Storage API first.)
-- delete from storage.buckets where id = 'expense-receipts';
-- drop trigger if exists store_activity_expenses_void on public.expenses;
-- drop trigger if exists store_activity_expenses_insert on public.expenses;
-- drop function if exists public.store_activity_on_expenses();
-- drop function if exists public.store_activity_capture_expense(public.expenses, text);
-- Then re-create store_activity_write / store_activity_category_of and the
-- two CHECKs from 20261012150000 — only after deleting every row with
-- category 'expenses' or subject_type 'expense' (store_activity_guard allows
-- that only through a tenant deletion, so in practice: leave them).
