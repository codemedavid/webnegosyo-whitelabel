-- Advance Orders (scheduled / pre-orders)
-- Lets customers schedule an order for a future date/time per order type.
-- Per-order-type config controls availability, lead time, how far ahead, and slot granularity.

ALTER TABLE order_types
  ADD COLUMN IF NOT EXISTS advance_order_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS advance_order_allow_asap boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS advance_order_lead_time_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS advance_order_max_days_ahead integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS advance_order_slot_interval_minutes integer NOT NULL DEFAULT 30;

-- Sanity bounds (kept generous; UI/Zod enforce tighter ranges)
ALTER TABLE order_types
  DROP CONSTRAINT IF EXISTS order_types_advance_lead_time_check,
  DROP CONSTRAINT IF EXISTS order_types_advance_max_days_check,
  DROP CONSTRAINT IF EXISTS order_types_advance_slot_interval_check;

ALTER TABLE order_types
  ADD CONSTRAINT order_types_advance_lead_time_check
    CHECK (advance_order_lead_time_minutes >= 0 AND advance_order_lead_time_minutes <= 10080),
  ADD CONSTRAINT order_types_advance_max_days_check
    CHECK (advance_order_max_days_ahead >= 0 AND advance_order_max_days_ahead <= 60),
  ADD CONSTRAINT order_types_advance_slot_interval_check
    CHECK (advance_order_slot_interval_minutes >= 5 AND advance_order_slot_interval_minutes <= 240);

COMMENT ON COLUMN order_types.advance_order_enabled IS 'When true, customers may schedule this order type for a future time (advance order).';
COMMENT ON COLUMN order_types.advance_order_allow_asap IS 'When false, this order type is schedule-only (no ASAP option, e.g. catering).';
COMMENT ON COLUMN order_types.advance_order_lead_time_minutes IS 'Minimum minutes from now before the earliest selectable slot.';
COMMENT ON COLUMN order_types.advance_order_max_days_ahead IS 'How many days into the future a customer may schedule (0 = today only).';
COMMENT ON COLUMN order_types.advance_order_slot_interval_minutes IS 'Granularity of selectable time slots, in minutes.';

-- Requested fulfillment time for advance/scheduled orders; NULL means ASAP.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;

COMMENT ON COLUMN orders.scheduled_for IS 'Requested fulfillment time for advance/scheduled orders (UTC); NULL = ASAP.';

-- Helps admin dashboards filter/sort upcoming scheduled orders efficiently.
CREATE INDEX IF NOT EXISTS idx_orders_tenant_scheduled_for
  ON orders (tenant_id, scheduled_for)
  WHERE scheduled_for IS NOT NULL;
