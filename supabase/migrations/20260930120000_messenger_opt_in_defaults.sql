-- Facebook Messenger becomes optional (opt-in).
--
-- New stores and new order types start with Messenger OFF: checkout completes
-- the order in place ("Complete Order") and never redirects to Messenger until
-- the merchant turns it on.
--
-- Only the column DEFAULTS change. Every existing row keeps its stored value, so
-- stores already using Messenger are unaffected. The seeded order types for a
-- new tenant (create_default_order_types_for_tenant) omit messenger_enabled and
-- therefore pick up the new default.

alter table public.tenants
  alter column messenger_redirect_enabled set default false;

alter table public.order_types
  alter column messenger_enabled set default false;

comment on column public.tenants.messenger_redirect_enabled is
  'Opt-in. When true, checkout auto-opens Messenger after an order is placed; when false (default), the customer stays on the confirmation screen.';

comment on column public.order_types.messenger_enabled is
  'Opt-in. When true, checkout for this order type hands off to Messenger; when false (default), it completes in place and shows "Complete Order".';
