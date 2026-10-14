-- ===========================================================================
-- report_payments: one method recorded by id on some orders and by name only
-- on others is ONE row.
--
-- Found on a live store (2026-10-14): web checkout stores the Cash method's
-- id, the register stores only the word "Cash", so Payments showed two "Cash"
-- rows. A `name:` key now joins the `id:` key whose parts carry that (folded)
-- name, when exactly one id does in the window; two methods that share a name
-- stay apart. Rekeyed BEFORE the per-order netting and the distinct order
-- count, so an order paid partly each way is one slice, counted once.
-- Mirrors nameAliases() in src/lib/reports/payment-buckets.ts; the PGlite
-- parity suite loads this file after 140000.
-- ===========================================================================

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

comment on function public.report_payments(uuid, timestamptz, timestamptz, uuid, boolean) is
  'Money collected per payment method (payment-buckets.ts). A name-only method joins the one id carrying that name in the window (20261014150000). SECURITY INVOKER; needs the reports key.';
