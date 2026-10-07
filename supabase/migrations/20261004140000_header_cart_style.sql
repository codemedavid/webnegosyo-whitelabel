-- Header cart button style (Branding Studio → Header → Cart button).
-- 'emoji' is the original 🛒, so existing tenants render unchanged.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS header_cart_style text NOT NULL DEFAULT 'emoji'
    CHECK (header_cart_style IN ('emoji', 'icon', 'pill', 'outline'));

COMMENT ON COLUMN public.tenants.header_cart_style IS
  'Header cart button look: emoji (original), icon, pill, or outline';
