-- Add modal branding customization fields
-- Allows tenants to customize the appearance of item detail modals

ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS modal_background_color text,
ADD COLUMN IF NOT EXISTS modal_title_color text,
ADD COLUMN IF NOT EXISTS modal_price_color text,
ADD COLUMN IF NOT EXISTS modal_description_color text;

-- Add helpful comments
COMMENT ON COLUMN public.tenants.modal_background_color IS 'Background color for item detail modals (defaults to cards_color)';
COMMENT ON COLUMN public.tenants.modal_title_color IS 'Title color in item detail modals (defaults to text_primary_color)';
COMMENT ON COLUMN public.tenants.modal_price_color IS 'Price color in item detail modals (defaults to primary_color)';
COMMENT ON COLUMN public.tenants.modal_description_color IS 'Description color in item detail modals (defaults to text_secondary_color)';

