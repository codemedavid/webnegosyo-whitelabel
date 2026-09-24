-- Storefront packs: whole-site storefront designs (src/lib/storefront-packs.ts).
--
-- storefront_pack picks the pack. No CHECK constraint, on purpose: new packs
-- ship without a migration (same rule as checkout_template/cart_template in
-- 20260616200000_checkout_cart_templates.sql). The app validates writes with
-- a zod enum, and any unknown value reads as 'legacy'.
--
-- storefront_pack_settings holds each pack's own settings under its id, e.g.
-- {"bitespeed": {"how_it_works_title": "..."}}. Per-pack JSON rather than a
-- column per setting, so a new pack never widens the tenants table. It is read
-- field by field with defaults, so bad data degrades to defaults, never an error.
--
-- Constant defaults: both columns are added as metadata only (no table
-- rewrite), and every existing tenant stays on the legacy storefront.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS storefront_pack text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS storefront_pack_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN tenants.storefront_pack IS
  'Whole-site storefront design (pack id). Unknown values render the legacy storefront.';
COMMENT ON COLUMN tenants.storefront_pack_settings IS
  'Per-pack settings keyed by pack id; each pack validates its own slice with defaults.';
