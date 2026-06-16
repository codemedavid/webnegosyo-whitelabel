-- Main header template system + per-tenant header customization.
-- Adds a selectable header layout (with an optional mobile override) plus
-- element toggles, a tagline, logo shape, and height controls.
-- All columns are additive with safe defaults so existing tenants are unaffected.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS header_template text NOT NULL DEFAULT 'classic',
  ADD COLUMN IF NOT EXISTS mobile_header_template text,
  ADD COLUMN IF NOT EXISTS header_show_logo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS header_show_name boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS header_show_cart boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS header_show_search boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS header_tagline text,
  ADD COLUMN IF NOT EXISTS header_tagline_color text,
  ADD COLUMN IF NOT EXISTS header_sticky boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS header_blur boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS header_shadow boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS header_logo_shape text NOT NULL DEFAULT 'circle'
    CHECK (header_logo_shape IN ('circle', 'rounded', 'square')),
  ADD COLUMN IF NOT EXISTS header_height text NOT NULL DEFAULT 'standard'
    CHECK (header_height IN ('compact', 'standard', 'tall'));

COMMENT ON COLUMN public.tenants.header_template IS
  'Main header layout: classic, centered, minimal, split, banner, or stacked';
COMMENT ON COLUMN public.tenants.mobile_header_template IS
  'Header layout for mobile (<768px); falls back to header_template when null';
COMMENT ON COLUMN public.tenants.header_show_logo IS 'Show the logo in the main header';
COMMENT ON COLUMN public.tenants.header_show_name IS 'Show the restaurant name in the main header';
COMMENT ON COLUMN public.tenants.header_show_cart IS 'Show the cart button in the main header';
COMMENT ON COLUMN public.tenants.header_show_search IS 'Show an inline search bar in the main header';
COMMENT ON COLUMN public.tenants.header_tagline IS 'Optional tagline shown under the restaurant name';
COMMENT ON COLUMN public.tenants.header_tagline_color IS 'Color of the header tagline (inherits subtitle color when null)';
COMMENT ON COLUMN public.tenants.header_sticky IS 'Stick the header to the top of the viewport on scroll';
COMMENT ON COLUMN public.tenants.header_blur IS 'Apply a backdrop blur to the header background';
COMMENT ON COLUMN public.tenants.header_shadow IS 'Apply a drop shadow beneath the header';
COMMENT ON COLUMN public.tenants.header_logo_shape IS 'Logo shape in the header: circle, rounded, or square';
COMMENT ON COLUMN public.tenants.header_height IS 'Header height: compact, standard, or tall';
