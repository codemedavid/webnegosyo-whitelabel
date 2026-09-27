-- Senior-friendly ordering mode (src/lib/senior-mode.ts).
--
-- A merchant toggle in Branding Studio → Storefront → Easy ordering for stores
-- whose customers are older: larger text, a labelled cart bar pinned to the
-- bottom of the menu, labelled back buttons, a clear "Added to your cart"
-- confirmation, and a numbered step tracker on cart/checkout.
--
-- Deliberately NOT added to guard_tenant_privileged_columns: it is a
-- presentation setting the store's own admins write through the Studio.
-- Default false, so every existing storefront renders exactly as before.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS senior_friendly_mode boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN tenants.senior_friendly_mode IS
  'Senior-friendly ordering: larger text, bottom cart bar, labelled back buttons, add-to-cart confirmation, step tracker';
