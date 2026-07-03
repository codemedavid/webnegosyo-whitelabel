-- Storefront coordinated palette knob (design-system preset)
-- Adds one per-tenant "pick once" control that restyles every storefront color
-- role at once: page background, surfaces, text, muted text, accent, accent ink,
-- and hairlines. It layers UNDER any explicit per-field color a merchant has set
-- (column > palette > default), so it is purely additive.
-- Defaults to 'theme' meaning "inherit the tenant's existing look", so existing
-- tenants render identically until a merchant opts into a palette.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS storefront_palette TEXT DEFAULT 'theme';

COMMENT ON COLUMN tenants.storefront_palette IS 'Storefront coordinated palette preset: theme | warm editorial | fine dining | cafe soft | bold diner | fresh green';
