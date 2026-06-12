-- Extract every distinct Cloudinary URL referenced anywhere in the database.
-- Run in the Supabase SQL editor (or via the Supabase MCP) and export the
-- `url` column to cloudinary-backup/urls.txt (one per line) to refresh the
-- backup input.
--
-- Covers every text/jsonb column that can hold an image URL. If new image
-- columns are added to the schema later, add them to the src CTE below.
WITH src AS (
  SELECT image_url::text v FROM menu_items WHERE image_url ~ 'cloudinary'
  UNION ALL SELECT addons::text FROM menu_items WHERE addons::text ~ 'cloudinary'
  UNION ALL SELECT variation_types::text FROM menu_items WHERE variation_types::text ~ 'cloudinary'
  UNION ALL SELECT variations::text FROM menu_items WHERE variations::text ~ 'cloudinary'
  UNION ALL SELECT image_url::text FROM bundles WHERE image_url ~ 'cloudinary'
  UNION ALL SELECT icon::text FROM categories WHERE icon ~ 'cloudinary'
  UNION ALL SELECT default_addons::text FROM categories WHERE default_addons::text ~ 'cloudinary'
  UNION ALL SELECT logo_url::text FROM tenants WHERE logo_url ~ 'cloudinary'
  UNION ALL SELECT flash_screen_image_url::text FROM tenants WHERE flash_screen_image_url ~ 'cloudinary'
  UNION ALL SELECT promotion_image_url::text FROM tenants WHERE promotion_image_url ~ 'cloudinary'
  UNION ALL SELECT promotion_banners::text FROM tenants WHERE promotion_banners::text ~ 'cloudinary'
  UNION ALL SELECT qr_code_url::text FROM payment_methods WHERE qr_code_url ~ 'cloudinary'
  UNION ALL SELECT qr_code_url::text FROM platform_payment_methods WHERE qr_code_url ~ 'cloudinary'
  UNION ALL SELECT payment_method_qr_code_url::text FROM orders WHERE payment_method_qr_code_url ~ 'cloudinary'
  UNION ALL SELECT payment_proof_url::text FROM checkout_leads WHERE payment_proof_url ~ 'cloudinary'
)
SELECT DISTINCT (regexp_matches(v, 'https?://res\.cloudinary\.com/[^\s"''\\)]+', 'g'))[1] AS url
FROM src
ORDER BY 1;
