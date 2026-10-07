-- Free delivery above a minimum order ("Free delivery on orders ₱500+").
--
-- When a delivery order's item subtotal (before vouchers) reaches this amount,
-- the delivery fee is waived. Applies to whichever fee source the store uses:
-- the distance formula or a Lalamove quote (the store still books the courier
-- and absorbs the cost). Enforced in createOrderAction via src/lib/free-delivery.ts;
-- the checkout only previews it.
--
-- NULL = off, so every existing store is unaffected. Tenant admins set it from
-- Settings → Delivery (not a privileged column).

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS free_delivery_min_order numeric(10, 2)
    CHECK (free_delivery_min_order IS NULL OR free_delivery_min_order > 0);

COMMENT ON COLUMN tenants.free_delivery_min_order IS
  'Delivery fee is waived when the pre-discount item subtotal is at least this amount. NULL = no free delivery.';
