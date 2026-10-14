-- Store activity — order & money triggers
--
-- Feeds public.store_activity (20261012150000) from the order side:
--   orders (PLATFORM stores)       → order.placed / cancelled / reopened / completed / status_changed,
--                                     payment.marked_paid / proof_approved / proof_rejected, discount.applied
--   order_status_events (Convex /
--     tenant Supabase stores ONLY) → order.placed / cancelled / reopened / completed / status_changed
--   order_payments                 → payment.charged (routine) / payment.recorded / refund.issued
--   order_revisions                → order.edited
--   voucher_redemptions            → voucher.redeemed / voucher.released (row deleted)
--   order_deletion_audit           → order.deleted / order.reopened (restored)
--   gov_discount_claims (if live)  → discount.applied with summary.statutory = true
--
-- DEDUPE: the two order-status sources are PARTITIONED by backend, never
-- merged. A platform store's status moves are captured from the orders row
-- itself (AFTER UPDATE OF status), with auth.uid() as the actor, so a cancel
-- is recorded however the client got there — the client-side
-- order_status_events writer is best-effort and missed 28% of platform
-- cancels. order_status_events rows with backend = 'platform_supabase' are
-- therefore IGNORED here; only Convex / tenant-Supabase rows (orders that
-- live outside this database) produce activity from that table.
--
-- Every trigger body is wrapped so an activity failure can never refuse the
-- business write: each trigger has exactly ONE exception block around its
-- whole body; the capture functions and store_activity_write have none.


-- Triggers are attached to hot tables: never queue behind a long transaction.
set lock_timeout = '3s';

-- ============================================
-- Shared helpers
-- ============================================

-- The display number of an order living in this database, else the ref's slice.
create or replace function public.store_activity_platform_order_label(p_tenant_id uuid, p_order_ref text)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select public.store_activity_order_label(o.daily_number, o.id::text)
       from public.orders o
      where o.id = public.store_activity_try_uuid(p_order_ref) and o.tenant_id = p_tenant_id),
    public.store_activity_order_label(null, p_order_ref)
  )
$$;

-- Statutory (Senior Citizen / PWD / athlete / medal of valor) discount lines,
-- RA 9994 / RA 10754: recognised by label. They are reported apart so no
-- reader counts them as money lost.
create or replace function public.store_activity_is_statutory_label(p_label text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(p_label, '') ~* '(senior|\mpwd\M|\msc\M|person with disabilit|\mathlete|medal of valor)'
$$;

-- An order's discounts split by origin. Voucher lines are excluded: they are
-- reported by voucher_redemptions (voucher.redeemed) already. discount_total
-- is only the fallback — live rows exist with discount_data.total > 0 and
-- discount_total = 0.
create or replace function public.store_activity_discount_split(p_discount_data jsonb, p_discount_total numeric)
returns table (manual numeric, statutory numeric)
language sql
immutable
set search_path = ''
as $$
  select
    case
      when jsonb_typeof(p_discount_data -> 'lines') = 'array' then coalesce((
        select sum((l ->> 'amount')::numeric) from jsonb_array_elements(p_discount_data -> 'lines') l
        where nullif(l ->> 'voucherId', '') is null and not public.store_activity_is_statutory_label(l ->> 'label')
          and (l ->> 'amount') ~ '^-?[0-9]+(\.[0-9]+)?$'
      ), 0)
      else coalesce(p_discount_total, 0)
    end,
    case
      when jsonb_typeof(p_discount_data -> 'lines') = 'array' then coalesce((
        select sum((l ->> 'amount')::numeric) from jsonb_array_elements(p_discount_data -> 'lines') l
        where public.store_activity_is_statutory_label(l ->> 'label')
          and (l ->> 'amount') ~ '^-?[0-9]+(\.[0-9]+)?$'
      ), 0)
      else 0
    end
$$;

-- Records discount.applied for the growth of each discount bucket between two
-- versions of an order (p_old NULL = a new order). Labels are never copied:
-- manual discount labels carry customer names on live data.
create or replace function public.store_activity_record_order_discounts(
  p_new public.orders, p_old public.orders, p_actor uuid, p_stamp text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new record;
  v_old record;
  v_label text := public.store_activity_order_label(p_new.daily_number, p_new.id::text);
  v_delta numeric;
  v_has_claim boolean := false;
begin
  select * into v_new from public.store_activity_discount_split(p_new.discount_data, p_new.discount_total);
  if p_old.id is null then
    select 0::numeric as manual, 0::numeric as statutory into v_old;
  else
    select * into v_old from public.store_activity_discount_split(p_old.discount_data, p_old.discount_total);
  end if;

  v_delta := coalesce(v_new.manual, 0) - coalesce(v_old.manual, 0);
  if v_delta > 0 then
    perform public.store_activity_write(
      p_tenant_id => p_new.tenant_id, p_kind => 'discount.applied',
      p_event_key => 'orders:' || p_new.id || ':discount:manual:' || p_stamp,
      p_source_table => 'orders', p_source_id => p_new.id::text, p_occurred_at => now(),
      p_outlet_id => p_new.outlet_id, p_actor_user_id => p_actor, p_amount => -v_delta,
      p_subject_type => 'order', p_subject_ref => p_new.id::text, p_order_number => v_label,
      p_backend => 'platform', p_external_order_id => p_new.id::text,
      p_summary => jsonb_build_object('title', 'Discount ' || public.store_activity_peso(v_delta) || ' on ' || v_label,
        'statutory', false, 'orderTotal', p_new.total));
  end if;

  v_delta := coalesce(v_new.statutory, 0) - coalesce(v_old.statutory, 0);
  if v_delta > 0 then
    -- A Senior/PWD claim row already on record for this order reports it.
    if to_regclass('public.gov_discount_claims') is not null then
      execute 'select exists (select 1 from public.gov_discount_claims g where g.tenant_id = $1 and g.backend = ''platform_supabase'' and g.external_order_id = $2)'
        into v_has_claim using p_new.tenant_id, p_new.id::text;
    end if;
    if not v_has_claim then
      perform public.store_activity_write(
        p_tenant_id => p_new.tenant_id, p_kind => 'discount.applied',
        p_event_key => 'orders:' || p_new.id || ':discount:statutory:' || p_stamp,
        p_source_table => 'orders', p_source_id => p_new.id::text, p_occurred_at => now(),
        p_outlet_id => p_new.outlet_id, p_actor_user_id => p_actor, p_amount => -v_delta,
        p_subject_type => 'order', p_subject_ref => p_new.id::text, p_order_number => v_label,
        p_backend => 'platform', p_external_order_id => p_new.id::text,
        p_summary => jsonb_build_object('title', 'Senior/PWD discount ' || public.store_activity_peso(v_delta) || ' on ' || v_label,
          'statutory', true, 'orderTotal', p_new.total));
    end if;
  end if;
end;
$$;

-- Which status move is this? Shared by the orders and order_status_events triggers.
create or replace function public.store_activity_status_kind(p_status text, p_previous text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_status = 'cancelled' then 'order.cancelled'
    when p_previous = 'cancelled' then 'order.reopened'
    when p_status = 'delivered' then 'order.completed'
    else 'order.status_changed'
  end
$$;

-- Plain-English status words for titles.
create or replace function public.store_activity_status_word(p_status text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_status
    when 'pending' then 'pending'
    when 'confirmed' then 'confirmed'
    when 'preparing' then 'preparing'
    when 'ready' then 'ready'
    when 'delivered' then 'completed'
    when 'cancelled' then 'cancelled'
    else coalesce(p_status, 'updated')
  end
$$;

-- ============================================
-- orders (platform stores)
-- ============================================
create or replace function public.store_activity_on_orders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.store_activity_actor();
  v_label text := public.store_activity_order_label(new.daily_number, new.id::text);
  v_customer text := public.store_activity_mask_name(new.customer_name);
  v_stamp text;
  v_kind text;
  v_flags text[] := '{}'::text[];
  v_has_proof boolean;
  v_pay_kind text;
begin
  if tg_op = 'INSERT' then
    perform public.store_activity_write(
      p_tenant_id => new.tenant_id, p_kind => 'order.placed',
      p_event_key => 'orders:' || new.id || ':placed',
      p_source_table => 'orders', p_source_id => new.id::text, p_occurred_at => new.created_at,
      p_outlet_id => new.outlet_id, p_actor_user_id => v_actor, p_amount => new.total,
      p_subject_type => 'order', p_subject_ref => new.id::text, p_order_number => v_label,
      p_backend => 'platform', p_external_order_id => new.id::text,
      p_after => jsonb_build_object('status', new.status, 'paymentStatus', new.payment_status),
      p_summary => jsonb_strip_nulls(jsonb_build_object(
        'title', case when new.source = 'pos' then 'Rang up ' || v_label else 'New order ' || v_label end,
        'customer', v_customer, 'source', new.source, 'orderType', new.order_type)));
    perform public.store_activity_record_order_discounts(new, null, v_actor, 'placed');
    return null;
  end if;

  -- One key per committed version of the row: set_updated_at stamps now().
  v_stamp := to_char(coalesce(new.updated_at, now()) at time zone 'UTC', 'YYYYMMDDHH24MISSUS');

  if new.status is distinct from old.status then
    v_kind := public.store_activity_status_kind(new.status, old.status);
    if v_kind = 'order.cancelled' then
      if public.store_activity_flag_paid_then_cancelled(old.amount_paid, old.payment_status) then
        v_flags := v_flags || 'paid_then_cancelled'::text;
      end if;
      if public.store_activity_flag_repeat_cancels(new.tenant_id, v_actor, now()) then
        v_flags := v_flags || 'repeat_cancels'::text;
      end if;
    end if;
    perform public.store_activity_write(
      p_tenant_id => new.tenant_id, p_kind => v_kind,
      p_event_key => 'orders:' || new.id || ':status:' || new.status || ':' || v_stamp,
      p_source_table => 'orders', p_source_id => new.id::text, p_occurred_at => now(),
      p_outlet_id => new.outlet_id, p_actor_user_id => v_actor,
      p_amount => case when v_kind in ('order.cancelled', 'order.reopened') then new.total end,
      p_reason => case when v_kind = 'order.cancelled' then new.cancel_reason end,
      p_subject_type => 'order', p_subject_ref => new.id::text, p_order_number => v_label,
      p_backend => 'platform', p_external_order_id => new.id::text,
      p_before => jsonb_build_object('status', old.status),
      p_after => jsonb_build_object('status', new.status),
      p_summary => jsonb_strip_nulls(jsonb_build_object(
        'title', case v_kind
          when 'order.cancelled' then v_label || ' cancelled'
          when 'order.reopened' then v_label || ' reopened'
          when 'order.completed' then v_label || ' completed'
          else v_label || ' marked ' || public.store_activity_status_word(new.status) end,
        'customer', v_customer, 'source', new.source,
        'amountPaid', case when v_kind = 'order.cancelled' and coalesce(old.amount_paid, 0) > 0 then old.amount_paid end,
        'paymentMethod', case when v_kind = 'order.cancelled' then new.payment_method_name end)),
      p_flags => v_flags);
  end if;

  if new.payment_status is distinct from old.payment_status then
    v_has_proof := coalesce(new.payment_proof_uploaded_at, old.payment_proof_uploaded_at) is not null
      or nullif(btrim(coalesce(new.payment_proof_reference, old.payment_proof_reference, '')), '') is not null
      or nullif(coalesce(new.payment_proof_url, old.payment_proof_url, ''), '') is not null;
    v_pay_kind := case
      when new.payment_status = 'verified' and v_has_proof then 'payment.proof_approved'
      when new.payment_status in ('paid', 'verified') and coalesce(old.payment_status, '') not in ('paid', 'verified') then 'payment.marked_paid'
      when new.payment_status = 'failed' and v_has_proof then 'payment.proof_rejected'
    end;
    -- A charge just written for this order already tells the story
    -- (Collect payment writes the ledger row, then flips the status).
    if v_pay_kind = 'payment.marked_paid' and exists (
      select 1 from public.order_payments p
      where p.order_id = new.id and p.kind = 'charge' and p.created_at > now() - interval '2 minutes'
    ) then
      v_pay_kind := null;
    end if;
    if v_pay_kind is not null then
      perform public.store_activity_write(
        p_tenant_id => new.tenant_id, p_kind => v_pay_kind,
        p_event_key => 'orders:' || new.id || ':payment:' || new.payment_status || ':' || v_stamp,
        p_source_table => 'orders', p_source_id => new.id::text, p_occurred_at => now(),
        p_outlet_id => new.outlet_id, p_actor_user_id => v_actor,
        p_amount => case when v_pay_kind = 'payment.proof_rejected' then null else new.total end,
        p_subject_type => 'order', p_subject_ref => new.id::text, p_order_number => v_label,
        p_backend => 'platform', p_external_order_id => new.id::text,
        p_before => jsonb_build_object('paymentStatus', old.payment_status),
        p_after => jsonb_build_object('paymentStatus', new.payment_status),
        p_summary => jsonb_strip_nulls(jsonb_build_object(
          'title', case v_pay_kind
            when 'payment.proof_approved' then 'Payment proof approved for ' || v_label
            when 'payment.proof_rejected' then 'Payment proof rejected for ' || v_label
            else v_label || ' marked paid' end,
          'paymentMethod', new.payment_method_name,
          'proofReference', case when new.payment_proof_reference is not null then right(btrim(new.payment_proof_reference), 4) end)));
    end if;
  end if;

  if new.discount_data is distinct from old.discount_data or new.discount_total is distinct from old.discount_total then
    perform public.store_activity_record_order_discounts(new, old, v_actor, v_stamp);
  end if;
  return null;
exception when others then
  raise warning 'store_activity_on_orders failed: % (%)', sqlerrm, sqlstate;
  return null;
end;
$$;

drop trigger if exists store_activity_orders_insert on public.orders;
create trigger store_activity_orders_insert
  after insert on public.orders
  for each row execute function public.store_activity_on_orders();

drop trigger if exists store_activity_orders_update on public.orders;
create trigger store_activity_orders_update
  after update of status, payment_status, discount_data, discount_total on public.orders
  for each row
  when (old.status is distinct from new.status
     or old.payment_status is distinct from new.payment_status
     or old.discount_data is distinct from new.discount_data
     or old.discount_total is distinct from new.discount_total)
  execute function public.store_activity_on_orders();

-- ============================================
-- order_status_events (orders that live OUTSIDE this database)
-- ============================================
-- Shared by the trigger and the backfill (20261012152000).
create or replace function public.store_activity_capture_order_status_events(r public.order_status_events, p_include_platform boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := public.store_activity_order_label(null, r.external_order_id);
  v_previous text := r.previous_status;
  v_kind text;
  v_flags text[] := '{}'::text[];
begin
  -- Platform orders are captured from the orders row (see header). Only the
  -- backfill includes them: their history predates the orders trigger.
  if r.backend = 'platform_supabase' and not p_include_platform then
    return;
  end if;

  if r.event = 'placed' then
    v_kind := 'order.placed';
  else
    if v_previous is null then
      select e.status into v_previous from public.order_status_events e
      where e.tenant_id = r.tenant_id and e.backend = r.backend
        and e.external_order_id = r.external_order_id and e.id <> r.id
        and e.occurred_at <= r.occurred_at
      order by e.occurred_at desc limit 1;
    end if;
    v_kind := public.store_activity_status_kind(r.status, v_previous);
  end if;

  if v_kind = 'order.cancelled' and public.store_activity_flag_repeat_cancels(r.tenant_id, r.actor_user_id, r.occurred_at) then
    v_flags := v_flags || 'repeat_cancels'::text;
  end if;

  perform public.store_activity_write(
    p_tenant_id => r.tenant_id, p_kind => v_kind,
    p_event_key => 'order_status_events:' || r.id,
    p_source_table => 'order_status_events', p_source_id => r.id::text, p_occurred_at => r.occurred_at,
    p_outlet_id => r.outlet_id, p_actor_user_id => r.actor_user_id,
    p_actor_name => split_part(coalesce(r.actor_name, ''), '@', 1),
    p_amount => case when v_kind in ('order.placed', 'order.cancelled', 'order.reopened') then r.order_total end,
    p_reason => r.reason, p_note => r.note,
    p_subject_type => 'order', p_subject_ref => r.external_order_id, p_order_number => v_label,
    p_backend => public.store_activity_backend_of(r.backend), p_external_order_id => r.external_order_id,
    p_before => case when v_previous is not null then jsonb_build_object('status', v_previous) end,
    p_after => jsonb_build_object('status', r.status),
    p_summary => jsonb_strip_nulls(jsonb_build_object(
      'title', case v_kind
        when 'order.placed' then case when r.source = 'pos' then 'Rang up ' || v_label else 'New order ' || v_label end
        when 'order.cancelled' then v_label || ' cancelled'
        when 'order.reopened' then v_label || ' reopened'
        when 'order.completed' then v_label || ' completed'
        else v_label || ' marked ' || public.store_activity_status_word(r.status) end,
      'source', r.source)),
    p_flags => v_flags);
  return;
end;
$$;

create or replace function public.store_activity_on_order_status_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.store_activity_capture_order_status_events(new);
  return null;
exception when others then
  raise warning 'store_activity trigger (order_status_events) failed: % (%)', sqlerrm, sqlstate;
  return null;
end;
$$;

drop trigger if exists store_activity_order_status_events on public.order_status_events;
create trigger store_activity_order_status_events
  after insert on public.order_status_events
  for each row execute function public.store_activity_on_order_status_events();

-- ============================================
-- order_payments
-- ============================================
-- A charge within 10 minutes of the order being placed is the sale itself
-- (routine payment.charged); a later one is a payment collected after the
-- fact (payment.recorded). A refund is always refund.issued.
-- Shared by the trigger and the backfill (20261012152000).
create or replace function public.store_activity_capture_order_payments(r public.order_payments)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_label text;
  v_kind text;
  v_flags text[] := '{}'::text[];
begin
  select o.daily_number, o.created_at, o.outlet_id, o.total into v_order
  from public.orders o where o.id = r.order_id;
  v_label := public.store_activity_order_label(v_order.daily_number, r.order_id::text);

  if r.kind = 'refund' then
    v_kind := 'refund.issued';
    if public.store_activity_flag_cash_refund_noncash(r.order_id, r.payment_method_name, r.id) then
      v_flags := v_flags || 'cash_refund_noncash_order'::text;
    end if;
  elsif v_order.created_at is not null and r.created_at - v_order.created_at <= interval '10 minutes' then
    v_kind := 'payment.charged';
  else
    v_kind := 'payment.recorded';
  end if;

  perform public.store_activity_write(
    p_tenant_id => r.tenant_id, p_kind => v_kind,
    p_event_key => 'order_payments:' || r.id,
    p_source_table => 'order_payments', p_source_id => r.id::text, p_occurred_at => r.created_at,
    p_outlet_id => coalesce(r.outlet_id, v_order.outlet_id),
    p_actor_user_id => coalesce(r.recorded_by, public.store_activity_actor()),
    p_amount => case when r.kind = 'refund' then -r.amount else r.amount end,
    p_note => r.note,
    p_subject_type => 'order', p_subject_ref => r.order_id::text, p_order_number => v_label,
    p_backend => 'platform', p_external_order_id => r.order_id::text,
    p_summary => jsonb_strip_nulls(jsonb_build_object(
      'title', case v_kind
        when 'refund.issued' then 'Refunded ' || public.store_activity_peso(r.amount) || ' on ' || v_label
        else public.store_activity_peso(r.amount) || ' paid on ' || v_label end,
      'paymentMethod', r.payment_method_name,
      'reference', case when r.reference is not null then right(btrim(r.reference), 4) end,
      'orderTotal', v_order.total)),
    p_flags => v_flags);
  return;
end;
$$;

create or replace function public.store_activity_on_order_payments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.store_activity_capture_order_payments(new);
  return null;
exception when others then
  raise warning 'store_activity trigger (order_payments) failed: % (%)', sqlerrm, sqlstate;
  return null;
end;
$$;

drop trigger if exists store_activity_order_payments on public.order_payments;
create trigger store_activity_order_payments
  after insert on public.order_payments
  for each row execute function public.store_activity_on_order_payments();

-- ============================================
-- order_revisions
-- ============================================
-- Items removed = per dish (menuItemId, else name) quantity that went down.
create or replace function public.store_activity_items_removed(p_before jsonb, p_after jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with b as (
    select coalesce(nullif(i ->> 'menuItemId', ''), i ->> 'menuItemName', i ->> 'name') as k,
           max(coalesce(i ->> 'menuItemName', i ->> 'name', 'Item')) as name,
           sum(coalesce((i ->> 'quantity')::numeric, 1)) as qty
    from jsonb_array_elements(case when jsonb_typeof(p_before) = 'array' then p_before else '[]'::jsonb end) i
    group by 1
  ), a as (
    select coalesce(nullif(i ->> 'menuItemId', ''), i ->> 'menuItemName', i ->> 'name') as k,
           sum(coalesce((i ->> 'quantity')::numeric, 1)) as qty
    from jsonb_array_elements(case when jsonb_typeof(p_after) = 'array' then p_after else '[]'::jsonb end) i
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('name', b.name, 'quantity', b.qty - coalesce(a.qty, 0)) order by b.name), '[]'::jsonb)
  from b left join a on a.k = b.k
  where b.qty > coalesce(a.qty, 0)
$$;

-- Shared by the trigger and the backfill (20261012152000).
-- p_history: the backfill only knows the order's CURRENT status, so it cannot
-- tell whether the kitchen had the items at revision time — no flag then.
create or replace function public.store_activity_capture_order_revisions(r public.order_revisions, p_history boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_label text;
  v_removed jsonb;
  v_flags text[] := '{}'::text[];
begin
  select o.daily_number, o.status, o.outlet_id into v_order from public.orders o where o.id = r.order_id;
  v_label := public.store_activity_order_label(v_order.daily_number, r.order_id::text);
  v_removed := public.store_activity_items_removed(r.items_before, r.items_after);
  if not p_history and public.store_activity_flag_removed_after_kitchen(v_removed, v_order.status) then
    v_flags := v_flags || 'removed_after_kitchen'::text;
  end if;

  perform public.store_activity_write(
    p_tenant_id => r.tenant_id, p_kind => 'order.edited',
    p_event_key => 'order_revisions:' || r.id,
    p_source_table => 'order_revisions', p_source_id => r.id::text, p_occurred_at => r.created_at,
    p_outlet_id => coalesce(r.outlet_id, v_order.outlet_id),
    p_actor_user_id => coalesce(r.revised_by, public.store_activity_actor()),
    p_amount => coalesce(r.total_after, 0) - coalesce(r.total_before, 0),
    p_reason => r.reason,
    p_subject_type => 'order', p_subject_ref => r.order_id::text, p_order_number => v_label,
    p_backend => 'platform', p_external_order_id => r.order_id::text,
    p_before => jsonb_build_object('total', r.total_before),
    p_after => jsonb_build_object('total', r.total_after),
    p_summary => jsonb_strip_nulls(jsonb_build_object(
      'title', v_label || ' edited · ' || public.store_activity_peso(r.total_before) || ' → ' || public.store_activity_peso(r.total_after),
      'revision', r.revision_number,
      'removed', case when jsonb_array_length(v_removed) > 0 then v_removed end,
      'orderStatus', v_order.status)),
    p_flags => v_flags);
  return;
end;
$$;

create or replace function public.store_activity_on_order_revisions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.store_activity_capture_order_revisions(new);
  return null;
exception when others then
  raise warning 'store_activity trigger (order_revisions) failed: % (%)', sqlerrm, sqlstate;
  return null;
end;
$$;

drop trigger if exists store_activity_order_revisions on public.order_revisions;
create trigger store_activity_order_revisions
  after insert on public.order_revisions
  for each row execute function public.store_activity_on_order_revisions();

-- ============================================
-- voucher_redemptions (insert = redeemed, delete = released)
-- ============================================
-- Shared by the trigger and the backfill.
create or replace function public.store_activity_capture_voucher_redemption(v_row public.voucher_redemptions, v_released boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_label text;
begin
  select v.code into v_code from public.vouchers v where v.id = v_row.voucher_id;
  v_label := public.store_activity_platform_order_label(v_row.tenant_id, v_row.order_id);

  perform public.store_activity_write(
    p_tenant_id => v_row.tenant_id,
    p_kind => case when v_released then 'voucher.released' else 'voucher.redeemed' end,
    p_event_key => 'voucher_redemptions:' || v_row.id || case when v_released then ':released' else '' end,
    p_source_table => 'voucher_redemptions', p_source_id => v_row.id::text,
    p_occurred_at => case when v_released then now() else v_row.created_at end,
    p_outlet_id => v_row.outlet_id,
    p_actor_user_id => case when v_released then public.store_activity_actor() else coalesce(v_row.redeemed_by, public.store_activity_actor()) end,
    p_amount => case when v_released then v_row.amount_discounted else -v_row.amount_discounted end,
    p_subject_type => 'voucher', p_subject_ref => v_row.voucher_id::text, p_order_number => v_label,
    p_external_order_id => v_row.order_id,
    p_summary => jsonb_strip_nulls(jsonb_build_object(
      'title', case when v_released
        then 'Voucher ' || coalesce(v_code, '') || ' released from ' || coalesce(v_label, 'an order')
        else 'Voucher ' || coalesce(v_code, '') || ' used on ' || coalesce(v_label, 'an order') end,
      'code', v_code, 'channel', v_row.channel, 'orderRef', v_row.order_id)));
  return;
end;
$$;

create or replace function public.store_activity_on_voucher_redemptions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.store_activity_capture_voucher_redemption(old, true);
  else
    perform public.store_activity_capture_voucher_redemption(new, false);
  end if;
  return null;
exception when others then
  raise warning 'store_activity trigger (voucher_redemptions) failed: % (%)', sqlerrm, sqlstate;
  return null;
end;
$$;

drop trigger if exists store_activity_voucher_redemptions on public.voucher_redemptions;
create trigger store_activity_voucher_redemptions
  after insert or delete on public.voucher_redemptions
  for each row execute function public.store_activity_on_voucher_redemptions();

-- ============================================
-- order_deletion_audit (bulk delete / purge / restore of orders)
-- ============================================
-- Shared by the trigger and the backfill (20261012152000).
create or replace function public.store_activity_capture_order_deletion_audit(r public.order_deletion_audit)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count numeric;
begin
  if r.action not in ('deleted', 'purged', 'restored') then
    return;
  end if;
  v_count := case r.action
    when 'deleted' then nullif(r.detail ->> 'deleted', '')::numeric
    when 'purged' then nullif(r.detail ->> 'orders', '')::numeric
    else nullif(r.detail ->> 'restored', '')::numeric
  end;
  perform public.store_activity_write(
    p_tenant_id => r.tenant_id,
    p_kind => case when r.action = 'restored' then 'order.reopened' else 'order.deleted' end,
    p_event_key => 'order_deletion_audit:' || r.id,
    p_source_table => 'order_deletion_audit', p_source_id => r.id::text, p_occurred_at => r.created_at,
    p_actor_user_id => r.actor_id, p_quantity => v_count, p_unit => 'orders',
    p_amount => case when r.action = 'deleted' then nullif(r.detail ->> 'total', '')::numeric end,
    p_subject_type => 'order', p_subject_ref => r.deletion_id::text,
    p_summary => jsonb_strip_nulls(jsonb_build_object(
      'title', case r.action
        when 'deleted' then 'Deleted ' || coalesce(v_count::text, 'some') || ' orders'
        when 'purged' then 'Permanently removed ' || coalesce(v_count::text, 'some') || ' deleted orders'
        else 'Restored ' || coalesce(v_count::text, 'some') || ' deleted orders' end,
      'action', r.action, 'scope', r.detail -> 'scope')));
  return;
end;
$$;

create or replace function public.store_activity_on_order_deletion_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.store_activity_capture_order_deletion_audit(new);
  return null;
exception when others then
  raise warning 'store_activity trigger (order_deletion_audit) failed: % (%)', sqlerrm, sqlstate;
  return null;
end;
$$;

drop trigger if exists store_activity_order_deletion_audit on public.order_deletion_audit;
create trigger store_activity_order_deletion_audit
  after insert on public.order_deletion_audit
  for each row execute function public.store_activity_on_order_deletion_audit();

-- ============================================
-- gov_discount_claims (statutory Senior/PWD claims, every backend)
-- ============================================
-- The table ships from another migration track and may be absent where this
-- file runs, so the trigger function reads NEW as jsonb and the trigger is
-- only created when the table exists. Never copies claimant_name / id_number.
-- NOTE for the gov-discounts migration track: if gov_discount_claims is created
-- (or re-created) AFTER this file ran, that migration must attach the trigger:
--   create trigger store_activity_gov_discount_claims after insert on public.gov_discount_claims
--     for each row execute function public.store_activity_on_gov_discount_claims();
-- (live today: the table exists, so the DO block below attaches it).
create or replace function public.store_activity_on_gov_discount_claims()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb := to_jsonb(new);
  v_tenant uuid := (v ->> 'tenant_id')::uuid;
  v_backend text := v ->> 'backend';
  v_order text := v ->> 'external_order_id';
  v_reversed boolean := (v ->> 'event') = 'reversed';
  v_amount numeric := coalesce(nullif(v ->> 'reduction', '')::numeric, nullif(v ->> 'discount', '')::numeric, 0);
  v_label text;
  v_kind_word text := case v ->> 'kind'
    when 'senior' then 'Senior' when 'pwd' then 'PWD' when 'athlete' then 'Athlete'
    when 'medal_of_valor' then 'Medal of Valor' else 'Statutory' end;
begin
  v_label := coalesce(nullif(v ->> 'order_label', ''),
    case when v_backend = 'platform_supabase' then public.store_activity_platform_order_label(v_tenant, v_order)
         else public.store_activity_order_label(null, v_order) end);
  -- An orders-trigger statutory row for the same platform order already reported it.
  if not v_reversed and v_backend = 'platform_supabase' and exists (
    select 1 from public.store_activity a
    where a.tenant_id = v_tenant and a.source_table = 'orders' and a.subject_ref = v_order
      and a.kind = 'discount.applied' and (a.summary ->> 'statutory') = 'true'
  ) then
    return null;
  end if;

  perform public.store_activity_write(
    p_tenant_id => v_tenant, p_kind => 'discount.applied',
    p_event_key => 'gov_discount_claims:' || (v ->> 'id'),
    p_source_table => 'gov_discount_claims', p_source_id => v ->> 'id',
    p_occurred_at => coalesce(nullif(v ->> 'occurred_at', '')::timestamptz, now()),
    p_outlet_id => nullif(v ->> 'outlet_id', '')::uuid,
    p_actor_user_id => nullif(v ->> 'granted_by', '')::uuid,
    p_actor_name => v ->> 'granted_by_name',
    p_amount => case when v_reversed then v_amount else -v_amount end,
    p_subject_type => 'order', p_subject_ref => v_order, p_order_number => v_label,
    p_backend => public.store_activity_backend_of(v_backend), p_external_order_id => v_order,
    p_summary => jsonb_strip_nulls(jsonb_build_object(
      'title', v_kind_word || ' discount ' || case when v_reversed then 'removed from ' else 'on ' end || v_label,
      'statutory', true, 'discountKind', v ->> 'kind', 'reversed', v_reversed,
      'approvedByName', v ->> 'approved_by_name')));
  return null;
exception when others then
  raise warning 'store_activity_on_gov_discount_claims failed: % (%)', sqlerrm, sqlstate;
  return null;
end;
$$;

do $$
begin
  if to_regclass('public.gov_discount_claims') is not null then
    execute 'drop trigger if exists store_activity_gov_discount_claims on public.gov_discount_claims';
    execute 'create trigger store_activity_gov_discount_claims after insert on public.gov_discount_claims
             for each row execute function public.store_activity_on_gov_discount_claims()';
  end if;
end;
$$;

-- ============================================
-- Lock down
-- ============================================
revoke all on function public.store_activity_record_order_discounts(public.orders, public.orders, uuid, text) from public, anon, authenticated;
revoke all on function public.store_activity_on_orders() from public, anon, authenticated;
revoke all on function public.store_activity_on_order_status_events() from public, anon, authenticated;
revoke all on function public.store_activity_capture_order_status_events(public.order_status_events, boolean) from public, anon, authenticated;
revoke all on function public.store_activity_on_order_payments() from public, anon, authenticated;
revoke all on function public.store_activity_capture_order_payments(public.order_payments) from public, anon, authenticated;
revoke all on function public.store_activity_on_order_revisions() from public, anon, authenticated;
revoke all on function public.store_activity_capture_order_revisions(public.order_revisions, boolean) from public, anon, authenticated;
revoke all on function public.store_activity_on_voucher_redemptions() from public, anon, authenticated;
revoke all on function public.store_activity_capture_voucher_redemption(public.voucher_redemptions, boolean) from public, anon, authenticated;
revoke all on function public.store_activity_on_order_deletion_audit() from public, anon, authenticated;
revoke all on function public.store_activity_capture_order_deletion_audit(public.order_deletion_audit) from public, anon, authenticated;
revoke all on function public.store_activity_on_gov_discount_claims() from public, anon, authenticated;
revoke all on function public.store_activity_platform_order_label(uuid, text) from public, anon, authenticated;

reset lock_timeout;

-- ============================================
-- Rollback
-- ============================================
-- drop trigger if exists store_activity_gov_discount_claims on public.gov_discount_claims;
-- drop trigger if exists store_activity_order_deletion_audit on public.order_deletion_audit;
-- drop trigger if exists store_activity_voucher_redemptions on public.voucher_redemptions;
-- drop trigger if exists store_activity_order_revisions on public.order_revisions;
-- drop trigger if exists store_activity_order_payments on public.order_payments;
-- drop trigger if exists store_activity_order_status_events on public.order_status_events;
-- drop trigger if exists store_activity_orders_update on public.orders;
-- drop trigger if exists store_activity_orders_insert on public.orders;
-- drop function if exists public.store_activity_on_gov_discount_claims();
-- drop function if exists public.store_activity_on_order_deletion_audit();
-- drop function if exists public.store_activity_capture_order_deletion_audit(public.order_deletion_audit);
-- drop function if exists public.store_activity_on_voucher_redemptions();
-- drop function if exists public.store_activity_capture_voucher_redemption(public.voucher_redemptions, boolean);
-- drop function if exists public.store_activity_on_order_revisions();
-- drop function if exists public.store_activity_capture_order_revisions(public.order_revisions, boolean);
-- drop function if exists public.store_activity_items_removed(jsonb, jsonb);
-- drop function if exists public.store_activity_on_order_payments();
-- drop function if exists public.store_activity_capture_order_payments(public.order_payments);
-- drop function if exists public.store_activity_on_order_status_events();
-- drop function if exists public.store_activity_capture_order_status_events(public.order_status_events, boolean);
-- drop function if exists public.store_activity_on_orders();
-- drop function if exists public.store_activity_status_word(text);
-- drop function if exists public.store_activity_status_kind(text, text);
-- drop function if exists public.store_activity_record_order_discounts(public.orders, public.orders, uuid, text);
-- drop function if exists public.store_activity_discount_split(jsonb, numeric);
-- drop function if exists public.store_activity_is_statutory_label(text);
-- drop function if exists public.store_activity_platform_order_label(uuid, text);
