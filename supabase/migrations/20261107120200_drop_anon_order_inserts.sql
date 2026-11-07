-- DO NOT APPLY BEFORE THE WEB DEPLOY.
--
-- Apply this file only AFTER the web deploy in which checkout inserts orders
-- and order lines with the service role. Until then the storefront places
-- orders as the anon role through these two policies, and dropping them would
-- refuse every customer order (RLS answers with 42501 / zero rows).
--
-- After it, anon can no longer insert orders or order_items. Staff policies
-- (orders_insert_admin, order_items_write_admin, platform_staff_*) and the
-- service role are untouched. The interim limits in 20261107120100 become
-- dead code for anon and may be dropped in a later cleanup.
drop policy if exists orders_insert_customer on public.orders;
drop policy if exists order_items_insert_customer on public.order_items;
