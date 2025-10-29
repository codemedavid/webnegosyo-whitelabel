-- Add Mapbox Enabled Toggle Migration
-- Allows superadmin to enable/disable Mapbox functionality per tenant

-- Add mapbox_enabled column to tenants table
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS mapbox_enabled boolean DEFAULT true;

-- Update existing tenants to have Mapbox enabled by default
UPDATE public.tenants 
SET mapbox_enabled = true
WHERE mapbox_enabled IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.tenants.mapbox_enabled IS 'Enable/disable Mapbox address autocomplete and map picker for this tenant';

