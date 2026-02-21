-- Extend product detail branding settings with configurable labels/text.
-- Created: 2026-02-18

ALTER TABLE public.product_detail_settings
  ADD COLUMN IF NOT EXISTS buy_now_button_label text DEFAULT 'Buy Now',
  ADD COLUMN IF NOT EXISTS add_to_cart_button_label text DEFAULT 'Add To Cart',
  ADD COLUMN IF NOT EXISTS footer_empty_summary_text text DEFAULT 'Standard',
  ADD COLUMN IF NOT EXISTS variation_required_text text DEFAULT '* Pick 1',
  ADD COLUMN IF NOT EXISTS variation_optional_text text DEFAULT 'Optional',
  ADD COLUMN IF NOT EXISTS addon_optional_text text DEFAULT '(Optional)';

COMMENT ON COLUMN public.product_detail_settings.buy_now_button_label
  IS 'Label text for the Buy Now footer button';
COMMENT ON COLUMN public.product_detail_settings.add_to_cart_button_label
  IS 'Label text for the Add to Cart footer button';
COMMENT ON COLUMN public.product_detail_settings.footer_empty_summary_text
  IS 'Fallback footer summary text when no variation/add-on is selected';
COMMENT ON COLUMN public.product_detail_settings.variation_required_text
  IS 'Text shown beside required variation groups';
COMMENT ON COLUMN public.product_detail_settings.variation_optional_text
  IS 'Text shown beside optional variation groups';
COMMENT ON COLUMN public.product_detail_settings.addon_optional_text
  IS 'Text shown beside the add-ons section title';
