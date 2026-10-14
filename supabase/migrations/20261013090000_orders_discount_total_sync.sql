-- Reports & Inventory suite, Phase 0c: one stored discount per order, and
-- `orders.discount_total` always equal to it.
--
-- The register (and every app build already in the field) stores a POS
-- discount only in `customer_data.discount`, and an app edit writes
-- `discount_data` without the column. So 120 discounted orders read
-- discount_total = 0: SQL summing the column under-reported discounts, and the
-- activity log (store_activity, which reads discount_data, then the column)
-- saw POS discounts either not at all or, once the column was filled, as one
-- unlabelled "manual" amount. Fixing the writers would leave every installed
-- app build wrong, so the database keeps the two in step:
--   * `discount_data` is the order's discount. On insert, a register that only
--     wrote the blob has it copied in (same payload, so `readOrderDiscount`,
--     which reads the column first, answers exactly as before).
--   * An edit that writes `discount_data` wins. Removing it also removes the
--     register's blob, so no reader falls back to a discount the edit took away
--     (`readOrderDiscount` used to).
--   * `discount_total` = discount_data.total (≥ 0, 2 places), recomputed on
--     every write to either; a forged value is overwritten.

create or replace function public.order_discount_payload_total(
  p_discount_data jsonb,
  p_customer_data jsonb
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_discount_data) = 'object'
     and jsonb_typeof(p_discount_data -> 'total') = 'number'
      then (p_discount_data ->> 'total')::numeric
    when jsonb_typeof(p_customer_data -> 'discount') = 'object'
     and jsonb_typeof(p_customer_data -> 'discount' -> 'total') = 'number'
      then (p_customer_data -> 'discount' ->> 'total')::numeric
  end
$$;

revoke all on function public.order_discount_payload_total(jsonb, jsonb) from public, anon;
grant execute on function public.order_discount_payload_total(jsonb, jsonb) to authenticated, service_role;

create or replace function public.orders_sync_discount_total()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_blob jsonb := case
    when jsonb_typeof(new.customer_data -> 'discount') = 'object'
     and jsonb_typeof(new.customer_data -> 'discount' -> 'total') = 'number'
      then new.customer_data -> 'discount'
  end;
  v_total numeric;
begin
  if tg_op = 'INSERT' then
    if public.order_discount_payload_total(new.discount_data, null) is null and v_blob is not null then
      new.discount_data := v_blob;
    end if;
  elsif new.discount_data is distinct from old.discount_data then
    if new.discount_data is null and jsonb_typeof(new.customer_data) = 'object' then
      new.customer_data := new.customer_data - 'discount';
    end if;
  elsif old.discount_data is null and v_blob is not null then
    -- A writer that only knows the blob (an older register build).
    new.discount_data := v_blob;
  end if;

  v_total := public.order_discount_payload_total(new.discount_data, null);
  -- numeric(10,2): a garbled payload past the column's range is left alone
  -- rather than failing the checkout.
  if v_total is not null and v_total < 100000000 then
    new.discount_total := round(greatest(v_total, 0), 2);
  elsif tg_op = 'UPDATE' and new.discount_data is null and old.discount_data is not null then
    new.discount_total := 0;
  end if;
  return new;
end;
$$;

revoke all on function public.orders_sync_discount_total() from public, anon, authenticated;

create or replace trigger orders_sync_discount_total
  before insert or update of discount_data, customer_data, discount_total on public.orders
  for each row execute function public.orders_sync_discount_total();

-- Backfill. Replica mode: only these two columns are corrected, so no
-- updated_at bump, no loyalty re-queue, no push, no activity events for old
-- orders; the values set are exactly what the trigger sets.
set session_replication_role = replica;

update public.orders o
   set discount_data = o.customer_data -> 'discount'
 where public.order_discount_payload_total(o.discount_data, null) is null
   and jsonb_typeof(o.customer_data -> 'discount') = 'object'
   and jsonb_typeof(o.customer_data -> 'discount' -> 'total') = 'number';

update public.orders o
   set discount_total = round(greatest(public.order_discount_payload_total(o.discount_data, null), 0), 2)
 where public.order_discount_payload_total(o.discount_data, null) is not null
   and public.order_discount_payload_total(o.discount_data, null) < 100000000
   and o.discount_total is distinct from
       round(greatest(public.order_discount_payload_total(o.discount_data, null), 0), 2);

set session_replication_role = origin;
