-- Per-order-type minimum order amount.
--
-- Merchants set a minimum subtotal per order type — in practice only Delivery
-- carries one ("₱500 minimum for delivery"), while Pickup and Dine-In stay open.
-- Checkout blocks below the minimum and `createOrderAction` re-checks server-side,
-- so the gate holds for the web app, the mobile apps, and every order backend.
--
-- Defaults to 0 ("no minimum") so every existing order type keeps checking out
-- exactly as before.

alter table public.order_types
  add column if not exists minimum_order_amount numeric(10,2) not null default 0
    check (minimum_order_amount >= 0);

comment on column public.order_types.minimum_order_amount is
  'Minimum cart subtotal required to check out with this order type. 0 means no minimum.';
