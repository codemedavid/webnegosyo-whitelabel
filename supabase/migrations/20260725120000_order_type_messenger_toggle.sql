-- Per-order-type Messenger toggle.
--
-- Merchants can turn Facebook Messenger off for a specific order type (e.g.
-- Dine-In served at the table) while keeping it for others (e.g. Delivery).
-- When off, checkout completes the order in place instead of redirecting the
-- customer to Messenger.
--
-- Defaults to true so every existing order type keeps its current behavior.

alter table public.order_types
  add column if not exists messenger_enabled boolean not null default true;

comment on column public.order_types.messenger_enabled is
  'When false, checkout for this order type skips the Messenger message/redirect and shows "Complete Order".';
