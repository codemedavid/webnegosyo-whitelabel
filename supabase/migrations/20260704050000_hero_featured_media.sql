-- Hero featured media: a fallback image + link for the hero tile when no
-- product is attached. The featured product itself reuses the existing
-- hero_featured_product_id column (migration 20260704040000). Additive and
-- nullable so unset tenants keep the decorative brand-initial tile.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS hero_image_url text,
  ADD COLUMN IF NOT EXISTS hero_link_url text;

COMMENT ON COLUMN public.tenants.hero_image_url IS 'Fallback hero tile image shown when no featured product is attached. NULL = decorative tile.';
COMMENT ON COLUMN public.tenants.hero_link_url IS 'Where the fallback hero image links to when clicked (product page path or URL). NULL = not clickable.';
