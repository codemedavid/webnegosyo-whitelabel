-- Add messenger_page_access_token column to tenants table
-- Allows tenant admins to configure their own Facebook Page Access Token

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS messenger_page_access_token text;

-- Add comment for documentation
COMMENT ON COLUMN public.tenants.messenger_page_access_token IS 
  'Tenant-specific Facebook Page Access Token. If not set, falls back to global FACEBOOK_PAGE_ACCESS_TOKEN environment variable. Allows each restaurant to connect their own Facebook page independently.';

-- Note: Consider encrypting this field in production for security
-- For now, storing as plain text. Production deployments should use encryption.

