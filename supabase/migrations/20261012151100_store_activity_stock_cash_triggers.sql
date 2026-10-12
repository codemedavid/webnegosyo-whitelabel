-- Store activity — stock, cash drawer and loyalty triggers
--
--   stock_movements      → stock.received / stock.wasted / stock.adjusted (ad-hoc set). Sale /
--                          void lines are NOT rows (one per ingredient line was the noise); the
--                          order's application is one routine row from inventory_audit_log. Count-session lines and
--                          transfer legs are NOT rows of their own: the count close and the
--                          transfer status rows summarise them (no double-reporting).
--   inventory_counts     → stock.counted on close (count_variance flag)
--   stock_transfers      → stock.transfer_sent / stock.transfer_received
--   stock_alerts         → stock.alert (new alert, or escalation low → out)
--   inventory_audit_log  → NOISE-FILTERED: only rows that say something the movements
--                          don't. outcome 'duplicate' → stock.duplicate_blocked
--                          (duplicate_deduction flag); applied order_sale / order_redeplete /
--                          order_restore → ONE routine stock.sale / stock.restored per order (top
--                          lines + count in summary); 'failed' → stock.alert "stock wasn't
--                          deducted"; applied + is_suspected_duplicate → stock.alert. The
--                          ~82% 'nothing_to_deduct' rows, 'applied' (the movements already
--                          say it) and 'cancelled_first' are ignored.
--   staff_shifts         → shift.opened / shift.closed (drawer_variance flag)
--   shift_cash_movements → cash.pay_in / cash.pay_out / cash.collected
--   loyalty_activity     → loyalty.* (that table is already a trigger-fed read model;
--                          customer_key is a phone and is never copied — subject_ref
--                          is the member's loyalty_balances.id, never phone-derived).


-- Triggers are attached to hot tables: never queue behind a long transaction.
set lock_timeout = '3s';

-- ============================================
-- Actor columns a client writes are stamped from the JWT
-- ============================================
-- staff_shifts / inventory_counts / stock_transfers are written directly by
-- the apps under RLS, so closed_by / sent_by / received_by were whatever the
-- client sent. On a client role (anon / authenticated) any actor column named
-- in TG_ARGV that is being set is overwritten with auth.uid(). Unlike Phase
-- 0's stamp_client_actor this does NOT touch created_at (these tables carry
-- business timestamps the client legitimately supplies, e.g. closed_at).
-- SECURITY INVOKER on purpose: current_user must be the role doing the write.
create or replace function public.store_activity_stamp_client_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_col text;
  v_new jsonb;
  v_old jsonb;
  v_patch jsonb := '{}'::jsonb;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  v_new := to_jsonb(new);
  v_old := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  foreach v_col in array tg_argv loop
    if (v_new ->> v_col) is not null and (v_new -> v_col) is distinct from (v_old -> v_col) then
      v_patch := v_patch || jsonb_build_object(v_col, auth.uid());
    end if;
  end loop;
  if v_patch <> '{}'::jsonb then
    new := jsonb_populate_record(new, v_patch);
  end if;
  return new;
end;
$$;

revoke all on function public.store_activity_stamp_client_actor() from public, anon, authenticated;

drop trigger if exists store_activity_stamp_actor on public.staff_shifts;
create trigger store_activity_stamp_actor
  before insert or update of closed_by on public.staff_shifts
  for each row execute function public.store_activity_stamp_client_actor('closed_by');

drop trigger if exists store_activity_stamp_actor on public.inventory_counts;
create trigger store_activity_stamp_actor
  before insert or update of started_by, closed_by on public.inventory_counts
  for each row execute function public.store_activity_stamp_client_actor('started_by', 'closed_by');

drop trigger if exists store_activity_stamp_actor on public.stock_transfers;
create trigger store_activity_stamp_actor
  before insert or update of created_by, sent_by, received_by on public.stock_transfers
  for each row execute function public.store_activity_stamp_client_actor('created_by', 'sent_by', 'received_by');

-- ============================================
-- Helpers
-- ============================================

-- An ingredient's display name and unit.
create or replace function public.store_activity_ingredient(p_item_id uuid, out o_name text, out o_unit text, out o_cost numeric)
language sql
stable
set search_path = ''
as $$
  select i.name, coalesce(nullif(u.abbreviation, ''), u.name), i.unit_cost
  from public.inventory_items i
  left join public.inventory_units u on u.id = i.stock_unit_id
  where i.id = p_item_id
$$;

-- ============================================
-- stock_movements
-- ============================================
-- Shared by the trigger and the backfill (20261012152000).
create or replace function public.store_activity_capture_stock_movements(r public.stock_movements)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_kind text;
  v_cost numeric;
  v_qty_text text;
  v_label text;
  v_title text;
begin
  v_kind := case
    when r.reason = 'receive' then 'stock.received'
    when r.reason = 'waste' then 'stock.wasted'
    when r.reason = 'stocktake' and r.inventory_count_id is null then 'stock.adjusted'
  end;
  if v_kind is null then
    return;
  end if;

  select * into v_item from public.store_activity_ingredient(r.inventory_item_id);
  v_cost := abs(coalesce(r.quantity_delta, 0)) * coalesce(r.unit_cost, v_item.o_cost, 0);
  v_qty_text := public.store_activity_qty(abs(r.quantity_delta)) || coalesce(' ' || v_item.o_unit, '');
  v_label := case when r.order_id is not null then public.store_activity_platform_order_label(r.tenant_id, r.order_id) end;
  v_title := case v_kind
    when 'stock.received' then 'Received ' || v_qty_text || ' ' || coalesce(v_item.o_name, 'stock')
    when 'stock.wasted' then 'Wrote off ' || v_qty_text || ' ' || coalesce(v_item.o_name, 'stock')
    when 'stock.adjusted' then coalesce(v_item.o_name, 'Stock') || ' set to ' || public.store_activity_qty(r.balance_after)
      || coalesce(' ' || v_item.o_unit, '') || ' (' || case when r.quantity_delta < 0 then '−' else '+' end || v_qty_text || ')'
    when 'stock.sale' then 'Used ' || v_qty_text || ' ' || coalesce(v_item.o_name, 'stock') || coalesce(' for ' || v_label, '')
    else 'Returned ' || v_qty_text || ' ' || coalesce(v_item.o_name, 'stock') || coalesce(' from ' || v_label, '')
  end;

  perform public.store_activity_write(
    p_tenant_id => r.tenant_id, p_kind => v_kind,
    p_event_key => 'stock_movements:' || r.id,
    p_source_table => 'stock_movements', p_source_id => r.id::text, p_occurred_at => r.created_at,
    p_outlet_id => r.outlet_id, p_actor_user_id => coalesce(public.store_activity_actor(), r.created_by),
    p_amount => case v_kind
      when 'stock.received' then -v_cost
      when 'stock.wasted' then -v_cost
      when 'stock.adjusted' then sign(r.quantity_delta) * v_cost
    end,
    p_quantity => r.quantity_delta, p_unit => v_item.o_unit, p_note => r.note,
    p_subject_type => 'ingredient', p_subject_ref => r.inventory_item_id::text, p_order_number => v_label,
    p_external_order_id => r.order_id,
    p_before => case when v_kind = 'stock.adjusted' then jsonb_build_object('quantity', r.balance_after - r.quantity_delta) end,
    p_after => case when v_kind = 'stock.adjusted' then jsonb_build_object('quantity', r.balance_after) end,
    p_summary => jsonb_strip_nulls(jsonb_build_object('title', v_title, 'itemName', v_item.o_name,
      'costPerUnit', coalesce(r.unit_cost, v_item.o_cost))));
  return;
end;
$$;

create or replace function public.store_activity_on_stock_movements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.store_activity_capture_stock_movements(new);
  return null;
exception when others then
  raise warning 'store_activity trigger (stock_movements) failed: % (%)', sqlerrm, sqlstate;
  return null;
end;
$$;

drop trigger if exists store_activity_stock_movements on public.stock_movements;
-- sale / void lines are reported once per order by inventory_audit_log.
create trigger store_activity_stock_movements
  after insert on public.stock_movements
  for each row
  when (new.reason in ('receive', 'waste') or (new.reason = 'stocktake' and new.inventory_count_id is null))
  execute function public.store_activity_on_stock_movements();

-- ============================================
-- inventory_counts (close = one row for the whole count)
-- ============================================
-- Shared by the trigger and the backfill.
create or replace function public.store_activity_capture_inventory_count(r public.inventory_counts)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lines integer;
  v_off integer;
  v_value numeric;
  v_flags text[] := '{}'::text[];
begin
  if r.status <> 'closed' then
    return;
  end if;
  select count(*),
         count(*) filter (where m.quantity_delta <> 0),
         coalesce(sum(m.quantity_delta * coalesce(m.unit_cost, i.unit_cost, 0)), 0)
    into v_lines, v_off, v_value
  from public.stock_movements m
  left join public.inventory_items i on i.id = m.inventory_item_id
  where m.inventory_count_id = r.id;
  if public.store_activity_flag_count_variance(r.id) then
    v_flags := v_flags || 'count_variance'::text;
  end if;

  perform public.store_activity_write(
    p_tenant_id => r.tenant_id, p_kind => 'stock.counted',
    p_event_key => 'inventory_counts:' || r.id || ':closed',
    p_source_table => 'inventory_counts', p_source_id => r.id::text,
    p_occurred_at => coalesce(r.closed_at, now()), p_outlet_id => r.outlet_id,
    p_actor_user_id => coalesce(public.store_activity_actor(), r.closed_by),
    p_amount => v_value, p_quantity => v_lines, p_unit => 'items', p_note => r.note,
    p_subject_type => 'count', p_subject_ref => r.id::text,
    p_summary => jsonb_build_object(
      'title', 'Stock count closed · ' || v_lines || ' items, ' || v_off || ' off',
      'lines', v_lines, 'linesOff', v_off, 'varianceValue', v_value, 'businessDay', r.business_day),
    p_flags => v_flags);
  return;
end;
$$;

create or replace function public.store_activity_on_inventory_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    perform public.store_activity_capture_inventory_count(new);
  end if;
  return null;
exception when others then
  raise warning 'store_activity trigger (inventory_counts) failed: % (%)', sqlerrm, sqlstate;
  return null;
end;
$$;

drop trigger if exists store_activity_inventory_counts on public.inventory_counts;
create trigger store_activity_inventory_counts
  after update of status on public.inventory_counts
  for each row when (old.status is distinct from new.status)
  execute function public.store_activity_on_inventory_counts();

-- ============================================
-- stock_transfers
-- ============================================
create or replace function public.store_activity_on_stock_transfers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_lines integer;
  v_value numeric;
  v_from text;
  v_to text;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return null;
  end if;
  v_kind := case new.status when 'sent' then 'stock.transfer_sent' when 'received' then 'stock.transfer_received' end;
  if v_kind is null then
    return null;
  end if;
  select count(*), coalesce(sum(coalesce(l.received_quantity, l.sent_quantity, 0) * coalesce(l.unit_cost, 0)), 0)
    into v_lines, v_value
  from public.stock_transfer_lines l where l.transfer_id = new.id;
  select o.name into v_from from public.outlets o where o.id = new.from_outlet_id;
  select o.name into v_to from public.outlets o where o.id = new.to_outlet_id;

  perform public.store_activity_write(
    p_tenant_id => new.tenant_id, p_kind => v_kind,
    p_event_key => 'stock_transfers:' || new.id || ':' || new.status,
    p_source_table => 'stock_transfers', p_source_id => new.id::text,
    p_occurred_at => coalesce(case when new.status = 'sent' then new.sent_at else new.received_at end, now()),
    p_outlet_id => case when new.status = 'sent' then new.from_outlet_id else new.to_outlet_id end,
    p_actor_user_id => coalesce(public.store_activity_actor(), case when new.status = 'sent' then new.sent_by else new.received_by end),
    p_amount => v_value, p_quantity => v_lines, p_unit => 'items', p_note => new.note,
    p_subject_type => 'transfer', p_subject_ref => new.id::text,
    p_summary => jsonb_strip_nulls(jsonb_build_object(
      'title', case when new.status = 'sent'
        then 'Sent ' || v_lines || ' items to ' || coalesce(v_to, 'another branch')
        else 'Received ' || v_lines || ' items from ' || coalesce(v_from, 'another branch') end,
      'fromOutlet', v_from, 'toOutlet', v_to)));
  return null;
exception when others then
  raise warning 'store_activity_on_stock_transfers failed: % (%)', sqlerrm, sqlstate;
  return null;
end;
$$;

drop trigger if exists store_activity_stock_transfers on public.stock_transfers;
create trigger store_activity_stock_transfers
  after insert or update of status on public.stock_transfers
  for each row execute function public.store_activity_on_stock_transfers();

-- ============================================
-- stock_alerts
-- ============================================
-- Shared by the trigger and the backfill. p_escalated = the level changed on an open alert.
create or replace function public.store_activity_capture_stock_alert(r public.stock_alerts, p_escalated boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
begin
  select * into v_item from public.store_activity_ingredient(r.inventory_item_id);
  perform public.store_activity_write(
    p_tenant_id => r.tenant_id, p_kind => 'stock.alert',
    p_event_key => 'stock_alerts:' || r.id || ':' || coalesce(r.level, 'alert'),
    p_source_table => 'stock_alerts', p_source_id => r.id::text,
    p_occurred_at => case when p_escalated then now() else r.created_at end,
    p_outlet_id => r.outlet_id, p_quantity => r.quantity, p_unit => v_item.o_unit,
    p_subject_type => 'ingredient', p_subject_ref => r.inventory_item_id::text,
    p_summary => jsonb_strip_nulls(jsonb_build_object(
      'title', coalesce(v_item.o_name, 'An ingredient') || case when r.level = 'out' then ' ran out' else ' is running low' end,
      'itemName', v_item.o_name, 'level', r.level, 'reorderLevel', r.reorder_level)));
  return;
end;
$$;

create or replace function public.store_activity_on_stock_alerts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.store_activity_capture_stock_alert(new, false);
  elsif old.level is distinct from new.level and new.resolved_at is null then
    perform public.store_activity_capture_stock_alert(new, true);
  end if;
  return null;
exception when others then
  raise warning 'store_activity trigger (stock_alerts) failed: % (%)', sqlerrm, sqlstate;
  return null;
end;
$$;

drop trigger if exists store_activity_stock_alerts on public.stock_alerts;
create trigger store_activity_stock_alerts
  after insert or update of level on public.stock_alerts
  for each row execute function public.store_activity_on_stock_alerts();

-- ============================================
-- inventory_audit_log (noise-filtered, see header)
-- ============================================
-- Shared by the trigger and the backfill (20261012152000).
-- The biggest lines of an inventory application: [{name, quantity}] (≤ p_max).
create or replace function public.store_activity_top_lines(p_lines jsonb, p_max integer)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then null else (
    select jsonb_agg(jsonb_build_object('name', t.name, 'quantity', t.qty) order by t.weight desc, t.name)
    from (
      select coalesce(nullif(l ->> 'name', ''), 'Item') as name,
             case when (l ->> 'quantityDelta') ~ '^-?[0-9]+(\.[0-9]+)?$' then (l ->> 'quantityDelta')::numeric end as qty,
             case when (l ->> 'quantityDelta') ~ '^-?[0-9]+(\.[0-9]+)?$' then abs((l ->> 'quantityDelta')::numeric) else 0 end as weight
      from jsonb_array_elements(p_lines) l
      order by 3 desc
      limit greatest(p_max, 0)
    ) t
  ) end
$$;

create or replace function public.store_activity_capture_inventory_audit_log(r public.inventory_audit_log)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := case when r.order_id is not null then public.store_activity_platform_order_label(r.tenant_id, r.order_id) end;
  v_kind text;
  v_title text;
  v_flags text[] := '{}'::text[];
begin
  if r.outcome = 'duplicate' then
    v_kind := 'stock.duplicate_blocked';
    v_title := 'Blocked a second stock deduction' || coalesce(' for ' || v_label, '');
  elsif r.outcome = 'failed' then
    v_kind := 'stock.alert';
    v_title := 'Stock wasn''t deducted' || coalesce(' for ' || v_label, '');
  elsif r.outcome = 'applied' and coalesce(r.is_suspected_duplicate, false) then
    v_kind := 'stock.alert';
    v_title := 'Possible double stock entry' || coalesce(' for ' || v_label, '');
  elsif r.outcome = 'applied' and r.event in ('order_sale', 'order_redeplete') then
    -- ONE routine row per order application (not one per ingredient line).
    v_kind := 'stock.sale';
    v_title := 'Stock used' || coalesce(' for ' || v_label, '');
  elsif r.outcome = 'applied' and r.event = 'order_restore' then
    v_kind := 'stock.restored';
    v_title := 'Stock returned' || coalesce(' from ' || v_label, '');
  else
    return;
  end if;
  if public.store_activity_flag_duplicate_deduction(r.outcome) then
    v_flags := v_flags || 'duplicate_deduction'::text;
  end if;

  perform public.store_activity_write(
    p_tenant_id => r.tenant_id, p_kind => v_kind,
    p_event_key => 'inventory_audit_log:' || r.id,
    p_source_table => 'inventory_audit_log', p_source_id => r.id::text, p_occurred_at => r.created_at,
    p_outlet_id => r.outlet_id, p_actor_user_id => coalesce(public.store_activity_actor(), r.actor_user_id),
    p_quantity => r.movement_count,
    p_note => case when v_kind in ('stock.sale', 'stock.restored') then null else left(r.detail, 1000) end,
    p_subject_type => case when r.order_id is not null then 'order' end, p_subject_ref => r.order_id,
    p_order_number => v_label, p_external_order_id => r.order_id,
    p_summary => jsonb_strip_nulls(jsonb_build_object('title', v_title, 'event', r.event,
      'outcome', r.outcome, 'source', r.source,
      'lineCount', case when jsonb_typeof(r.lines) = 'array' then jsonb_array_length(r.lines) end,
      'lines', public.store_activity_top_lines(r.lines, 5))),
    p_flags => v_flags);
  return;
end;
$$;

create or replace function public.store_activity_on_inventory_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.store_activity_capture_inventory_audit_log(new);
  return null;
exception when others then
  raise warning 'store_activity trigger (inventory_audit_log) failed: % (%)', sqlerrm, sqlstate;
  return null;
end;
$$;

drop trigger if exists store_activity_inventory_audit_log on public.inventory_audit_log;
create trigger store_activity_inventory_audit_log
  after insert on public.inventory_audit_log
  for each row
  when (new.outcome in ('duplicate', 'failed')
     or (new.outcome = 'applied' and (new.is_suspected_duplicate or new.event in ('order_sale', 'order_redeplete', 'order_restore'))))
  execute function public.store_activity_on_inventory_audit_log();

-- ============================================
-- staff_shifts (open / close)
-- ============================================
-- Shared by the trigger and the backfill. p_event: 'opened' | 'closed'.
create or replace function public.store_activity_capture_staff_shift(r public.staff_shifts, p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variance numeric;
  v_flags text[] := '{}'::text[];
begin
  if p_event = 'opened' then
    perform public.store_activity_write(
      p_tenant_id => r.tenant_id, p_kind => 'shift.opened',
      p_event_key => 'staff_shifts:' || r.id || ':opened',
      p_source_table => 'staff_shifts', p_source_id => r.id::text, p_occurred_at => r.opened_at,
      p_outlet_id => r.outlet_id, p_actor_user_id => coalesce(public.store_activity_actor(), r.staff_user_id), p_actor_name => r.staff_name,
      p_subject_type => 'shift', p_subject_ref => r.id::text,
      p_after => jsonb_build_object('openingFloat', r.opening_float),
      p_summary => jsonb_strip_nulls(jsonb_build_object(
        'title', 'Shift opened · float ' || public.store_activity_peso(r.opening_float),
        'drawerName', r.drawer_name, 'openingFloat', r.opening_float)));
    return;
  end if;

  if p_event <> 'closed' or r.status <> 'closed' then
    return;
  end if;
  v_variance := case when r.closing_count is not null and r.expected_cash is not null
    then r.closing_count - r.expected_cash end;
  if public.store_activity_flag_drawer_variance(r.closing_count, r.expected_cash) then
    v_flags := v_flags || 'drawer_variance'::text;
  end if;
  perform public.store_activity_write(
    p_tenant_id => r.tenant_id, p_kind => 'shift.closed',
    p_event_key => 'staff_shifts:' || r.id || ':closed',
    p_source_table => 'staff_shifts', p_source_id => r.id::text, p_occurred_at => coalesce(r.closed_at, now()),
    p_outlet_id => r.outlet_id,
    p_actor_user_id => coalesce(public.store_activity_actor(), r.closed_by, r.staff_user_id),
    p_actor_name => coalesce(r.closed_by_name, r.staff_name),
    p_amount => v_variance, p_note => r.note,
    p_subject_type => 'shift', p_subject_ref => r.id::text,
    p_after => jsonb_build_object('expectedCash', r.expected_cash, 'closingCount', r.closing_count),
    p_summary => jsonb_strip_nulls(jsonb_build_object(
      'title', 'Shift closed · ' || case
        when v_variance is null then 'drawer not counted'
        when v_variance = 0 then 'drawer exact'
        when v_variance < 0 then 'drawer short ' || public.store_activity_peso(-v_variance)
        else 'drawer over ' || public.store_activity_peso(v_variance) end,
      'drawerName', r.drawer_name, 'staffName', r.staff_name,
      'expectedCash', r.expected_cash, 'closingCount', r.closing_count, 'openingFloat', r.opening_float)),
    p_flags => v_flags);
  return;
end;
$$;

create or replace function public.store_activity_on_staff_shifts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.store_activity_capture_staff_shift(new, 'opened');
  elsif new.status = 'closed' and old.status is distinct from 'closed' then
    perform public.store_activity_capture_staff_shift(new, 'closed');
  end if;
  return null;
exception when others then
  raise warning 'store_activity trigger (staff_shifts) failed: % (%)', sqlerrm, sqlstate;
  return null;
end;
$$;

drop trigger if exists store_activity_staff_shifts_insert on public.staff_shifts;
create trigger store_activity_staff_shifts_insert
  after insert on public.staff_shifts
  for each row execute function public.store_activity_on_staff_shifts();

drop trigger if exists store_activity_staff_shifts_close on public.staff_shifts;
create trigger store_activity_staff_shifts_close
  after update of status on public.staff_shifts
  for each row when (old.status is distinct from new.status)
  execute function public.store_activity_on_staff_shifts();

-- ============================================
-- shift_cash_movements
-- ============================================
-- Shared by the trigger and the backfill (20261012152000).
create or replace function public.store_activity_capture_shift_cash_movements(r public.shift_cash_movements)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text := case r.kind
    when 'pay_in' then 'cash.pay_in' when 'pay_out' then 'cash.pay_out' when 'collect' then 'cash.collected' end;
begin
  if v_kind is null then
    return;
  end if;
  perform public.store_activity_write(
    p_tenant_id => r.tenant_id, p_kind => v_kind,
    p_event_key => 'shift_cash_movements:' || r.id,
    p_source_table => 'shift_cash_movements', p_source_id => r.id::text, p_occurred_at => r.created_at,
    p_outlet_id => r.outlet_id, p_actor_user_id => coalesce(public.store_activity_actor(), r.recorded_by), p_actor_name => r.recorded_by_name,
    p_amount => case when r.kind = 'pay_in' then r.amount else -r.amount end,
    p_reason => r.reason,
    p_subject_type => 'shift', p_subject_ref => r.shift_id::text,
    p_summary => jsonb_build_object('title', case r.kind
      when 'pay_in' then 'Added ' || public.store_activity_peso(r.amount) || ' to the drawer'
      when 'pay_out' then 'Took ' || public.store_activity_peso(r.amount) || ' out of the drawer'
      else 'Collected ' || public.store_activity_peso(r.amount) || ' from the drawer' end));
  return;
end;
$$;

create or replace function public.store_activity_on_shift_cash_movements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.store_activity_capture_shift_cash_movements(new);
  return null;
exception when others then
  raise warning 'store_activity trigger (shift_cash_movements) failed: % (%)', sqlerrm, sqlstate;
  return null;
end;
$$;

drop trigger if exists store_activity_shift_cash_movements on public.shift_cash_movements;
create trigger store_activity_shift_cash_movements
  after insert on public.shift_cash_movements
  for each row execute function public.store_activity_on_shift_cash_movements();

-- ============================================
-- loyalty_activity
-- ============================================
-- earn → stamps_earned (routine); correction / reverse → stamps_adjusted;
-- reward_issued → reward_issued (routine); reward_consumed → reward_claimed;
-- reward_voided → reward_voided. redeem (stamps spent; the reward_issued row
-- tells it), reserved / expired / restored / snapshot rows are skipped.
create or replace function public.store_activity_loyalty_kind(p_kind text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_kind
    when 'earn' then 'loyalty.stamps_earned'
    when 'correction' then 'loyalty.stamps_adjusted'
    when 'reverse' then 'loyalty.stamps_adjusted'
    when 'reward_issued' then 'loyalty.reward_issued'
    when 'reward_consumed' then 'loyalty.reward_claimed'
    when 'reward_voided' then 'loyalty.reward_voided'
  end
$$;

-- A reward's plain words: {type:'fixed',amount:50} → '₱50 off'.
create or replace function public.store_activity_reward_label(p_reward jsonb)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_reward is null or jsonb_typeof(p_reward) <> 'object' then null
    when p_reward ->> 'type' = 'fixed' and (p_reward ->> 'amount') ~ '^[0-9]+(\.[0-9]+)?$'
      then public.store_activity_peso((p_reward ->> 'amount')::numeric) || ' off'
    when p_reward ->> 'type' = 'percent' and (p_reward ->> 'amount') ~ '^[0-9]+(\.[0-9]+)?$'
      then public.store_activity_qty((p_reward ->> 'amount')::numeric) || '% off'
    else nullif(btrim(coalesce(p_reward ->> 'label', p_reward ->> 'itemName', p_reward ->> 'name', '')), '')
  end
$$;

-- Shared by the trigger and the backfill (20261012152000).
create or replace function public.store_activity_capture_loyalty_activity(r public.loyalty_activity)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text := public.store_activity_loyalty_kind(r.kind);
  v_unit text;
  v_unit_word text;
  v_member uuid;
  v_label text;
  v_reward text := public.store_activity_reward_label(r.reward_terms -> 'reward');
begin
  if v_kind is null then
    return;
  end if;
  select case when p.earn_mode = 'points' then 'points' else 'stamps' end into v_unit
  from public.loyalty_programs p where p.id = r.program_id;
  v_unit := coalesce(v_unit, 'stamps');
  select b.id into v_member from public.loyalty_balances b
  where b.program_id = r.program_id and b.customer_key = r.customer_key and b.tenant_id = r.tenant_id;
  v_unit_word := case when abs(coalesce(r.delta, 0)) = 1 then rtrim(v_unit, 's') else v_unit end;
  v_label := case
    when r.external_order_id is null then null
    when r.order_backend = 'platform_supabase' then public.store_activity_platform_order_label(r.tenant_id, r.external_order_id)
    else public.store_activity_order_label(null, r.external_order_id) end;

  perform public.store_activity_write(
    p_tenant_id => r.tenant_id, p_kind => v_kind,
    p_event_key => 'loyalty_activity:' || r.id,
    p_source_table => 'loyalty_activity', p_source_id => r.id::text, p_occurred_at => r.occurred_at,
    p_outlet_id => r.outlet_id, p_actor_user_id => coalesce(public.store_activity_actor(), r.actor_id),
    p_quantity => r.delta, p_unit => coalesce(v_unit, 'stamps'), p_note => r.note,
    -- The member's loyalty_balances row id: groups one member's rows without
    -- carrying anything derived from their phone (an unsalted hash of a phone
    -- is reversible by enumeration). No balance row yet → no subject.
    p_subject_type => case when v_member is not null then 'member' end, p_subject_ref => v_member::text,
    p_order_number => v_label,
    p_backend => public.store_activity_backend_of(r.order_backend), p_external_order_id => r.external_order_id,
    p_summary => jsonb_strip_nulls(jsonb_build_object(
      'title', case v_kind
        when 'loyalty.stamps_earned' then 'Earned ' || public.store_activity_qty(r.delta) || ' ' || v_unit_word || coalesce(' on ' || v_label, '')
        when 'loyalty.stamps_adjusted' then case when r.kind = 'reverse' then 'Took back ' else 'Adjusted ' end
          || public.store_activity_qty(abs(coalesce(r.delta, 0))) || ' ' || v_unit_word || coalesce(' on ' || v_label, '')
        when 'loyalty.reward_issued' then 'Reward unlocked' || coalesce(': ' || v_reward, '')
        when 'loyalty.reward_claimed' then 'Reward claimed' || coalesce(': ' || v_reward, '') || coalesce(' on ' || v_label, '')
        else 'Reward voided' || coalesce(': ' || v_reward, '') end,
      'programName', r.program_name, 'reward', v_reward, 'loyaltyKind', r.kind)));
  return;
end;
$$;

create or replace function public.store_activity_on_loyalty_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.store_activity_capture_loyalty_activity(new);
  return null;
exception when others then
  raise warning 'store_activity trigger (loyalty_activity) failed: % (%)', sqlerrm, sqlstate;
  return null;
end;
$$;

drop trigger if exists store_activity_loyalty_activity on public.loyalty_activity;
create trigger store_activity_loyalty_activity
  after insert on public.loyalty_activity
  for each row execute function public.store_activity_on_loyalty_activity();

-- ============================================
-- Lock down
-- ============================================
revoke all on function public.store_activity_ingredient(uuid) from public, anon, authenticated;
revoke all on function public.store_activity_on_stock_movements() from public, anon, authenticated;
revoke all on function public.store_activity_capture_stock_movements(public.stock_movements) from public, anon, authenticated;
revoke all on function public.store_activity_on_inventory_counts() from public, anon, authenticated;
revoke all on function public.store_activity_capture_inventory_count(public.inventory_counts) from public, anon, authenticated;
revoke all on function public.store_activity_on_stock_transfers() from public, anon, authenticated;
revoke all on function public.store_activity_on_stock_alerts() from public, anon, authenticated;
revoke all on function public.store_activity_capture_stock_alert(public.stock_alerts, boolean) from public, anon, authenticated;
revoke all on function public.store_activity_on_inventory_audit_log() from public, anon, authenticated;
revoke all on function public.store_activity_capture_inventory_audit_log(public.inventory_audit_log) from public, anon, authenticated;
revoke all on function public.store_activity_on_staff_shifts() from public, anon, authenticated;
revoke all on function public.store_activity_capture_staff_shift(public.staff_shifts, text) from public, anon, authenticated;
revoke all on function public.store_activity_on_shift_cash_movements() from public, anon, authenticated;
revoke all on function public.store_activity_capture_shift_cash_movements(public.shift_cash_movements) from public, anon, authenticated;
revoke all on function public.store_activity_on_loyalty_activity() from public, anon, authenticated;
revoke all on function public.store_activity_capture_loyalty_activity(public.loyalty_activity) from public, anon, authenticated;

reset lock_timeout;

-- ============================================
-- Rollback
-- ============================================
-- drop trigger if exists store_activity_stamp_actor on public.stock_transfers;
-- drop trigger if exists store_activity_stamp_actor on public.inventory_counts;
-- drop trigger if exists store_activity_stamp_actor on public.staff_shifts;
-- drop function if exists public.store_activity_stamp_client_actor();
-- drop trigger if exists store_activity_loyalty_activity on public.loyalty_activity;
-- drop trigger if exists store_activity_shift_cash_movements on public.shift_cash_movements;
-- drop trigger if exists store_activity_staff_shifts_close on public.staff_shifts;
-- drop trigger if exists store_activity_staff_shifts_insert on public.staff_shifts;
-- drop trigger if exists store_activity_inventory_audit_log on public.inventory_audit_log;
-- drop trigger if exists store_activity_stock_alerts on public.stock_alerts;
-- drop trigger if exists store_activity_stock_transfers on public.stock_transfers;
-- drop trigger if exists store_activity_inventory_counts on public.inventory_counts;
-- drop trigger if exists store_activity_stock_movements on public.stock_movements;
-- drop function if exists public.store_activity_on_loyalty_activity();
-- drop function if exists public.store_activity_capture_loyalty_activity(public.loyalty_activity);
-- drop function if exists public.store_activity_loyalty_kind(text);
-- drop function if exists public.store_activity_reward_label(jsonb);
-- drop function if exists public.store_activity_on_shift_cash_movements();
-- drop function if exists public.store_activity_capture_shift_cash_movements(public.shift_cash_movements);
-- drop function if exists public.store_activity_on_staff_shifts();
-- drop function if exists public.store_activity_capture_staff_shift(public.staff_shifts, text);
-- drop function if exists public.store_activity_on_inventory_audit_log();
-- drop function if exists public.store_activity_capture_inventory_audit_log(public.inventory_audit_log);
-- drop function if exists public.store_activity_on_stock_alerts();
-- drop function if exists public.store_activity_capture_stock_alert(public.stock_alerts, boolean);
-- drop function if exists public.store_activity_on_stock_transfers();
-- drop function if exists public.store_activity_on_inventory_counts();
-- drop function if exists public.store_activity_capture_inventory_count(public.inventory_counts);
-- drop function if exists public.store_activity_on_stock_movements();
-- drop function if exists public.store_activity_top_lines(jsonb, integer);
-- drop function if exists public.store_activity_capture_stock_movements(public.stock_movements);
-- drop function if exists public.store_activity_ingredient(uuid);
