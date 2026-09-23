-- Where an externally-stored order was delivered.
--
-- The facts ledger is the ONLY order history the platform holds for a Convex or
-- tenant-Supabase store, and it carried no address — so a merchant opening a
-- customer on one of those stores saw a phone number and nothing else, while
-- the same screen on a platform store could read `orders.customer_data`.
-- The address is already in hand at capture time; this is where it lands.
--
-- Forward-only: rows captured before this column existed cannot be backfilled,
-- because the source order lives in a database the platform does not hold.
alter table public.customer_external_orders
  add column if not exists address text;

comment on column public.customer_external_orders.address is
  'Delivery address as the customer typed it at checkout. Null for pickup, dine-in, and rows captured before this column existed.';
