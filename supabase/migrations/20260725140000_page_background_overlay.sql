-- Custom page background: a merchant-supplied image plus a tint overlay,
-- rendered behind the storefront menu and product detail pages.
--
-- Every column is nullable with no default. An unset image URL and a zero /
-- unset overlay opacity mean "no custom background", so existing tenants are
-- visually unchanged until they configure this in the Branding Studio.
--
-- Opacities are stored as 0..100 integer percents (the editor renders them as
-- percent inputs); the storefront converts them to 0..1 CSS fractions in
-- src/lib/background-overlay.ts.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS background_image_url text,
  ADD COLUMN IF NOT EXISTS background_image_opacity integer,
  ADD COLUMN IF NOT EXISTS background_image_fit text,
  ADD COLUMN IF NOT EXISTS background_image_position text,
  ADD COLUMN IF NOT EXISTS background_image_attachment text,
  ADD COLUMN IF NOT EXISTS background_overlay_color text,
  ADD COLUMN IF NOT EXISTS background_overlay_opacity integer;

-- Range guards mirror the Zod schema in src/lib/branding-service.ts. Unknown
-- enum values are additionally ignored at render time (defensive resolver), so
-- these constraints protect the data, not the page.
ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_background_image_opacity_range;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_background_image_opacity_range
  CHECK (background_image_opacity IS NULL OR background_image_opacity BETWEEN 0 AND 100);

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_background_overlay_opacity_range;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_background_overlay_opacity_range
  CHECK (background_overlay_opacity IS NULL OR background_overlay_opacity BETWEEN 0 AND 100);

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_background_image_fit_valid;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_background_image_fit_valid
  CHECK (background_image_fit IS NULL OR background_image_fit IN ('cover', 'contain', 'repeat'));

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_background_image_position_valid;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_background_image_position_valid
  CHECK (background_image_position IS NULL OR background_image_position IN ('center', 'top', 'bottom'));

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_background_image_attachment_valid;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_background_image_attachment_valid
  CHECK (background_image_attachment IS NULL OR background_image_attachment IN ('scroll', 'fixed'));

COMMENT ON COLUMN public.tenants.background_image_url IS 'Custom page background image (storefront + product detail). NULL = none.';
COMMENT ON COLUMN public.tenants.background_image_opacity IS 'Background image opacity, 0-100 percent. NULL = 100.';
COMMENT ON COLUMN public.tenants.background_image_fit IS 'cover | contain | repeat. NULL = cover.';
COMMENT ON COLUMN public.tenants.background_image_position IS 'center | top | bottom. NULL = center.';
COMMENT ON COLUMN public.tenants.background_image_attachment IS 'scroll | fixed (parallax). NULL = scroll.';
COMMENT ON COLUMN public.tenants.background_overlay_color IS 'Hex tint laid over the background image. NULL = #000000.';
COMMENT ON COLUMN public.tenants.background_overlay_opacity IS 'Tint opacity, 0-100 percent. NULL/0 = no overlay layer.';
