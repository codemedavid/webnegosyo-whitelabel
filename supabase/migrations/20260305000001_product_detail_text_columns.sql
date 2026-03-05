-- Add missing text columns to product_detail_settings table.
-- These fields exist in the TypeScript interface and UI but were missing from the DB,
-- causing "unexpected response" errors on save.

ALTER TABLE public.product_detail_settings
ADD COLUMN IF NOT EXISTS variation_required_text text,
ADD COLUMN IF NOT EXISTS variation_optional_text text,
ADD COLUMN IF NOT EXISTS addon_optional_text text,
ADD COLUMN IF NOT EXISTS footer_empty_summary_text text,
ADD COLUMN IF NOT EXISTS buy_now_button_label text,
ADD COLUMN IF NOT EXISTS add_to_cart_button_label text;

COMMENT ON COLUMN public.product_detail_settings.variation_required_text IS 'Label for required variation groups (default: * Pick 1)';
COMMENT ON COLUMN public.product_detail_settings.variation_optional_text IS 'Label for optional variation groups (default: Optional)';
COMMENT ON COLUMN public.product_detail_settings.addon_optional_text IS 'Label for optional addon sections (default: (Optional))';
COMMENT ON COLUMN public.product_detail_settings.footer_empty_summary_text IS 'Text shown when no variations selected (default: Standard)';
COMMENT ON COLUMN public.product_detail_settings.buy_now_button_label IS 'Buy Now button text (default: Buy Now)';
COMMENT ON COLUMN public.product_detail_settings.add_to_cart_button_label IS 'Add to Cart button text (default: Add To Cart)';

-- Force PostgREST to reload schema cache
DO $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
