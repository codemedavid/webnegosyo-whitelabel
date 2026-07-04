-- Per-device (mobile) branding overrides.
--
-- The Branding Studio lets a merchant give any field a distinct mobile value.
-- Rather than a `mobile_*` column per field (~250 columns), a single JSONB map
-- of column_name -> value is overlaid over the tenant/product columns at render
-- time when the viewport is mobile. An empty map ('{}') means "inherit desktop".
--
-- Applied at runtime by useBrandingPreviewTenant (src/hooks/use-branding-preview.ts)
-- and the product detail merge; edited on the mobile device tab of the Studio.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS mobile_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE product_detail_settings
  ADD COLUMN IF NOT EXISTS mobile_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN tenants.mobile_overrides IS
  'Mobile-only branding overrides: { tenant_column_name: value }. Overlaid over desktop columns on mobile viewports. Empty = inherit desktop.';
COMMENT ON COLUMN product_detail_settings.mobile_overrides IS
  'Mobile-only product-detail overrides: { column_name: value }. Overlaid on mobile viewports. Empty = inherit desktop.';
