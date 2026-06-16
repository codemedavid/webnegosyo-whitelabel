-- Footer social link display names.
-- Optional label shown next to each social icon in the storefront footer.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS footer_facebook_name text,
  ADD COLUMN IF NOT EXISTS footer_instagram_name text,
  ADD COLUMN IF NOT EXISTS footer_tiktok_name text,
  ADD COLUMN IF NOT EXISTS footer_twitter_name text,
  ADD COLUMN IF NOT EXISTS footer_youtube_name text;

COMMENT ON COLUMN tenants.footer_facebook_name IS 'Footer Facebook display name/label';
COMMENT ON COLUMN tenants.footer_instagram_name IS 'Footer Instagram display name/label';
COMMENT ON COLUMN tenants.footer_tiktok_name IS 'Footer TikTok display name/label';
COMMENT ON COLUMN tenants.footer_twitter_name IS 'Footer Twitter/X display name/label';
COMMENT ON COLUMN tenants.footer_youtube_name IS 'Footer YouTube display name/label';
