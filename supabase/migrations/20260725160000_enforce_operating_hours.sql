-- Storefront enforcement of operating hours.
--
-- `operating_hours` (20260616300000) previously only constrained advance-order slot
-- generation — the storefront itself never read it, so a shop with a 21:00 close time
-- still accepted ASAP orders at 03:00.
--
-- This flag opts a tenant into showing an "Ordering is currently closed" notice and
-- refusing new orders outside the configured window. It defaults to FALSE so every
-- existing tenant — including those who set hours purely for scheduling — keeps its
-- current behavior until the merchant explicitly turns enforcement on.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS enforce_operating_hours boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN tenants.enforce_operating_hours IS
  'When true, the storefront shows a closed notice and blocks new orders outside operating_hours (evaluated in the tenant timezone). Default false = hours only constrain advance-order slots.';
