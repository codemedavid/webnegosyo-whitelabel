-- Storefront theme knobs (design-system presets)
-- Adds three per-tenant "pick once" controls that cascade across the storefront:
--   font_pair      — heading/body font pairing preset
--   card_roundness — global corner radius preset
--   brand_color    — accent/brand color that overrides accent_color when set
-- All default to 'theme'/NULL meaning "inherit the tenant's existing look",
-- so existing tenants render identically until a merchant opts in.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS font_pair TEXT DEFAULT 'theme',
  ADD COLUMN IF NOT EXISTS card_roundness TEXT DEFAULT 'theme',
  ADD COLUMN IF NOT EXISTS brand_color TEXT;

COMMENT ON COLUMN tenants.font_pair IS 'Storefront font pairing preset: theme | elegant serif | bold display | modern sans | warm editorial';
COMMENT ON COLUMN tenants.card_roundness IS 'Storefront corner radius preset: theme | sharp | soft | round';
COMMENT ON COLUMN tenants.brand_color IS 'Accent/brand color; overrides accent_color across the storefront when set';
