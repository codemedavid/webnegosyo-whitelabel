-- Allow anonymous users to insert order_items when creating orders
-- This is needed for the customer checkout flow

-- Add insert policy for order_items that allows insertion for orders that exist
-- This ensures order_items can only be added to valid orders
create policy order_items_insert on public.order_items
  for insert with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id
    )
  );


