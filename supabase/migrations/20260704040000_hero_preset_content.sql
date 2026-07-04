-- Rich storefront hero presets: editable content the hero templates render.
-- Additive columns only — a tenant that never sets them is byte-identical to
-- today (the hero presets render a clean title/description when they are blank).

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS hero_kicker text,
  ADD COLUMN IF NOT EXISTS hero_cta_primary_label text,
  ADD COLUMN IF NOT EXISTS hero_cta_secondary_label text,
  ADD COLUMN IF NOT EXISTS hero_featured_product_id uuid
    REFERENCES public.menu_items(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tenants.hero_kicker IS 'Uppercase eyebrow shown above the hero title on the rich hero presets.';
COMMENT ON COLUMN public.tenants.hero_cta_primary_label IS 'Primary hero button label (rich hero presets). Button hidden when blank.';
COMMENT ON COLUMN public.tenants.hero_cta_secondary_label IS 'Secondary hero button label (editorial/banner presets). Button hidden when blank.';
COMMENT ON COLUMN public.tenants.hero_featured_product_id IS 'Menu item featured in the split-hero badge. NULL = no featured product.';
