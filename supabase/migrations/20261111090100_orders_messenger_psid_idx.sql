-- "Where is my order" reads one store's orders for one Messenger customer
-- (src/lib/messenger/recent-orders.ts). Partial: only orders that came from
-- a chat carry messenger_psid.
--
-- On the platform project this was built with CREATE INDEX CONCURRENTLY via
-- execute_sql (a migration runs in a transaction, which CONCURRENTLY refuses);
-- `if not exists` keeps a replay of this file a no-op.
create index if not exists orders_messenger_psid_idx
  on public.orders (tenant_id, (customer_data ->> 'messenger_psid'), created_at desc)
  where customer_data ? 'messenger_psid';
