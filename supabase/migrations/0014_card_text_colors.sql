-- Add card text color customization fields
-- Allows tenants to customize title, price, and description colors on menu item cards

ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS card_title_color text,
ADD COLUMN IF NOT EXISTS card_price_color text,
ADD COLUMN IF NOT EXISTS card_description_color text;

-- Add helpful comments
COMMENT ON COLUMN public.tenants.card_title_color IS 'Color for menu item titles on cards (defaults to text_primary_color)';
COMMENT ON COLUMN public.tenants.card_price_color IS 'Color for prices on menu item cards (defaults to primary_color)';
COMMENT ON COLUMN public.tenants.card_description_color IS 'Color for descriptions on menu item cards (defaults to text_secondary_color)';

