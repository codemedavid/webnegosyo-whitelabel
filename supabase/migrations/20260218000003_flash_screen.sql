-- Flash screen support:
-- 1) Superadmin feature entitlement per tenant
-- 2) Tenant-admin configurable startup flash screen content

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS flash_screen_feature_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS flash_screen_is_active boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS flash_screen_title text DEFAULT 'Loading menu...',
ADD COLUMN IF NOT EXISTS flash_screen_subtitle text,
ADD COLUMN IF NOT EXISTS flash_screen_image_url text,
ADD COLUMN IF NOT EXISTS flash_screen_background_color text DEFAULT '#111111',
ADD COLUMN IF NOT EXISTS flash_screen_text_color text DEFAULT '#ffffff',
ADD COLUMN IF NOT EXISTS flash_screen_duration_ms integer DEFAULT 2000;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_flash_screen_duration_ms_check'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_flash_screen_duration_ms_check
      CHECK (
        flash_screen_duration_ms IS NULL
        OR (flash_screen_duration_ms >= 500 AND flash_screen_duration_ms <= 15000)
      );
  END IF;
END $$;

COMMENT ON COLUMN public.tenants.flash_screen_feature_enabled IS
  'Superadmin entitlement toggle. When false, tenant admin cannot manage flash screen settings.';
COMMENT ON COLUMN public.tenants.flash_screen_is_active IS
  'Controls whether the flash screen is shown to customers on initial app open.';
COMMENT ON COLUMN public.tenants.flash_screen_title IS
  'Primary heading shown on the flash screen.';
COMMENT ON COLUMN public.tenants.flash_screen_subtitle IS
  'Secondary text shown on the flash screen.';
COMMENT ON COLUMN public.tenants.flash_screen_image_url IS
  'Optional image/logo URL shown on the flash screen.';
COMMENT ON COLUMN public.tenants.flash_screen_background_color IS
  'Background color used by the flash screen.';
COMMENT ON COLUMN public.tenants.flash_screen_text_color IS
  'Primary text and spinner color used by the flash screen.';
COMMENT ON COLUMN public.tenants.flash_screen_duration_ms IS
  'How long the flash screen remains visible (500-15000 ms).';
