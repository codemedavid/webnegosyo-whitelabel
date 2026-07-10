-- Hero element colors: per-element styling for the storefront hero section.
-- Blank/null falls back to the global palette (accent, button text, title
-- color), mirroring the Branding Studio registry inherit chains.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS hero_background_color TEXT,
  ADD COLUMN IF NOT EXISTS hero_kicker_color TEXT,
  ADD COLUMN IF NOT EXISTS hero_cta_primary_color TEXT,
  ADD COLUMN IF NOT EXISTS hero_cta_primary_text_color TEXT,
  ADD COLUMN IF NOT EXISTS hero_cta_secondary_text_color TEXT;

COMMENT ON COLUMN tenants.hero_background_color IS 'Hero section background; null = transparent (page background)';
COMMENT ON COLUMN tenants.hero_kicker_color IS 'Hero kicker/eyebrow text color; null = accent color';
COMMENT ON COLUMN tenants.hero_cta_primary_color IS 'Primary hero CTA background; null = accent color';
COMMENT ON COLUMN tenants.hero_cta_primary_text_color IS 'Primary hero CTA text; null = button primary text color';
COMMENT ON COLUMN tenants.hero_cta_secondary_text_color IS 'Secondary hero CTA text; null = hero title color';
