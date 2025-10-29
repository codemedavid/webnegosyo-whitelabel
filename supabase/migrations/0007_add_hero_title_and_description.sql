-- Add hero title/description and their colors to tenants for menu hero customization

ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS hero_title text,
ADD COLUMN IF NOT EXISTS hero_description text,
ADD COLUMN IF NOT EXISTS hero_title_color text,
ADD COLUMN IF NOT EXISTS hero_description_color text;

COMMENT ON COLUMN public.tenants.hero_title IS 'Custom hero title shown on the menu page';
COMMENT ON COLUMN public.tenants.hero_description IS 'Custom hero description shown below the title on the menu page';
COMMENT ON COLUMN public.tenants.hero_title_color IS 'Hex/RGB color for the hero title';
COMMENT ON COLUMN public.tenants.hero_description_color IS 'Hex/RGB color for the hero description';


