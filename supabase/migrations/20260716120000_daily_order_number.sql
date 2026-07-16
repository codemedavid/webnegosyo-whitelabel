-- Daily-resetting, per-tenant, human-friendly order number.
--
-- Each order gets a display number (01, 02, ... 100+) that resets to 1 at the
-- start of each day in the tenant's local timezone. This is a DISPLAY value
-- only — the UUID primary key remains the canonical identifier. Numbers are
-- unique per (tenant, local day); gaps are acceptable (a failed insert may
-- consume a number) but duplicates are not.
--
-- Assignment happens in a BEFORE INSERT trigger so EVERY insert path (checkout
-- service, QR handoff, POS) gets a number with no application changes.

-- 1. Tenant-local day boundary. All current tenants are PH; default Asia/Manila.
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Manila';

COMMENT ON COLUMN tenants.timezone IS
  'IANA timezone used to compute the daily order-number reset boundary (default Asia/Manila).';

-- 2. Display columns on orders.
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS daily_number INTEGER,
ADD COLUMN IF NOT EXISTS order_date DATE;

COMMENT ON COLUMN orders.daily_number IS
  'Per-tenant, per-day sequence number for display (resets daily). Not the primary key.';
COMMENT ON COLUMN orders.order_date IS
  'Tenant-local calendar date this order belongs to (drives the daily_number reset).';

-- 3. Per-(tenant, day) counter. Internal bookkeeping table.
CREATE TABLE IF NOT EXISTS daily_order_counters (
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_date  DATE NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, order_date)
);

COMMENT ON TABLE daily_order_counters IS
  'Atomic source of the next daily order number per tenant per local day.';

-- RLS on: no policies. All access flows through the SECURITY DEFINER function
-- below, which bypasses RLS. This keeps the anon checkout role from touching
-- the counters directly while still satisfying "RLS enabled everywhere".
ALTER TABLE daily_order_counters ENABLE ROW LEVEL SECURITY;

-- 4. Atomic allocator: increments and returns the next number in one statement.
--    ON CONFLICT ... RETURNING locks the counter row, serializing concurrent
--    inserts for the same tenant+day so numbers never duplicate.
CREATE OR REPLACE FUNCTION next_daily_order_number(p_tenant_id UUID, p_order_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  INSERT INTO daily_order_counters (tenant_id, order_date, last_number)
  VALUES (p_tenant_id, p_order_date, 1)
  ON CONFLICT (tenant_id, order_date)
  DO UPDATE SET last_number = daily_order_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN v_next;
END;
$$;

-- 5. Trigger: assign order_date + daily_number on insert (unless already set,
--    which preserves explicit backfills and keeps re-runs idempotent).
CREATE OR REPLACE FUNCTION assign_daily_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_timezone TEXT;
  v_local_date DATE;
BEGIN
  IF NEW.daily_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(timezone, 'Asia/Manila') INTO v_timezone
  FROM tenants
  WHERE id = NEW.tenant_id;

  v_timezone := COALESCE(v_timezone, 'Asia/Manila');
  v_local_date := (COALESCE(NEW.created_at, now()) AT TIME ZONE v_timezone)::date;

  NEW.order_date := v_local_date;
  NEW.daily_number := next_daily_order_number(NEW.tenant_id, v_local_date);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_daily_order_number ON orders;
CREATE TRIGGER trg_assign_daily_order_number
BEFORE INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION assign_daily_order_number();

-- 6. Uniqueness + fast lookup ("find order #05 for tenant X today").
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tenant_day_number
  ON orders(tenant_id, order_date, daily_number)
  WHERE daily_number IS NOT NULL;
