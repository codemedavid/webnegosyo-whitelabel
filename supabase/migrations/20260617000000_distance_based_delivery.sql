-- Distance-based delivery fee (non-Lalamove pricing path)
-- For tenants that do NOT use Lalamove. The merchant sets a store location
-- (reusing restaurant_latitude/longitude), a delivery radius, a per-km rate, and a
-- minimum-fee floor. At checkout the fee is computed from the straight-line distance
-- between the store and the customer's selected address:
--
--   fee = max(delivery_min_fee, distance_km * delivery_price_per_km)
--
-- Orders beyond delivery_radius_km are blocked. Lalamove always takes precedence when
-- lalamove_enabled is true; this path only applies when distance_delivery_enabled is true
-- and Lalamove is off. All columns are nullable / default-off so existing tenants are
-- unaffected (backward compatible).

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS distance_delivery_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_price_per_km numeric(8, 2),
  ADD COLUMN IF NOT EXISTS delivery_min_fee numeric(8, 2),
  ADD COLUMN IF NOT EXISTS delivery_radius_km numeric(6, 2);

COMMENT ON COLUMN tenants.distance_delivery_enabled IS
  'Master toggle for distance-based delivery pricing. Ignored when lalamove_enabled is true (Lalamove wins). Requires restaurant_latitude/longitude + the delivery_* fields below.';

COMMENT ON COLUMN tenants.delivery_price_per_km IS
  'Delivery charge per kilometer (store currency, e.g. 15.00). Straight-line (Haversine) distance from the store to the customer address.';

COMMENT ON COLUMN tenants.delivery_min_fee IS
  'Minimum delivery fee floor: fee = max(delivery_min_fee, distance_km * delivery_price_per_km).';

COMMENT ON COLUMN tenants.delivery_radius_km IS
  'Maximum deliverable straight-line distance in km. Addresses beyond this are blocked from delivery.';
