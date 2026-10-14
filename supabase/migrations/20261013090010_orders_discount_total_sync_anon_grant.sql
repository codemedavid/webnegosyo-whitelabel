-- Hotfix for orders_discount_total_sync: the trigger is SECURITY INVOKER and
-- calls order_discount_payload_total as the writer. Storefront checkout writes
-- as anon, which had no EXECUTE, so every web checkout INSERT failed with
-- 42501. The helper is pure (reads no table), so anon may run it.
grant execute on function public.order_discount_payload_total(jsonb, jsonb) to anon;
