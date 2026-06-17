-- Dedicated per-tenant color controls for the Cart and Checkout PAGES.
-- These are distinct from the existing checkout_modal_* fields, which style the
-- checkout interstitial upsell modal (not the page). Every column is nullable
-- with no default: an unset value means "inherit" — the cart/checkout designs
-- fall back to the tenant's global brand colors, so existing tenants are
-- visually unchanged until they set these.

ALTER TABLE public.tenants
  -- Cart page palette
  ADD COLUMN IF NOT EXISTS cart_background_color text,
  ADD COLUMN IF NOT EXISTS cart_card_background_color text,
  ADD COLUMN IF NOT EXISTS cart_text_color text,
  ADD COLUMN IF NOT EXISTS cart_muted_text_color text,
  ADD COLUMN IF NOT EXISTS cart_accent_color text,
  ADD COLUMN IF NOT EXISTS cart_button_color text,
  ADD COLUMN IF NOT EXISTS cart_button_text_color text,
  ADD COLUMN IF NOT EXISTS cart_border_color text,
  ADD COLUMN IF NOT EXISTS cart_summary_background_color text,
  -- Checkout page palette
  ADD COLUMN IF NOT EXISTS checkout_background_color text,
  ADD COLUMN IF NOT EXISTS checkout_card_background_color text,
  ADD COLUMN IF NOT EXISTS checkout_text_color text,
  ADD COLUMN IF NOT EXISTS checkout_muted_text_color text,
  ADD COLUMN IF NOT EXISTS checkout_accent_color text,
  ADD COLUMN IF NOT EXISTS checkout_button_color text,
  ADD COLUMN IF NOT EXISTS checkout_button_text_color text,
  ADD COLUMN IF NOT EXISTS checkout_border_color text,
  ADD COLUMN IF NOT EXISTS checkout_summary_background_color text;

-- Cart page palette
COMMENT ON COLUMN public.tenants.cart_background_color IS 'Cart page background. Unset = inherit design default / global brand background.';
COMMENT ON COLUMN public.tenants.cart_card_background_color IS 'Cart line-item card background. Unset = inherit design default.';
COMMENT ON COLUMN public.tenants.cart_text_color IS 'Cart primary text color. Unset = inherit design default.';
COMMENT ON COLUMN public.tenants.cart_muted_text_color IS 'Cart secondary/muted text color. Unset = inherit design default.';
COMMENT ON COLUMN public.tenants.cart_accent_color IS 'Cart accent (prices, badges, highlights). Unset = button_primary_color then primary_color.';
COMMENT ON COLUMN public.tenants.cart_button_color IS 'Cart primary CTA (Proceed to Checkout) background. Unset = cart accent.';
COMMENT ON COLUMN public.tenants.cart_button_text_color IS 'Cart primary CTA text. Unset = auto contrast against the button color.';
COMMENT ON COLUMN public.tenants.cart_border_color IS 'Cart dividers/borders. Unset = inherit design default.';
COMMENT ON COLUMN public.tenants.cart_summary_background_color IS 'Cart order-summary card / sticky bar background. Unset = inherit design default.';

-- Checkout page palette
COMMENT ON COLUMN public.tenants.checkout_background_color IS 'Checkout page background. Unset = inherit design default / global brand background.';
COMMENT ON COLUMN public.tenants.checkout_card_background_color IS 'Checkout section/card background. Unset = inherit design default.';
COMMENT ON COLUMN public.tenants.checkout_text_color IS 'Checkout primary text color. Unset = inherit design default.';
COMMENT ON COLUMN public.tenants.checkout_muted_text_color IS 'Checkout secondary/muted text color. Unset = inherit design default.';
COMMENT ON COLUMN public.tenants.checkout_accent_color IS 'Checkout accent (selected states, prices, highlights). Unset = button_primary_color then primary_color.';
COMMENT ON COLUMN public.tenants.checkout_button_color IS 'Checkout primary CTA (Proceed to Payment) background. Unset = checkout accent.';
COMMENT ON COLUMN public.tenants.checkout_button_text_color IS 'Checkout primary CTA text. Unset = auto contrast against the button color.';
COMMENT ON COLUMN public.tenants.checkout_border_color IS 'Checkout dividers/borders. Unset = inherit design default.';
COMMENT ON COLUMN public.tenants.checkout_summary_background_color IS 'Checkout order-summary card / sticky bar background. Unset = inherit design default.';
