-- Store activity — history backfill
--
-- Replays existing source rows through the SAME capture functions the live
-- triggers use (20261012151000 / 151100), so history rows read exactly like
-- live ones. Idempotent: every capture inserts with ON CONFLICT (event_key)
-- DO NOTHING under the same deterministic key the trigger would have used, so
-- re-running this file (or running it after the triggers went live) never
-- double-reports.
--
-- Windows (bounded; each DO block is one statement):
--   order_status_events   all (the table starts 2026-09-20; ~40k rows), split in three windows,
--                         oldest first (repeat_cancels counts the actor's earlier cancels that day).
--                         Platform rows are included ONLY up to the moment the orders trigger
--                         took over (first store_activity row sourced from 'orders', else now()).
--   orders (platform)     cancels since 2026-07-01 that have NO order_status_events cancel —
--                         the 28% the best-effort client writer missed. occurred_at = the order's
--                         updated_at (approximate, summary.approximateTime = true), actor unknown.
--   order_payments        since 2026-07-01
--   order_revisions       all (~100)
--   stock_movements       all (table starts 2026-07-27)
--   inventory_audit_log   noise-filtered rows only (duplicate / failed / suspected)
--   inventory_counts      closed counts
--   stock_alerts          all
--   staff_shifts          opens + closes
--   shift_cash_movements  all
--   voucher_redemptions   all (a release is a DELETE, so past releases cannot be recovered)
--   loyalty_activity      all
--   order_deletion_audit  all
--
-- Flags on history: computed by the same rules EXCEPT
--   * removed_after_kitchen — never (only the order's current status is known);
--   * paid_then_cancelled — on recovered platform cancels when the order still holds
--     money (amount_paid > 0); not on order_status_events history (no payment state);
--   * after_hours — computed against TODAY's hours configuration.
-- NOT backfilled: platform order.placed / status moves before 2026-09-20 (no
-- source), menu / team / settings changes (never logged before this feature).

-- ---------------------------------------------------------------- orders & money
do $$
declare
  v_cutoff timestamptz := coalesce(
    (select min(a.created_at) from public.store_activity a where a.source_table = 'orders' and a.event_key not like '%:backfill'),
    now());
begin
  perform public.store_activity_capture_order_status_events(e, true)
  from public.order_status_events e
        where e.occurred_at < '2026-10-01'
          and (e.backend <> 'platform_supabase' or e.created_at < v_cutoff)
        order by e.occurred_at, e.id;
end;
$$;

do $$
declare
  v_cutoff timestamptz := coalesce(
    (select min(a.created_at) from public.store_activity a where a.source_table = 'orders' and a.event_key not like '%:backfill'),
    now());
begin
  perform public.store_activity_capture_order_status_events(e, true)
  from public.order_status_events e
        where e.occurred_at >= '2026-10-01' and e.occurred_at < '2026-10-08'
          and (e.backend <> 'platform_supabase' or e.created_at < v_cutoff)
        order by e.occurred_at, e.id;
end;
$$;

do $$
declare
  v_cutoff timestamptz := coalesce(
    (select min(a.created_at) from public.store_activity a where a.source_table = 'orders' and a.event_key not like '%:backfill'),
    now());
begin
  perform public.store_activity_capture_order_status_events(e, true)
  from public.order_status_events e
        where e.occurred_at >= '2026-10-08'
          and (e.backend <> 'platform_supabase' or e.created_at < v_cutoff)
        order by e.occurred_at, e.id;
end;
$$;

-- Platform cancels the client-side writer never logged.
insert into public.store_activity (
  tenant_id, outlet_id, occurred_at, category, kind, is_routine, amount, reason,
  subject_type, subject_ref, order_number, backend, external_order_id,
  after, summary, flags, source_table, source_id, event_key
)
select o.tenant_id, o.outlet_id, o.updated_at, 'orders', 'order.cancelled', false, o.total, o.cancel_reason,
       'order', o.id::text, public.store_activity_order_label(o.daily_number, o.id::text), 'platform', o.id::text,
       jsonb_build_object('status', 'cancelled'),
       jsonb_strip_nulls(jsonb_build_object(
         'title', public.store_activity_order_label(o.daily_number, o.id::text) || ' cancelled',
         'customer', public.store_activity_mask_name(o.customer_name),
         'source', o.source, 'approximateTime', true,
         'amountPaid', case when coalesce(o.amount_paid, 0) > 0 then o.amount_paid end)),
       case when coalesce(o.amount_paid, 0) > 0 then array['paid_then_cancelled'] else '{}'::text[] end,
       'orders', o.id::text, 'orders:' || o.id || ':status:cancelled:backfill'
from public.orders o
where o.status = 'cancelled'
  and o.updated_at >= '2026-07-01'
  and not exists (
    select 1 from public.order_status_events e
    where e.tenant_id = o.tenant_id and e.backend = 'platform_supabase'
      and e.external_order_id = o.id::text and e.status = 'cancelled')
  and not exists (
    select 1 from public.store_activity a
    where a.tenant_id = o.tenant_id and a.source_table = 'orders'
      and a.subject_ref = o.id::text and a.kind = 'order.cancelled')
on conflict (event_key) do nothing;

do $$
begin
  perform public.store_activity_capture_order_payments(p)
  from public.order_payments p where p.created_at >= '2026-07-01' order by p.created_at, p.id;
end;
$$;

do $$
begin
  perform public.store_activity_capture_order_revisions(r, true)
  from public.order_revisions r order by r.created_at, r.id;
end;
$$;

do $$
begin
  perform public.store_activity_capture_voucher_redemption(v, false)
  from public.voucher_redemptions v order by v.created_at, v.id;
end;
$$;

do $$
begin
  perform public.store_activity_capture_order_deletion_audit(d)
  from public.order_deletion_audit d order by d.created_at, d.id;
end;
$$;

-- ---------------------------------------------------------------- stock
do $$
begin
  perform public.store_activity_capture_stock_movements(m)
  from public.stock_movements m
        where m.reason in ('receive', 'waste', 'stocktake', 'sale', 'void')
        order by m.created_at, m.id;
end;
$$;

do $$
begin
  perform public.store_activity_capture_inventory_audit_log(l)
  from public.inventory_audit_log l
        where l.outcome in ('duplicate', 'failed') or (l.outcome = 'applied' and l.is_suspected_duplicate)
        order by l.created_at, l.id;
end;
$$;

do $$
begin
  perform public.store_activity_capture_inventory_count(c)
  from public.inventory_counts c where c.status = 'closed' order by c.closed_at, c.id;
end;
$$;

do $$
begin
  perform public.store_activity_capture_stock_alert(a, false)
  from public.stock_alerts a order by a.created_at, a.id;
end;
$$;

-- ---------------------------------------------------------------- cash drawer
do $$
begin
  perform public.store_activity_capture_staff_shift(s, 'opened')
  from public.staff_shifts s order by s.opened_at, s.id;
  perform public.store_activity_capture_staff_shift(s, 'closed')
  from public.staff_shifts s where s.status = 'closed' order by s.closed_at, s.id;
end;
$$;

do $$
begin
  perform public.store_activity_capture_shift_cash_movements(m)
  from public.shift_cash_movements m order by m.created_at, m.id;
end;
$$;

-- ---------------------------------------------------------------- loyalty
do $$
begin
  perform public.store_activity_capture_loyalty_activity(l)
  from public.loyalty_activity l order by l.occurred_at, l.id;
end;
$$;

-- Rollback: history rows are identified by source; the table is append-only,
-- so a rollback of the backfill alone is `drop table` + re-run of 150000..151500.
