-- Reports & Inventory suite, Phase 0c part 2: orders_discount_total_sync after review.
--
-- 1. discount_total is purely derived. With no usable payload it is 0, so a
--    writer (an anon checkout included) can no longer store a discount the
--    order does not carry. No live order has a column value without a payload.
-- 2. The blob is copied in only when the blob itself changed. A write that
--    merely carries an old `customer_data` (e.g. a payment note) after an edit
--    removed the discount no longer brings the discount back.
-- 3. Range: numeric(10,2) holds < 99,999,999.995 once rounded; anything else
--    (or negative) is no discount rather than an overflow that fails the write.
-- 4. Every role that writes orders (anon checkout, staff, service) can run
--    the pure helper the invoker trigger calls (part 1 left anon out).

grant execute on function public.order_discount_payload_total(jsonb, jsonb) to anon, authenticated, service_role;

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
    -- An explicit write wins; a removal also clears the register's copy.
    if new.discount_data is null and jsonb_typeof(new.customer_data) = 'object' then
      new.customer_data := new.customer_data - 'discount';
    end if;
  elsif old.discount_data is null
    and v_blob is not null
    and (new.customer_data -> 'discount') is distinct from (old.customer_data -> 'discount') then
    -- A writer that only knows the blob (an older register build).
    new.discount_data := v_blob;
  end if;

  v_total := public.order_discount_payload_total(new.discount_data, null);
  new.discount_total := case
    when v_total is not null and v_total >= 0 and v_total < 99999999.995 then round(v_total, 2)
    else 0
  end;
  return new;
end;
$$;

revoke all on function public.orders_sync_discount_total() from public, anon, authenticated;
