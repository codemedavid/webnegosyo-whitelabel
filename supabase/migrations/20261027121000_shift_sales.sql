-- ===========================================================================
-- Shift sales (P1 of docs/plans/cashier-remittance, CONTRACTS.md §4): what the
-- store sold during one cashier's shift, or any window of the business day.
--
--   cash.window_sales(tenant, from, to, outlet, receipt_limit)   internal
--   report_shift_sales(p_shift_id)                                holder or cash manager
--   report_period_sales(p_tenant, p_from, p_to, p_outlet)         `reports`
--
-- ONE sales definition: every figure comes from the reporting.* helpers behind
-- the Reports pages (order_figures = sales-model.ts, payment buckets =
-- payment-buckets.ts, item rollup = sales-breakdowns.ts). No new formula.
-- The payment-bucket and item-rollup queries lived inline in
-- report_payments / report_sales_by_item, which need `reports` (a cashier
-- holds only `pos`). They move VERBATIM into reporting.payment_buckets /
-- reporting.item_rollup and the two public functions now call them, so
-- Reports and shift sales share one body; tests/sql/run-shift-sales.cjs pins
-- that both public functions answer exactly as before.
--
-- Why SECURITY DEFINER here (unlike report_*): a cashier must see their own
-- shift's sales without the order-read keys. The wrappers decide access
-- explicitly (auth.uid(), branch reach) and pass a fixed branch; the
-- helpers then read as the owner. A branch-locked caller can only ever be
-- answered for a branch they reach.
--
-- Performance (CLAUDE.md "Sales reports", 2026-10-14 outage): the helpers
-- read children by `order_id = any(array(...))` under RETURN QUERY EXECUTE;
-- window_sales EXECUTEs its own statement too (custom plan), reads orders by
-- primary key the same way, and every window is half-open and at most 93
-- days. A shift is hours long; three helper passes over it are cheap.
-- statement_timeout is NOT set on these functions: a function-level SET does
-- not bound the statement already running, so the bound is the window cap
-- plus the API role's timeout. Live probes still start with
-- `set local statement_timeout = '5s'` and a one-day window.
--
-- Non-platform stores (cash.tenant_order_backend <> 'platform') answer
-- {"source":"unavailable"} (+ window, shift): clients use their backend's
-- own figures, labelled, never ₱0.
-- ===========================================================================

set lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- reporting.payment_buckets: bucketPayments() — body of report_payments
-- (20261014150000) moved verbatim.
-- ---------------------------------------------------------------------------
create or replace function reporting.payment_buckets(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_outlet uuid, p_unassigned boolean
)
returns table (
  method_key text,
  method_id uuid,
  label text,
  cents bigint,
  orders bigint
)
language plpgsql
stable
set search_path = ''
as $$
begin
  return query
  with live as (
    select
      f.order_id, f.placed_at, f.collected_cents, f.ledger_cents,
      f.method_id as own_id,
      nullif(reporting.trim_text(f.method_name), '') as own_name,
      reporting.method_key(f.method_id, f.method_name) as own_key
    from reporting.order_figures(p_tenant, p_from, p_to, p_outlet, p_unassigned) f
    where f.is_live
  ),
  ledger as (
    select
      o.order_id,
      p.payment_method_id,
      nullif(reporting.trim_text(p.payment_method_name), '') as name,
      p.payment_method_name as raw_name,
      p.created_at,
      reporting.cents(p.amount) * case when lower(reporting.trim_text(coalesce(p.kind, ''))) = 'refund' then -1 else 1 end as cents,
      o.own_id, o.own_name, o.own_key
    from live o
    join public.order_payments p on p.order_id = o.order_id
    where p.order_id = any (array(select l.order_id from live l))
  ),
  parts as (
    -- A ledger row with no method is the order's; so is one naming the
    -- order's method by id alone (paymentMethod()).
    select
      l.order_id,
      case
        when (l.payment_method_id is null and l.name is null) or (l.name is null and l.payment_method_id = l.own_id) then l.own_key
        else reporting.method_key(l.payment_method_id, l.raw_name)
      end as key,
      case
        when (l.payment_method_id is null and l.name is null) or (l.name is null and l.payment_method_id = l.own_id) then l.own_id
        else l.payment_method_id
      end as method_id,
      case
        when (l.payment_method_id is null and l.name is null) or (l.name is null and l.payment_method_id = l.own_id)
          then coalesce(l.own_name, 'Not recorded')
        else coalesce(l.name, 'Not recorded')
      end as label,
      l.created_at as at,
      l.cents
    from ledger l
    union all
    -- Settled beyond the ledger (paid online, handed over): the order's method.
    select o.order_id, o.own_key, o.own_id, coalesce(o.own_name, 'Not recorded'), o.placed_at, o.collected_cents - o.ledger_cents
    from live o
    where o.collected_cents - o.ledger_cents <> 0
  ),
  -- A name-only method joins the id whose parts carry that name, when exactly
  -- one id does in this window (nameAliases() in payment-buckets.ts).
  aliases as (
    select 'name:' || reporting.fold_name(p.label) as name_key, min(p.key) as id_key
    from parts p
    where p.key like 'id:%' and p.label <> 'Not recorded'
    group by 1
    having count(distinct p.key) = 1
  ),
  keyed as (
    select
      p.order_id,
      coalesce(a.id_key, p.key) as key,
      case when a.id_key is not null then substr(a.id_key, 4)::uuid else p.method_id end as method_id,
      p.label,
      p.at,
      p.cents
    from parts p
    left join aliases a on a.name_key = p.key
  ),
  slices as (
    select k.order_id, k.key
    from keyed k
    group by k.order_id, k.key
    having sum(k.cents) <> 0
  )
  select
    k.key,
    (array_agg(k.method_id) filter (where k.method_id is not null))[1],
    (array_agg(k.label order by (k.label <> 'Not recorded') desc, k.at desc, k.label collate "C"))[1],
    sum(k.cents)::bigint,
    count(distinct k.order_id)
  from keyed k
  join slices s on s.order_id = k.order_id and s.key = k.key
  group by k.key;
end;
$$;

create or replace function public.report_payments(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_outlet uuid default null, p_unassigned boolean default false
)
returns table (
  method_key text,
  method_id uuid,
  label text,
  cents bigint,
  orders bigint
)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform reporting.assert_access(p_tenant, p_from, p_to, p_outlet, p_unassigned);
  return query select * from reporting.payment_buckets(p_tenant, p_from, p_to, p_outlet, p_unassigned);
end;
$$;

comment on function public.report_payments(uuid, timestamptz, timestamptz, uuid, boolean) is
  'Money collected per payment method (payment-buckets.ts) via reporting.payment_buckets (20261027121000; body from 20261014150000). SECURITY INVOKER; needs the reports key.';

-- ---------------------------------------------------------------------------
-- reporting.item_rollup: rollupItems() — body of report_sales_by_item
-- (20261014110000) moved verbatim.
-- ---------------------------------------------------------------------------
create or replace function reporting.item_rollup(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_outlet uuid, p_unassigned boolean
)
returns table (
  item_key text,
  menu_item_id uuid,
  label text,
  category_label text,
  orders bigint,
  quantity bigint,
  gross_cents bigint,
  discount_cents bigint,
  net_cents bigint,
  is_unrecorded boolean
)
language plpgsql
stable
set search_path = ''
as $$
begin
  return query
  with keyed as (
    select
      l.*,
      case
        when l.is_unrecorded then 'unrecorded'
        when l.menu_item_id is not null then 'id:' || l.menu_item_id::text
        else 'name:' || reporting.fold_name(l.name)
      end as k
    from reporting.line_figures(p_tenant, p_from, p_to, p_outlet, p_unassigned) l
  )
  select
    k.k,
    (array_agg(k.menu_item_id) filter (where k.menu_item_id is not null))[1],
    (array_agg(k.name order by k.placed_at desc, k.name collate "C"))[1],
    (array_agg(k.category_name order by k.placed_at desc, k.category_name collate "C") filter (where k.category_name is not null))[1],
    count(distinct k.order_id),
    sum(k.quantity)::bigint,
    sum(k.gross_cents)::bigint,
    sum(k.discount_cents)::bigint,
    sum(k.net_cents)::bigint,
    bool_or(k.is_unrecorded)
  from keyed k
  group by k.k;
end;
$$;

create or replace function public.report_sales_by_item(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_outlet uuid default null, p_unassigned boolean default false
)
returns table (
  item_key text,
  menu_item_id uuid,
  label text,
  category_label text,
  orders bigint,
  quantity bigint,
  gross_cents bigint,
  discount_cents bigint,
  net_cents bigint,
  is_unrecorded boolean
)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform reporting.assert_access(p_tenant, p_from, p_to, p_outlet, p_unassigned);
  return query select * from reporting.item_rollup(p_tenant, p_from, p_to, p_outlet, p_unassigned);
end;
$$;

revoke all on function reporting.payment_buckets(uuid, timestamptz, timestamptz, uuid, boolean) from public, anon;
revoke all on function reporting.item_rollup(uuid, timestamptz, timestamptz, uuid, boolean) from public, anon;
grant execute on function reporting.payment_buckets(uuid, timestamptz, timestamptz, uuid, boolean) to authenticated, service_role;
grant execute on function reporting.item_rollup(uuid, timestamptz, timestamptz, uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Labels, as the apps print them.
-- ---------------------------------------------------------------------------
-- toSaleChannel() + SALE_CHANNEL_LABELS (src/lib/dashboard/sale-record.ts).
create or replace function cash.sale_channel(p_source text)
returns text
language sql
immutable
as $$
  select case lower(reporting.trim_text(coalesce(p_source, '')))
           when 'pos' then 'counter' when 'qr_handoff' then 'qr' when 'mobile' then 'app' else 'online' end
$$;
create or replace function cash.sale_channel_label(p_channel text)
returns text
language sql
immutable
as $$
  select case p_channel when 'counter' then 'Counter (POS)' when 'qr' then 'QR handoff' when 'app' then 'Customer app' else 'Online menu' end
$$;
-- normalizeOrderType() (src/lib/queries/platform-analytics-merge.ts).
create or replace function cash.order_type_label(p_raw text)
returns text
language sql
immutable
as $$
  select case
           when p_raw is null or reporting.trim_text(p_raw) = '' then 'Unspecified'
           when strpos(lower(p_raw), 'dine') > 0 then 'Dine In'
           when strpos(lower(p_raw), 'pick') > 0 then 'Pick Up'
           when strpos(lower(p_raw), 'deliver') > 0 or strpos(lower(p_raw), 'lalamove') > 0 then 'Delivery'
           when strpos(lower(p_raw), 'walk') > 0 or strpos(lower(p_raw), 'visit') > 0 then 'Walk-in'
           else 'Other'
         end
$$;
create or replace function cash.order_type_key(p_label text)
returns text
language sql
immutable
as $$
  select case p_label when 'Dine In' then 'dine_in' when 'Pick Up' then 'pick_up' when 'Delivery' then 'delivery'
                      when 'Walk-in' then 'walk_in' when 'Unspecified' then 'unspecified' else 'other' end
$$;
-- formatDailyOrderNumber() (src/lib/order-number.ts): #07, #123, else #<8 of the id>.
create or replace function cash.order_number_label(p_daily_number integer, p_order_id uuid)
returns text
language sql
immutable
as $$
  select case when p_daily_number > 0 then '#' || case when p_daily_number < 10 then '0' else '' end || p_daily_number::text
              else '#' || upper(left(p_order_id::text, 8)) end
$$;
-- One ISO-8601 UTC spelling for every instant in these reports.
create or replace function cash.iso(p_at timestamptz)
returns text
language sql
immutable
as $$
  select to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

-- Pure helpers: callable by anyone signed in (they read nothing).
revoke all on function cash.sale_channel(text), cash.sale_channel_label(text), cash.order_type_label(text),
  cash.order_type_key(text), cash.order_number_label(integer, uuid), cash.iso(timestamptz) from public, anon;
grant execute on function cash.sale_channel(text), cash.sale_channel_label(text), cash.order_type_label(text),
  cash.order_type_key(text), cash.order_number_label(integer, uuid), cash.iso(timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- cash.window_sales: the §4 sales object for [p_from, p_to) at one branch
-- (NULL = the whole store). Internal: the wrappers decide who may ask.
-- Receipts are newest first, at most p_receipt_limit; first/last number are
-- over the WHOLE window.
-- ---------------------------------------------------------------------------
create or replace function cash.window_sales(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_outlet uuid, p_receipt_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_sales jsonb;
  v_limit integer := least(greatest(coalesce(p_receipt_limit, 500), 0), 2000);
begin
  if p_tenant is null or p_from is null or p_to is null then
    raise exception 'Sales need a store and a time window.' using errcode = '22023';
  end if;
  if p_to < p_from then
    raise exception 'A sales window must end after it starts.' using errcode = '22023';
  end if;
  if p_to - p_from > interval '93 days' then
    raise exception 'A sales window covers at most 93 days.' using errcode = '22023';
  end if;

  execute $q$
    with f as materialized (
      select * from reporting.order_figures($1, $2, $3, $4, false)
    ),
    o as (
      select o.id, o.daily_number, lower(reporting.trim_text(coalesce(o.status, ''))) as status_key
        from public.orders o
       where o.id = any (array(select f.order_id from f))
    ),
    r as (
      select f.*, cash.order_number_label(o.daily_number, f.order_id) as number,
             case
               when not f.is_live and o.status_key = 'refunded' then 'refunded'
               when not f.is_live then 'void'
               when f.unpaid_cents > 0 then 'unpaid'
               else 'paid'
             end as receipt_status
        from f join o on o.id = f.order_id
    ),
    types as (
      select cash.order_type_label(f.order_type) as label, count(*) as orders, sum(f.net_cents) as net
        from f where f.is_live group by 1
    ),
    channels as (
      select cash.sale_channel(f.source) as key, count(*) as orders, sum(f.net_cents) as net
        from f where f.is_live group by 1
    ),
    recent as (
      select * from r order by r.placed_at desc, r.order_id desc limit $5
    )
    select jsonb_build_object(
      'summary', (
        select jsonb_build_object(
          'orders', count(*) filter (where f.is_live),
          'grossCents', coalesce(sum(f.gross_cents) filter (where f.is_live), 0)::bigint,
          'discountCents', coalesce(sum(f.discount_cents) filter (where f.is_live), 0)::bigint,
          'netCents', coalesce(sum(f.net_cents) filter (where f.is_live), 0)::bigint,
          'serviceChargeCents', coalesce(sum(f.service_cents) filter (where f.is_live), 0)::bigint,
          'deliveryCents', coalesce(sum(f.delivery_cents) filter (where f.is_live), 0)::bigint,
          'collectedCents', coalesce(sum(f.collected_cents) filter (where f.is_live), 0)::bigint,
          'unpaidCents', coalesce(sum(f.unpaid_cents) filter (where f.is_live), 0)::bigint,
          'overpaidCents', coalesce(sum(f.overpaid_cents) filter (where f.is_live), 0)::bigint,
          'voidCount', count(*) filter (where not f.is_live),
          'voidCents', coalesce(sum(greatest(f.billed_cents, 0)) filter (where not f.is_live), 0)::bigint,
          'refundCents', coalesce(sum(f.refund_cents) filter (where f.is_live), 0)::bigint)
          from f),
      'payments', coalesce((
        select jsonb_agg(jsonb_build_object('key', p.method_key, 'label', p.label, 'cents', p.cents, 'count', p.orders)
                         order by p.cents desc, p.label collate "C", p.method_key)
          from reporting.payment_buckets($1, $2, $3, $4, false) p), '[]'::jsonb),
      'orderTypes', coalesce((
        select jsonb_agg(jsonb_build_object('key', cash.order_type_key(t.label), 'label', t.label, 'orders', t.orders, 'netCents', t.net::bigint)
                         order by t.net desc, t.label)
          from types t), '[]'::jsonb),
      'channels', coalesce((
        select jsonb_agg(jsonb_build_object('key', c.key, 'label', cash.sale_channel_label(c.key), 'orders', c.orders, 'netCents', c.net::bigint)
                         order by c.net desc, c.key)
          from channels c), '[]'::jsonb),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object('label', i.label, 'quantity', i.quantity, 'netCents', i.net_cents)
                         order by i.net_cents desc, i.label collate "C", i.item_key)
          from (select * from reporting.item_rollup($1, $2, $3, $4, false) x
                 order by x.net_cents desc, x.label collate "C", x.item_key limit 50) i), '[]'::jsonb),
      'receipts', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'orderId', x.order_id, 'number', x.number, 'placedAt', cash.iso(x.placed_at),
                 'orderTypeLabel', cash.order_type_label(x.order_type),
                 'methodLabel', coalesce(nullif(reporting.trim_text(x.method_name), ''), 'Not recorded'),
                 'totalCents', x.billed_cents::bigint, 'status', x.receipt_status)
                 order by x.placed_at desc, x.order_id desc)
          from recent x), '[]'::jsonb),
      'receiptsTruncated', (select count(*) > $5 from f),
      'firstNumber', (select r.number from r order by r.placed_at, r.order_id limit 1),
      'lastNumber', (select r.number from r order by r.placed_at desc, r.order_id desc limit 1))
  $q$ into v_sales using p_tenant, p_from, p_to, p_outlet, v_limit;

  return v_sales;
end;
$fn$;

revoke all on function cash.window_sales(uuid, timestamptz, timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function cash.window_sales(uuid, timestamptz, timestamptz, uuid, integer) to service_role;

-- Blind + open + not a cash manager: the receipt list and counts stay, the
-- pesos go (CONTRACTS §1.9).
create or replace function cash.hide_money(p_report jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select p_report || jsonb_build_object(
    'hidden', true, 'summary', null, 'payments', null, 'orderTypes', null, 'channels', null, 'items', null,
    'receipts', coalesce((select jsonb_agg(r || '{"totalCents": null}'::jsonb order by ord)
                            from jsonb_array_elements(p_report -> 'receipts') with ordinality as e(r, ord)), '[]'::jsonb))
$$;
revoke all on function cash.hide_money(jsonb) from public, anon, authenticated;
grant execute on function cash.hide_money(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- report_shift_sales(p_shift_id): one shift's window [opened_at,
-- closed_at or now()) at the shift's branch (NULL = the whole store).
-- Who: the shift's holder (still a member reaching that branch), or a
-- cash_manage holder reaching that branch. Anyone else: 42501.
-- Unknown shift: P0002.
-- ---------------------------------------------------------------------------
create or replace function public.report_shift_sales(p_shift_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  s public.staff_shifts%rowtype;
  v_to timestamptz;
  v_reach boolean;
  v_manager boolean;
  v_head jsonb;
  v_report jsonb;
begin
  if v_uid is null then
    raise exception 'Sign in to see shift sales.' using errcode = '42501';
  end if;
  select * into s from public.staff_shifts where id = p_shift_id;
  if not found then
    raise exception 'That shift was not found.' using errcode = 'P0002';
  end if;
  v_reach := public.app_user_may_reach_branch(s.tenant_id, s.outlet_id);
  v_manager := v_reach and public.app_user_manages_cash(s.tenant_id);
  if not (v_manager or (v_reach and s.staff_user_id = v_uid)) then
    raise exception 'Only the cashier on this shift or someone who handles cash can see its sales.' using errcode = '42501';
  end if;

  v_to := coalesce(s.closed_at, now());
  if v_to - s.opened_at > interval '93 days' then
    raise exception 'This shift has been open too long to add up. Close it first.' using errcode = '22023';
  end if;
  v_head := jsonb_build_object(
    'source', 'server', 'hidden', false,
    'window', jsonb_build_object('from', cash.iso(s.opened_at), 'to', cash.iso(v_to)),
    'shift', jsonb_build_object(
      'id', s.id, 'staffName', s.staff_name, 'drawerName', s.drawer_name,
      'openedAt', cash.iso(s.opened_at), 'closedAt', cash.iso(s.closed_at),
      'businessDay', to_char(s.business_day, 'YYYY-MM-DD'),
      'servicePeriodName', (select p.name from public.service_periods p where p.id = s.service_period_id)));

  if cash.tenant_order_backend(s.tenant_id) is distinct from 'platform' then
    return v_head || '{"source": "unavailable"}'::jsonb;
  end if;

  v_report := v_head || cash.window_sales(s.tenant_id, s.opened_at, v_to, s.outlet_id, 500);
  if s.is_blind and s.status = 'open' and not v_manager then
    return cash.hide_money(v_report);
  end if;
  return v_report;
end;
$$;

comment on function public.report_shift_sales(uuid) is
  'Sales during one shift (CONTRACTS §4): holder or cash_manage with branch reach. Blind + open + not a cash manager: money fields null, hidden true. Non-platform store: source unavailable.';

revoke all on function public.report_shift_sales(uuid) from public, anon;
grant execute on function public.report_shift_sales(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- report_period_sales: any window of the business day ("By shift" in
-- Reports, the day close). Needs `reports`. p_outlet NULL = the whole store,
-- which a branch-locked account may not ask for; a branch it cannot reach is
-- refused (42501). Superadmins (support) may read any branch.
-- ---------------------------------------------------------------------------
create or replace function public.report_period_sales(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_outlet uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_head jsonb;
begin
  if p_tenant is null or p_from is null or p_to is null then
    raise exception 'A report needs a store and a time window.' using errcode = '22023';
  end if;
  if p_to <= p_from then
    raise exception 'A report''s window must end after it starts.' using errcode = '22023';
  end if;
  if p_to - p_from > interval '93 days' then
    raise exception 'A report covers at most 93 days.' using errcode = '22023';
  end if;
  if v_uid is null or not public.app_user_has_permission(p_tenant, 'reports') then
    raise exception 'Sales reports need the Reports permission.' using errcode = '42501';
  end if;
  if not (public.app_user_may_reach_branch(p_tenant, p_outlet)
          or exists (select 1 from public.app_users au where au.user_id = v_uid and au.role = 'superadmin')) then
    raise exception 'This account can only see its own branch.' using errcode = '42501';
  end if;
  if p_outlet is not null and not exists (select 1 from public.outlets o where o.id = p_outlet and o.tenant_id = p_tenant) then
    raise exception 'That branch belongs to a different store.' using errcode = '42501';
  end if;

  v_head := jsonb_build_object('source', 'server', 'hidden', false,
    'window', jsonb_build_object('from', cash.iso(p_from), 'to', cash.iso(p_to)));
  if cash.tenant_order_backend(p_tenant) is distinct from 'platform' then
    return v_head || '{"source": "unavailable"}'::jsonb;
  end if;
  return v_head || cash.window_sales(p_tenant, p_from, p_to, p_outlet, 500);
end;
$$;

comment on function public.report_period_sales(uuid, timestamptz, timestamptz, uuid) is
  'Sales in [p_from, p_to) (≤ 93 days) for a store or one branch, shaped like report_shift_sales (CONTRACTS §4). Needs reports; branch-locked callers only their branch. Non-platform store: source unavailable.';

revoke all on function public.report_period_sales(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.report_period_sales(uuid, timestamptz, timestamptz, uuid) to authenticated;

-- ===========================================================================
-- Rollback (manual)
-- ===========================================================================
-- drop function if exists public.report_period_sales(uuid, timestamptz, timestamptz, uuid);
-- drop function if exists public.report_shift_sales(uuid);
-- drop function if exists cash.hide_money(jsonb);
-- drop function if exists cash.window_sales(uuid, timestamptz, timestamptz, uuid, integer);
-- drop function if exists cash.iso(timestamptz), cash.order_number_label(integer, uuid), cash.order_type_key(text),
--   cash.order_type_label(text), cash.sale_channel_label(text), cash.sale_channel(text);
-- re-create public.report_payments from 20261014150000 and public.report_sales_by_item from
--   20261014110000 (inline bodies), then:
-- drop function if exists reporting.item_rollup(uuid, timestamptz, timestamptz, uuid, boolean);
-- drop function if exists reporting.payment_buckets(uuid, timestamptz, timestamptz, uuid, boolean);
