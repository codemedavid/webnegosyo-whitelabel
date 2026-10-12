-- Store activity — the record (Phase 1 of Store Activity & Approvals)
--
-- One append-only feed of the things an owner asks "who did that?" about:
-- cancels, refunds, cash in and out of the drawer, stock written off, prices
-- changed, staff access changed. Every source table keeps its own truth; this
-- table is a READ MODEL fed by triggers (20261012151000) and a one-off
-- backfill (20261012152000), read only through the definer RPCs in
-- 20261012151500. Contract: docs/plans/store-activity/contract.md.
--
-- Shape decisions:
-- * NO foreign keys except tenant_id. subject_ref / actor_user_id / outlet_id
--   are evidence and must survive an order purge, an account deletion or a
--   branch removal — and an FK's SET NULL would be an UPDATE the append-only
--   guard refuses (which would make deleting a user fail).
-- * event_key is the idempotency key: every writer inserts with
--   ON CONFLICT (event_key) DO NOTHING, so a re-run backfill or a replayed
--   trigger never double-reports.
-- * category / kind / flags are CLOSED vocabularies. The kind list lives ONCE,
--   in store_activity_category_of(); the CHECKs below call it. The TS mirror
--   (src/lib/activity/taxonomy.ts) is test-enforced equal to this file.
-- * No grants to anon or authenticated at all. Service role may read/insert;
--   clients read through get_store_activity / get_store_activity_summary.
--
-- Also here (additive): orders.cancel_reason, order_status_events.reason/note.
-- Rollback at end.

-- ============================================
-- Vocabulary (the single source the CHECKs and TS mirror read)
-- ============================================

-- store_activity_category_of: every kind and the category it belongs to.
-- Unknown kind → NULL (refused by store_activity_kind_ck).
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
  end
$$;

-- store_activity_is_routine: kinds readers fold into roll-ups by default.
create or replace function public.store_activity_is_routine(p_kind text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_kind in ('order.placed', 'order.status_changed', 'order.completed', 'payment.charged', 'stock.sale', 'stock.restored', 'loyalty.stamps_earned', 'loyalty.reward_issued')
$$;

-- ============================================
-- Table
-- ============================================
create table if not exists public.store_activity (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  outlet_id uuid,
  occurred_at timestamptz not null default now(),
  category text not null,
  kind text not null,
  is_routine boolean not null default false,
  actor_user_id uuid,
  actor_name text,
  approved_by uuid,
  approved_by_name text,
  amount numeric(14, 2),
  quantity numeric,
  unit text,
  reason text,
  note text,
  subject_type text,
  subject_ref text,
  order_number text,
  backend text,
  external_order_id text,
  before jsonb,
  after jsonb,
  summary jsonb not null default '{}'::jsonb,
  flags text[] not null default '{}'::text[],
  reviewed_by uuid,
  reviewed_by_name text,
  reviewed_at timestamptz,
  source_table text not null,
  source_id text not null,
  event_key text not null,
  created_at timestamptz not null default now(),

  constraint store_activity_event_key_uq unique (event_key),

  -- store_activity_category_ck
  constraint store_activity_category_ck check (category in (
    'orders', 'money', 'cash', 'stock', 'loyalty', 'menu', 'team', 'approvals'
  )),
  -- The kind must be known AND belong to the row's category.
  constraint store_activity_kind_ck check (
    public.store_activity_category_of(kind) is not null
    and category = public.store_activity_category_of(kind)
  ),
  constraint store_activity_routine_ck check (is_routine = public.store_activity_is_routine(kind)),
  -- store_activity_flags_ck
  constraint store_activity_flags_ck check (flags <@ array[
    'paid_then_cancelled', 'cash_refund_noncash_order', 'after_hours', 'drawer_variance',
    'removed_after_kitchen', 'repeat_cancels', 'count_variance', 'duplicate_deduction'
  ]::text[]),
  constraint store_activity_subject_type_ck check (subject_type is null or subject_type in (
    'order', 'ingredient', 'menu_item', 'shift', 'member', 'voucher', 'staff', 'setting', 'approval', 'count', 'transfer'
  )),
  constraint store_activity_backend_ck check (backend is null or backend in ('platform', 'convex', 'supabase')),
  constraint store_activity_summary_object_ck check (jsonb_typeof(summary) = 'object'),
  constraint store_activity_reason_len_ck check (reason is null or length(reason) <= 500),
  constraint store_activity_note_len_ck check (note is null or length(note) <= 1000),
  constraint store_activity_review_consistency_ck check ((reviewed_at is null) = (reviewed_by is null))
);

comment on table public.store_activity is
  'Append-only store activity feed (read model). Fed by triggers + backfill; read via get_store_activity. Contract: docs/plans/store-activity/contract.md.';
comment on column public.store_activity.amount is 'Pesos, signed from the store''s point of view: money out is negative.';
comment on column public.store_activity.summary is 'Display facts incl. title (plain English). NEVER customer PII: masked name / last-3 phone only.';
comment on column public.store_activity.subject_ref is 'Id as text. No FK on purpose: survives the subject''s deletion.';

create index if not exists store_activity_tenant_time_idx
  on public.store_activity (tenant_id, occurred_at desc, id desc);
create index if not exists store_activity_tenant_outlet_time_idx
  on public.store_activity (tenant_id, outlet_id, occurred_at desc, id desc);
create index if not exists store_activity_tenant_actor_time_idx
  on public.store_activity (tenant_id, actor_user_id, occurred_at desc);
create index if not exists store_activity_open_flags_idx
  on public.store_activity (tenant_id, occurred_at desc)
  where flags <> '{}'::text[] and reviewed_at is null;
-- The cancel-streak flag and the repeat lookups ask "this actor's cancels today".
create index if not exists store_activity_tenant_kind_time_idx
  on public.store_activity (tenant_id, kind, occurred_at desc);

alter table public.store_activity enable row level security;
revoke all on public.store_activity from public, anon, authenticated;
grant select, insert on public.store_activity to service_role;

-- ============================================
-- Append-only guard
-- ============================================
-- UPDATE: only the review columns, only once, and only while
-- mark_store_activity_reviewed has set the transaction-local GUC
-- app.store_activity_review = 'on'. DELETE: only the tenant-deletion cascade.
-- Holds for every role, service_role included.
create or replace function public.store_activity_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_review_cols constant text[] := array['reviewed_by', 'reviewed_by_name', 'reviewed_at'];
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.tenants t where t.id = old.tenant_id) then
      return old;
    end if;
    raise exception 'store_activity is append-only' using errcode = '42501';
  end if;

  if coalesce(current_setting('app.store_activity_review', true), '') = 'on'
     and old.reviewed_at is null
     and (to_jsonb(new) - v_review_cols) = (to_jsonb(old) - v_review_cols) then
    return new;
  end if;
  raise exception 'store_activity is append-only' using errcode = '42501';
end;
$$;

drop trigger if exists store_activity_guard on public.store_activity;
create trigger store_activity_guard
  before update or delete on public.store_activity
  for each row execute function public.store_activity_guard();

-- ============================================
-- Small pure helpers (formatting, masking, refs)
-- ============================================

-- '₱1,234.50', '₱185', '-₱300'
create or replace function public.store_activity_peso(p_amount numeric)
returns text
language sql
stable
parallel safe
set search_path = ''
as $$
  select case
    when p_amount is null then null
    else (case when p_amount < 0 then '-' else '' end) || '₱' ||
      case when abs(p_amount) = trunc(abs(p_amount))
        then to_char(abs(p_amount), 'FM999,999,999,990')
        else to_char(abs(p_amount), 'FM999,999,999,990.00')
      end
  end
$$;

-- A quantity without trailing zeros: 5.000 → '5', 0.250 → '0.25'.
create or replace function public.store_activity_qty(p_qty numeric)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when p_qty is null then null
    else regexp_replace(regexp_replace(round(p_qty, 3)::text, '(\.\d*?)0+$', '\1'), '\.$', '')
  end
$$;

-- '+63 917 123 4567' → '•••567'
create or replace function public.store_activity_mask_phone(p_phone text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 3 then null
    else '•••' || right(regexp_replace(p_phone, '\D', '', 'g'), 3)
  end
$$;

-- Customer names are never stored whole: 'Lara Santos' → 'L. S••••'.
-- A "name" holding digits (guests type phone numbers) → last 3 digits only.
create or replace function public.store_activity_mask_name(p_name text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when nullif(btrim(p_name), '') is null then null
    when p_name ~ '\d' then public.store_activity_mask_phone(p_name)
    when cardinality(parts) = 1 then upper(left(parts[1], 1)) || '••••'
    else upper(left(parts[1], 1)) || '. ' || upper(left(parts[cardinality(parts)], 1)) || '••••'
  end
  from (select regexp_split_to_array(btrim(coalesce(p_name, '')), '\s+') as parts) s
$$;

-- Display order number: daily number '#07', else the id's first 8 chars.
create or replace function public.store_activity_order_label(p_daily_number integer, p_ref text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_daily_number is not null and p_daily_number > 0 then '#' || lpad(p_daily_number::text, greatest(2, length(p_daily_number::text)), '0')
    when nullif(btrim(p_ref), '') is not null then '#' || upper(left(btrim(p_ref), 8))
  end
$$;

-- Text → uuid, or NULL when it is not uuid-shaped (Convex ids, junk).
create or replace function public.store_activity_try_uuid(p_text text)
returns uuid
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_text::uuid
  end
$$;

-- order_status_events.backend → store_activity.backend
create or replace function public.store_activity_backend_of(p_event_backend text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_event_backend
    when 'platform_supabase' then 'platform'
    when 'convex' then 'convex'
    when 'tenant_supabase' then 'supabase'
  end
$$;

-- Asia/Manila business day bounds for an instant.
create or replace function public.store_activity_manila_day_start(p_at timestamptz)
returns timestamptz
language sql
immutable
parallel safe
set search_path = ''
as $$
  select (date_trunc('day', p_at at time zone 'Asia/Manila')) at time zone 'Asia/Manila'
$$;

-- ============================================
-- Actor capture
-- ============================================
-- Who did it: the JWT's user (cookie session, app bearer, register). A
-- service-role writer has no JWT; it MAY name the person it acted for with a
-- transaction-local GUC before its write:
--   select set_config('app.actor_user_id', '<uuid>', true);
-- (the manage-staff edge function is the intended first user). Clients cannot
-- spoof it: the GUC is only consulted when auth.uid() is NULL, i.e. never on
-- a signed-in client request.
create or replace function public.store_activity_actor()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    v_uid := public.store_activity_try_uuid(nullif(current_setting('app.actor_user_id', true), ''));
  end if;
  -- Only store accounts act: a signed-in CUSTOMER (customer app session) is
  -- not an actor, so their checkout reads as "Customer", not as a uuid.
  if v_uid is null or not exists (
    select 1 from public.app_users au where au.user_id = v_uid and au.role in ('admin', 'superadmin')
  ) then
    return null;
  end if;
  return v_uid;
end;
$$;

-- The name a report shows: display name, else the email's local part.
create or replace function public.store_activity_actor_name(p_user_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(btrim(coalesce(nullif(btrim(au.display_name), ''), split_part(coalesce(au.email, ''), '@', 1))), '')
  from public.app_users au
  where au.user_id = p_user_id
  limit 1
$$;

-- ============================================
-- Flag rules (ONE function per rule; thresholds per contract)
-- ============================================

-- repeat_cancels: this cancel is the actor's 3rd+ that Manila day.
create or replace function public.store_activity_flag_repeat_cancels(p_tenant_id uuid, p_actor uuid, p_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_actor is not null and (
    select count(*) from public.store_activity a
    where a.tenant_id = p_tenant_id
      and a.actor_user_id = p_actor
      and a.kind = 'order.cancelled'
      and a.occurred_at >= public.store_activity_manila_day_start(p_at)
      and a.occurred_at < public.store_activity_manila_day_start(p_at) + interval '1 day'
  ) + 1 >= 3
$$;

-- drawer_variance: counted cash off expected by ₱100 or more.
create or replace function public.store_activity_flag_drawer_variance(p_closing_count numeric, p_expected_cash numeric)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_closing_count is not null and p_expected_cash is not null
    and abs(p_closing_count - p_expected_cash) >= 100
$$;

-- count_variance: any line of a closed count off its book quantity by >10%
-- (a line counted from zero book stock to something, or vice versa, counts).
create or replace function public.store_activity_flag_count_variance(p_count_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.stock_movements m
    where m.inventory_count_id = p_count_id
      and m.quantity_delta <> 0
      and abs(m.quantity_delta) > 0.10 * abs(coalesce(m.balance_after, 0) - m.quantity_delta)
  )
$$;

-- paid_then_cancelled: money had been taken when the order was cancelled.
create or replace function public.store_activity_flag_paid_then_cancelled(p_amount_paid numeric, p_payment_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_amount_paid, 0) > 0 or coalesce(p_payment_status, '') in ('paid', 'verified')
$$;

-- removed_after_kitchen: a revision removed items once the kitchen had them.
create or replace function public.store_activity_flag_removed_after_kitchen(p_removed jsonb, p_order_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_removed) = 'array' and jsonb_array_length(p_removed) > 0
    and coalesce(p_order_status, '') in ('preparing', 'ready', 'delivered')
$$;

-- cash_refund_noncash_order: refunded in cash, but the order was never paid in cash.
create or replace function public.store_activity_flag_cash_refund_noncash(p_order_id uuid, p_refund_method text, p_refund_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  -- Word match: 'GCash' contains "cash" but is not cash.
  select coalesce(p_refund_method, '') ~* '\mcash\M'
    and exists (
      select 1 from public.order_payments p
      where p.order_id = p_order_id and p.kind = 'charge' and p.id <> p_refund_id
    )
    and not exists (
      select 1 from public.order_payments p
      where p.order_id = p_order_id and p.kind = 'charge' and coalesce(p.payment_method_name, '') ~* '\mcash\M'
    )
$$;

-- duplicate_deduction: the inventory audit BLOCKED a second deduction for an
-- order (copy: "A second stock deduction for this order was blocked").
-- Suspected-but-applied doubles are reported as stock.alert without the flag.
create or replace function public.store_activity_flag_duplicate_deduction(p_outcome text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_outcome, '') = 'duplicate'
$$;

-- Is minute-of-day p_min inside one day's opening window? p_spill = asking
-- about the previous day's overnight tail. Day shape: {open, close, closed}.
create or replace function public.store_activity_in_window(p_day jsonb, p_min integer, p_spill boolean)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_open integer;
  v_close integer;
begin
  if p_day is null or jsonb_typeof(p_day) <> 'object' or coalesce((p_day ->> 'closed')::boolean, false) then
    return false;
  end if;
  v_open := split_part(p_day ->> 'open', ':', 1)::integer * 60 + split_part(p_day ->> 'open', ':', 2)::integer;
  v_close := split_part(p_day ->> 'close', ':', 1)::integer * 60 + split_part(p_day ->> 'close', ':', 2)::integer;
  if v_close <= v_open then
    -- Overnight (close '00:00' = midnight): today from open, tomorrow until close.
    return case when p_spill then p_min < v_close else p_min >= v_open end;
  end if;
  return not p_spill and p_min >= v_open and p_min < v_close;
exception when others then
  return false;
end;
$$;

-- after_hours: only for stores that ENFORCE their hours (owner-affirmed);
-- a branch's own hours win over the store's. Unknown/malformed → false.
create or replace function public.store_activity_is_after_hours(p_tenant_id uuid, p_outlet_id uuid, p_at timestamptz)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_hours jsonb;
  v_tz text;
  v_enforced boolean;
  v_local timestamp;
  v_dow integer;
  v_min integer;
begin
  select t.operating_hours, coalesce(nullif(t.timezone, ''), 'Asia/Manila'), coalesce(t.enforce_operating_hours, false)
    into v_hours, v_tz, v_enforced
  from public.tenants t where t.id = p_tenant_id;
  if not coalesce(v_enforced, false) then
    return false;
  end if;
  if p_outlet_id is not null then
    select coalesce(o.operating_hours, v_hours), coalesce(nullif(o.timezone, ''), v_tz)
      into v_hours, v_tz
    from public.outlets o where o.id = p_outlet_id and o.tenant_id = p_tenant_id;
  end if;
  if v_hours is null or jsonb_typeof(v_hours) <> 'object' then
    return false;
  end if;
  v_local := p_at at time zone v_tz;
  v_dow := extract(dow from v_local)::integer;
  v_min := extract(hour from v_local)::integer * 60 + extract(minute from v_local)::integer;
  if (v_hours -> v_dow::text) is null then
    return false;
  end if;
  if public.store_activity_in_window(v_hours -> v_dow::text, v_min, false)
     or public.store_activity_in_window(v_hours -> ((v_dow + 6) % 7)::text, v_min, true) then
    return false;
  end if;
  return true;
exception when others then
  return false;
end;
$$;

-- ============================================
-- The one writer
-- ============================================
-- Every trigger and the backfill insert through here: category and routine
-- are derived from the kind, the actor's name is snapshotted, after_hours is
-- added for sensitive kinds, and a replay is ignored (ON CONFLICT event_key).
--
-- NEVER raises. The source write (a cancel, a refund, a checkout) has already
-- happened; refusing it because the activity row failed would turn a gap in a
-- report into a stuck counter. Failures go to the Postgres log as WARNINGs —
-- the probe (supabase/probes/20261012150000_store_activity_probe.sql) is what
-- proves the happy paths.
create or replace function public.store_activity_record(
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
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz := coalesce(p_occurred_at, now());
  v_flags text[] := coalesce(p_flags, '{}'::text[]);
  v_sensitive constant text[] := array[
    'order.cancelled', 'order.reopened', 'order.edited', 'order.deleted',
    'refund.issued', 'payment.recorded', 'payment.marked_paid', 'discount.applied',
    'cash.pay_out', 'cash.collected', 'stock.wasted', 'stock.adjusted', 'menu.price_changed'
  ];
begin
  if p_kind = any (v_sensitive)
     and not ('after_hours' = any (v_flags))
     and public.store_activity_is_after_hours(p_tenant_id, p_outlet_id, v_at) then
    v_flags := v_flags || 'after_hours'::text;
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
    round(p_amount, 2), p_quantity, p_unit, left(nullif(btrim(p_reason), ''), 500), left(nullif(btrim(p_note), ''), 1000),
    p_subject_type, p_subject_ref, p_order_number, p_backend, p_external_order_id,
    p_before, p_after, coalesce(p_summary, '{}'::jsonb),
    array(select distinct f from unnest(v_flags) f order by f),
    p_source_table, p_source_id, p_event_key
  )
  on conflict (event_key) do nothing;
exception when others then
  raise warning 'store_activity_record(%, %) failed: % (%)', p_kind, p_event_key, sqlerrm, sqlstate;
end;
$$;

-- ============================================
-- Additive source columns: why an order was cancelled
-- ============================================
-- Optional now; Phase 2 makes the cancel UI require a reason.
alter table public.orders
  add column if not exists cancel_reason text;
alter table public.orders
  drop constraint if exists orders_cancel_reason_len_ck;
alter table public.orders
  add constraint orders_cancel_reason_len_ck check (cancel_reason is null or length(cancel_reason) <= 500);
comment on column public.orders.cancel_reason is 'Why the order was cancelled (optional; read by the store_activity orders trigger).';

alter table public.order_status_events
  add column if not exists reason text,
  add column if not exists note text;
alter table public.order_status_events
  drop constraint if exists order_status_events_reason_len_ck;
alter table public.order_status_events
  add constraint order_status_events_reason_len_ck check (reason is null or length(reason) <= 500);
alter table public.order_status_events
  drop constraint if exists order_status_events_note_len_ck;
alter table public.order_status_events
  add constraint order_status_events_note_len_ck check (note is null or length(note) <= 1000);

-- ============================================
-- Lock the internals: nothing here is callable by clients
-- ============================================
revoke all on function public.store_activity_record(uuid, text, text, text, text, timestamptz, uuid, uuid, text, numeric, numeric, text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, text[]) from public, anon, authenticated;
revoke all on function public.store_activity_actor() from public, anon, authenticated;
revoke all on function public.store_activity_actor_name(uuid) from public, anon, authenticated;
revoke all on function public.store_activity_flag_repeat_cancels(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.store_activity_flag_count_variance(uuid) from public, anon, authenticated;
revoke all on function public.store_activity_flag_cash_refund_noncash(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.store_activity_is_after_hours(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.store_activity_guard() from public, anon, authenticated;

-- ============================================
-- Rollback
-- ============================================
-- alter table public.order_status_events drop constraint if exists order_status_events_note_len_ck;
-- alter table public.order_status_events drop constraint if exists order_status_events_reason_len_ck;
-- alter table public.order_status_events drop column if exists note, drop column if exists reason;
-- alter table public.orders drop constraint if exists orders_cancel_reason_len_ck;
-- alter table public.orders drop column if exists cancel_reason;
-- drop table if exists public.store_activity;
-- drop function if exists public.store_activity_record(uuid, text, text, text, text, timestamptz, uuid, uuid, text, numeric, numeric, text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, text[]);
-- drop function if exists public.store_activity_is_after_hours(uuid, uuid, timestamptz);
-- drop function if exists public.store_activity_in_window(jsonb, integer, boolean);
-- drop function if exists public.store_activity_flag_duplicate_deduction(text);
-- drop function if exists public.store_activity_flag_cash_refund_noncash(uuid, text, uuid);
-- drop function if exists public.store_activity_flag_removed_after_kitchen(jsonb, text);
-- drop function if exists public.store_activity_flag_paid_then_cancelled(numeric, text);
-- drop function if exists public.store_activity_flag_count_variance(uuid);
-- drop function if exists public.store_activity_flag_drawer_variance(numeric, numeric);
-- drop function if exists public.store_activity_flag_repeat_cancels(uuid, uuid, timestamptz);
-- drop function if exists public.store_activity_actor_name(uuid);
-- drop function if exists public.store_activity_actor();
-- drop function if exists public.store_activity_manila_day_start(timestamptz);
-- drop function if exists public.store_activity_backend_of(text);
-- drop function if exists public.store_activity_try_uuid(text);
-- drop function if exists public.store_activity_order_label(integer, text);
-- drop function if exists public.store_activity_mask_phone(text);
-- drop function if exists public.store_activity_mask_name(text);
-- drop function if exists public.store_activity_qty(numeric);
-- drop function if exists public.store_activity_peso(numeric);
-- drop function if exists public.store_activity_guard();
-- drop function if exists public.store_activity_is_routine(text);
-- drop function if exists public.store_activity_category_of(text);
