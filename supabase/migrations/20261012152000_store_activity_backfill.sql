-- Store activity — history backfill, as a RESUMABLE BATCHED FUNCTION
--
-- This migration only CREATES public.store_activity_backfill_batch(); it writes
-- no rows. History is replayed afterwards, one bounded batch per call (= one
-- short transaction per call), through the SAME capture functions the live
-- triggers use, so history rows read exactly like live ones.
--
-- Idempotent: every capture inserts with ON CONFLICT (event_key) DO NOTHING
-- under the deterministic key the trigger would have used, so a batch that is
-- re-run, or a source replayed after the triggers went live, never duplicates.
--
-- RUN LOOP (service role; e.g. one Supabase MCP execute_sql per call):
--   select * from public.store_activity_backfill_batch('<source>');                 -- first batch
--   select * from public.store_activity_backfill_batch('<source>', '<next_ts>', '<next_id>');
--   ... repeat with the returned next_ts / next_id until done = true.
-- Sources, in this order (oldest-first within each; order matters only for
-- order_status_events, whose repeat_cancels flag counts earlier cancels):
--   order_status_events, orders_cancelled, order_payments, order_revisions,
--   voucher_redemptions, order_deletion_audit, stock_movements,
--   inventory_audit_log, inventory_counts, stock_alerts, staff_shifts_opened,
--   staff_shifts_closed, shift_cash_movements, loyalty_activity
-- Each call returns (next_ts, next_id, rows_scanned, rows_written, done).
-- A failing batch raises (and rolls back only itself) with the cursor it
-- started from, so the loop can stop, fix, and resume from that cursor.
--
-- Windows:
--   order_status_events   all (table starts 2026-09-20). Platform rows ONLY up to the moment
--                         the orders trigger took over (first live store_activity row sourced
--                         from 'orders'), after which the orders trigger is the source.
--   orders_cancelled      platform cancels since 2026-07-01 with NO order_status_events cancel
--                         (the 28% the client writer missed); occurred_at = updated_at
--                         (approximate, summary.approximateTime), actor unknown.
--   order_payments        since 2026-07-01
--   stock_movements       receive / waste / ad-hoc stocktake only — sale / void lines are NOT
--                         replayed (one row per ingredient line was the noise); the per-order
--                         routine row comes from inventory_audit_log.
--   inventory_audit_log   duplicate / failed / suspected, plus applied order_sale /
--                         order_redeplete / order_restore (one routine row per order)
--   everything else       all rows.
--
-- Flags on history: the batch sets app.store_activity_backfill = 'on', which makes the
-- writer skip after_hours (today's hours say nothing about last month) and the revision
-- capture skip removed_after_kitchen (only the order's CURRENT status is known).
-- paid_then_cancelled is set on recovered platform cancels when the order still holds
-- money; repeat_cancels is computed from the replayed history.
-- NOT backfilled: platform order.placed / status moves before 2026-09-20 (no source), and
-- menu / team / settings changes (never logged before this feature).

create or replace function public.store_activity_backfill_batch(
  p_source text,
  p_after_ts timestamptz default null,
  p_after_id text default null,
  p_limit integer default 2000
)
returns table (next_ts timestamptz, next_id text, rows_scanned integer, rows_written integer, done boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 2000), 1), 5000);
  v_ts timestamptz := coalesce(p_after_ts, '-infinity'::timestamptz);
  v_id text := coalesce(p_after_id, '');
  v_scanned integer := 0;
  v_last_ts timestamptz := p_after_ts;
  v_last_id text := p_after_id;
  v_cutoff timestamptz;
  v_ose public.order_status_events;
  v_order public.orders;
  v_pay public.order_payments;
  v_rev public.order_revisions;
  v_vr public.voucher_redemptions;
  v_del public.order_deletion_audit;
  v_sm public.stock_movements;
  v_ial public.inventory_audit_log;
  v_cnt public.inventory_counts;
  v_alert public.stock_alerts;
  v_shift public.staff_shifts;
  v_cash public.shift_cash_movements;
  v_loy public.loyalty_activity;
  v_label text;
begin
  perform set_config('app.store_activity_backfill', 'on', true);
  perform set_config('app.store_activity_written', '0', true);

  -- ONE exception block for the whole batch (no per-row subtransactions).
  begin
    case p_source
    when 'order_status_events' then
      v_cutoff := coalesce(
        (select min(a.created_at) from public.store_activity a
          where a.source_table = 'orders' and a.event_key not like '%:backfill'),
        now());
      for v_ose in
        select * from public.order_status_events e
        where (e.created_at, e.id::text) > (v_ts, v_id)
          and (e.backend <> 'platform_supabase' or e.created_at < v_cutoff)
        order by e.created_at, e.id::text limit v_limit
      loop
        perform public.store_activity_capture_order_status_events(v_ose, true);
        v_scanned := v_scanned + 1; v_last_ts := v_ose.created_at; v_last_id := v_ose.id::text;
      end loop;

    when 'orders_cancelled' then
      for v_order in
        select * from public.orders o
        where (o.updated_at, o.id::text) > (v_ts, v_id)
          and o.status = 'cancelled' and o.updated_at >= '2026-07-01'
        order by o.updated_at, o.id::text limit v_limit
      loop
        v_scanned := v_scanned + 1; v_last_ts := v_order.updated_at; v_last_id := v_order.id::text;
        continue when exists (
          select 1 from public.order_status_events e
          where e.tenant_id = v_order.tenant_id and e.backend = 'platform_supabase'
            and e.external_order_id = v_order.id::text and e.status = 'cancelled')
        or exists (
          select 1 from public.store_activity a
          where a.tenant_id = v_order.tenant_id and a.subject_type = 'order'
            and a.subject_ref = v_order.id::text and a.kind = 'order.cancelled');
        v_label := public.store_activity_order_label(v_order.daily_number, v_order.id::text);
        perform public.store_activity_write(
          p_tenant_id => v_order.tenant_id, p_kind => 'order.cancelled',
          p_event_key => 'orders:' || v_order.id || ':status:cancelled:backfill',
          p_source_table => 'orders', p_source_id => v_order.id::text, p_occurred_at => v_order.updated_at,
          p_outlet_id => v_order.outlet_id, p_amount => v_order.total, p_reason => v_order.cancel_reason,
          p_subject_type => 'order', p_subject_ref => v_order.id::text, p_order_number => v_label,
          p_backend => 'platform', p_external_order_id => v_order.id::text,
          p_after => jsonb_build_object('status', 'cancelled'),
          p_summary => jsonb_strip_nulls(jsonb_build_object(
            'title', v_label || ' cancelled',
            'customer', public.store_activity_mask_name(v_order.customer_name),
            'source', v_order.source, 'approximateTime', true,
            'amountPaid', case when coalesce(v_order.amount_paid, 0) > 0 then v_order.amount_paid end)),
          p_flags => case when coalesce(v_order.amount_paid, 0) > 0 then array['paid_then_cancelled'] else '{}'::text[] end);
      end loop;

    when 'order_payments' then
      for v_pay in
        select * from public.order_payments p
        where (p.created_at, p.id::text) > (v_ts, v_id) and p.created_at >= '2026-07-01'
        order by p.created_at, p.id::text limit v_limit
      loop
        perform public.store_activity_capture_order_payments(v_pay);
        v_scanned := v_scanned + 1; v_last_ts := v_pay.created_at; v_last_id := v_pay.id::text;
      end loop;

    when 'order_revisions' then
      for v_rev in
        select * from public.order_revisions r
        where (r.created_at, r.id::text) > (v_ts, v_id)
        order by r.created_at, r.id::text limit v_limit
      loop
        perform public.store_activity_capture_order_revisions(v_rev, true);
        v_scanned := v_scanned + 1; v_last_ts := v_rev.created_at; v_last_id := v_rev.id::text;
      end loop;

    when 'voucher_redemptions' then
      for v_vr in
        select * from public.voucher_redemptions v
        where (v.created_at, v.id::text) > (v_ts, v_id)
        order by v.created_at, v.id::text limit v_limit
      loop
        perform public.store_activity_capture_voucher_redemption(v_vr, false);
        v_scanned := v_scanned + 1; v_last_ts := v_vr.created_at; v_last_id := v_vr.id::text;
      end loop;

    when 'order_deletion_audit' then
      for v_del in
        select * from public.order_deletion_audit d
        where (d.created_at, d.id::text) > (v_ts, v_id)
        order by d.created_at, d.id::text limit v_limit
      loop
        perform public.store_activity_capture_order_deletion_audit(v_del);
        v_scanned := v_scanned + 1; v_last_ts := v_del.created_at; v_last_id := v_del.id::text;
      end loop;

    when 'stock_movements' then
      for v_sm in
        select * from public.stock_movements m
        where (m.created_at, m.id::text) > (v_ts, v_id)
          and (m.reason in ('receive', 'waste') or (m.reason = 'stocktake' and m.inventory_count_id is null))
        order by m.created_at, m.id::text limit v_limit
      loop
        perform public.store_activity_capture_stock_movements(v_sm);
        v_scanned := v_scanned + 1; v_last_ts := v_sm.created_at; v_last_id := v_sm.id::text;
      end loop;

    when 'inventory_audit_log' then
      for v_ial in
        select * from public.inventory_audit_log l
        where (l.created_at, l.id::text) > (v_ts, v_id)
          and (l.outcome in ('duplicate', 'failed')
               or (l.outcome = 'applied' and (l.is_suspected_duplicate
                   or l.event in ('order_sale', 'order_redeplete', 'order_restore'))))
        order by l.created_at, l.id::text limit v_limit
      loop
        perform public.store_activity_capture_inventory_audit_log(v_ial);
        v_scanned := v_scanned + 1; v_last_ts := v_ial.created_at; v_last_id := v_ial.id::text;
      end loop;

    when 'inventory_counts' then
      for v_cnt in
        select * from public.inventory_counts c
        where (c.closed_at, c.id::text) > (v_ts, v_id) and c.status = 'closed'
        order by c.closed_at, c.id::text limit v_limit
      loop
        perform public.store_activity_capture_inventory_count(v_cnt);
        v_scanned := v_scanned + 1; v_last_ts := v_cnt.closed_at; v_last_id := v_cnt.id::text;
      end loop;

    when 'stock_alerts' then
      for v_alert in
        select * from public.stock_alerts a
        where (a.created_at, a.id::text) > (v_ts, v_id)
        order by a.created_at, a.id::text limit v_limit
      loop
        perform public.store_activity_capture_stock_alert(v_alert, false);
        v_scanned := v_scanned + 1; v_last_ts := v_alert.created_at; v_last_id := v_alert.id::text;
      end loop;

    when 'staff_shifts_opened' then
      for v_shift in
        select * from public.staff_shifts s
        where (s.opened_at, s.id::text) > (v_ts, v_id)
        order by s.opened_at, s.id::text limit v_limit
      loop
        perform public.store_activity_capture_staff_shift(v_shift, 'opened');
        v_scanned := v_scanned + 1; v_last_ts := v_shift.opened_at; v_last_id := v_shift.id::text;
      end loop;

    when 'staff_shifts_closed' then
      for v_shift in
        select * from public.staff_shifts s
        where (s.closed_at, s.id::text) > (v_ts, v_id) and s.status = 'closed'
        order by s.closed_at, s.id::text limit v_limit
      loop
        perform public.store_activity_capture_staff_shift(v_shift, 'closed');
        v_scanned := v_scanned + 1; v_last_ts := v_shift.closed_at; v_last_id := v_shift.id::text;
      end loop;

    when 'shift_cash_movements' then
      for v_cash in
        select * from public.shift_cash_movements m
        where (m.created_at, m.id::text) > (v_ts, v_id)
        order by m.created_at, m.id::text limit v_limit
      loop
        perform public.store_activity_capture_shift_cash_movements(v_cash);
        v_scanned := v_scanned + 1; v_last_ts := v_cash.created_at; v_last_id := v_cash.id::text;
      end loop;

    when 'loyalty_activity' then
      for v_loy in
        select * from public.loyalty_activity l
        where (l.occurred_at, l.id::text) > (v_ts, v_id)
        order by l.occurred_at, l.id::text limit v_limit
      loop
        perform public.store_activity_capture_loyalty_activity(v_loy);
        v_scanned := v_scanned + 1; v_last_ts := v_loy.occurred_at; v_last_id := v_loy.id::text;
      end loop;

    else
      raise exception 'Unknown backfill source %', p_source using errcode = '22023';
    end case;
  exception when others then
    raise exception 'store_activity_backfill_batch(%) failed in the batch after (%, %): % (%)',
      p_source, p_after_ts, p_after_id, sqlerrm, sqlstate;
  end;

  perform set_config('app.store_activity_backfill', 'off', true);
  return query select v_last_ts, v_last_id, v_scanned,
    coalesce(nullif(current_setting('app.store_activity_written', true), ''), '0')::integer,
    v_scanned < v_limit;
end;
$$;

revoke all on function public.store_activity_backfill_batch(text, timestamptz, text, integer) from public, anon, authenticated;
grant execute on function public.store_activity_backfill_batch(text, timestamptz, text, integer) to service_role;

-- Rollback:
-- drop function if exists public.store_activity_backfill_batch(text, timestamptz, text, integer);
