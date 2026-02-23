-- Add tenant-level layout controls and checkout interstitial branding fields
-- used by the menu branding editor overlay.

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS page_layout text DEFAULT 'default',
ADD COLUMN IF NOT EXISTS mobile_grid_columns integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS checkout_modal_background_color text,
ADD COLUMN IF NOT EXISTS checkout_modal_title_color text,
ADD COLUMN IF NOT EXISTS checkout_modal_description_color text,
ADD COLUMN IF NOT EXISTS checkout_modal_price_color text,
ADD COLUMN IF NOT EXISTS checkout_modal_button_color text,
ADD COLUMN IF NOT EXISTS checkout_modal_button_text_color text,
ADD COLUMN IF NOT EXISTS checkout_modal_border_color text;

-- Keep supported values tight for mobile grid rendering.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenants_mobile_grid_columns_check'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_mobile_grid_columns_check
      CHECK (mobile_grid_columns IS NULL OR mobile_grid_columns IN (1, 2));
  END IF;
END
$$;

UPDATE public.tenants
SET
  page_layout = COALESCE(page_layout, 'default'),
  mobile_grid_columns = COALESCE(mobile_grid_columns, 1)
WHERE page_layout IS NULL OR mobile_grid_columns IS NULL;

COMMENT ON COLUMN public.tenants.page_layout IS
  'Menu page layout preset. Example values: default, sidebar, magazine, grid-focus, list, mosaic.';
COMMENT ON COLUMN public.tenants.mobile_grid_columns IS
  'Number of menu cards per row on mobile devices. Supported values: 1 or 2.';
COMMENT ON COLUMN public.tenants.checkout_modal_background_color IS
  'Checkout interstitial modal background color.';
COMMENT ON COLUMN public.tenants.checkout_modal_title_color IS
  'Checkout interstitial modal title color.';
COMMENT ON COLUMN public.tenants.checkout_modal_description_color IS
  'Checkout interstitial modal description text color.';
COMMENT ON COLUMN public.tenants.checkout_modal_price_color IS
  'Checkout interstitial modal price text color.';
COMMENT ON COLUMN public.tenants.checkout_modal_button_color IS
  'Checkout interstitial modal button background color.';
COMMENT ON COLUMN public.tenants.checkout_modal_button_text_color IS
  'Checkout interstitial modal button text color.';
COMMENT ON COLUMN public.tenants.checkout_modal_border_color IS
  'Checkout interstitial modal border color.';
