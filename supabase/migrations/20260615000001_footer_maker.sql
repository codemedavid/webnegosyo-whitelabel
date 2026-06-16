ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS footer_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS footer_theme text NOT NULL DEFAULT 'auto'
    CHECK (footer_theme IN ('auto', 'light', 'dark', 'brand', 'midnight', 'minimal', 'custom')),
  ADD COLUMN IF NOT EXISTS footer_logo_url text,
  ADD COLUMN IF NOT EXISTS footer_business_name text,
  ADD COLUMN IF NOT EXISTS footer_tagline text,
  ADD COLUMN IF NOT EXISTS footer_address text,
  ADD COLUMN IF NOT EXISTS footer_phone text,
  ADD COLUMN IF NOT EXISTS footer_whatsapp text,
  ADD COLUMN IF NOT EXISTS footer_viber text,
  ADD COLUMN IF NOT EXISTS footer_email text,
  ADD COLUMN IF NOT EXISTS footer_facebook_url text,
  ADD COLUMN IF NOT EXISTS footer_instagram_url text,
  ADD COLUMN IF NOT EXISTS footer_tiktok_url text,
  ADD COLUMN IF NOT EXISTS footer_twitter_url text,
  ADD COLUMN IF NOT EXISTS footer_youtube_url text,
  ADD COLUMN IF NOT EXISTS footer_about_us text,
  ADD COLUMN IF NOT EXISTS footer_terms_of_service text,
  ADD COLUMN IF NOT EXISTS footer_refund_policy text,
  ADD COLUMN IF NOT EXISTS footer_privacy_policy text,
  ADD COLUMN IF NOT EXISTS footer_copyright_text text,
  ADD COLUMN IF NOT EXISTS footer_show_powered_by boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS footer_powered_by_text text,
  ADD COLUMN IF NOT EXISTS footer_background_color text,
  ADD COLUMN IF NOT EXISTS footer_text_color text,
  ADD COLUMN IF NOT EXISTS footer_heading_color text,
  ADD COLUMN IF NOT EXISTS footer_link_color text,
  ADD COLUMN IF NOT EXISTS footer_muted_color text,
  ADD COLUMN IF NOT EXISTS footer_icon_color text,
  ADD COLUMN IF NOT EXISTS footer_icon_background_color text,
  ADD COLUMN IF NOT EXISTS footer_border_color text;

COMMENT ON COLUMN tenants.footer_enabled IS 'Toggle visibility of the storefront footer';
COMMENT ON COLUMN tenants.footer_theme IS 'auto | light | dark | brand | midnight | minimal | custom';
COMMENT ON COLUMN tenants.footer_logo_url IS 'Footer logo image URL; falls back to logo_url';
COMMENT ON COLUMN tenants.footer_business_name IS 'Footer business name; falls back to tenant name';
COMMENT ON COLUMN tenants.footer_tagline IS 'Short tagline shown under the business name';
COMMENT ON COLUMN tenants.footer_address IS 'Footer address row; falls back to restaurant_address';
COMMENT ON COLUMN tenants.footer_phone IS 'Footer contact phone number';
COMMENT ON COLUMN tenants.footer_whatsapp IS 'Footer WhatsApp number';
COMMENT ON COLUMN tenants.footer_viber IS 'Footer Viber number';
COMMENT ON COLUMN tenants.footer_email IS 'Footer contact email address';
COMMENT ON COLUMN tenants.footer_facebook_url IS 'Footer Facebook social link';
COMMENT ON COLUMN tenants.footer_instagram_url IS 'Footer Instagram social link';
COMMENT ON COLUMN tenants.footer_tiktok_url IS 'Footer TikTok social link';
COMMENT ON COLUMN tenants.footer_twitter_url IS 'Footer Twitter/X social link';
COMMENT ON COLUMN tenants.footer_youtube_url IS 'Footer YouTube social link';
COMMENT ON COLUMN tenants.footer_about_us IS 'About Us content page text';
COMMENT ON COLUMN tenants.footer_terms_of_service IS 'Terms of Service content page text';
COMMENT ON COLUMN tenants.footer_refund_policy IS 'Refund / Cancellation Policy content page text';
COMMENT ON COLUMN tenants.footer_privacy_policy IS 'Privacy Policy content page text';
COMMENT ON COLUMN tenants.footer_copyright_text IS 'Custom copyright line; falls back to auto-generated text';
COMMENT ON COLUMN tenants.footer_show_powered_by IS 'Toggle the Powered by WebNegosyo attribution';
COMMENT ON COLUMN tenants.footer_powered_by_text IS 'Custom powered-by text; defaults to Powered by WebNegosyo';
COMMENT ON COLUMN tenants.footer_background_color IS 'Override footer background color (hex)';
COMMENT ON COLUMN tenants.footer_text_color IS 'Override footer body text color (hex)';
COMMENT ON COLUMN tenants.footer_heading_color IS 'Override footer heading color (hex)';
COMMENT ON COLUMN tenants.footer_link_color IS 'Override footer link color (hex)';
COMMENT ON COLUMN tenants.footer_muted_color IS 'Override footer muted text color (hex)';
COMMENT ON COLUMN tenants.footer_icon_color IS 'Override footer icon glyph color (hex)';
COMMENT ON COLUMN tenants.footer_icon_background_color IS 'Override footer icon circle background color (hex)';
COMMENT ON COLUMN tenants.footer_border_color IS 'Override footer border color (hex)';
