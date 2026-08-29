-- Chef-set prep time on an order.
--
-- Two columns, not one. `prep_minutes` is what the chef actually chose and is
-- the merchant's own record of it (and the basis for ever asking "how good are
-- our estimates?"). `promised_ready_at` is the absolute instant that choice
-- landed on, stamped at the moment of the tap — it is the only thing the
-- customer's countdown is derived from.
--
-- Storing only the duration would be wrong: it carries no information about
-- when its clock started, so a page open for an hour would still read
-- "15 minutes".
--
-- Both are nullable and default NULL. Every existing order has no promise, and
-- every read treats absence as "the kitchen has not committed to a time" — so
-- this migration changes nothing for orders already placed.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS prep_minutes integer,
  ADD COLUMN IF NOT EXISTS promised_ready_at timestamptz;

COMMENT ON COLUMN public.orders.prep_minutes IS
  'Minutes the kitchen committed to when starting this order. Merchant-facing record; never the source of the customer countdown.';

COMMENT ON COLUMN public.orders.promised_ready_at IS
  'Absolute instant the kitchen promised the order would be ready, stamped when the prep time was set. Source of the customer-facing ETA.';

-- Guard the range in the database as well as the client: a NaN or a negative
-- reaching this column would render an Invalid Date on a stranger's phone.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_prep_minutes_range;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_prep_minutes_range
  CHECK (prep_minutes IS NULL OR (prep_minutes >= 1 AND prep_minutes <= 240));
