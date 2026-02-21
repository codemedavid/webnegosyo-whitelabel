-- Add menu-level branding controls for focused customization from inline pencils.
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS menu_main_header_text_color text,
ADD COLUMN IF NOT EXISTS menu_main_header_subtitle_color text,
ADD COLUMN IF NOT EXISTS menu_category_header_color text,
ADD COLUMN IF NOT EXISTS menu_category_active_color text,
ADD COLUMN IF NOT EXISTS menu_category_inactive_color text,
ADD COLUMN IF NOT EXISTS menu_cart_badge_background_color text,
ADD COLUMN IF NOT EXISTS menu_cart_badge_text_color text;

COMMENT ON COLUMN public.tenants.menu_main_header_text_color IS 'Menu top header title color';
COMMENT ON COLUMN public.tenants.menu_main_header_subtitle_color IS 'Menu top header subtitle color';
COMMENT ON COLUMN public.tenants.menu_category_header_color IS 'Category section header/title color on menu layouts';
COMMENT ON COLUMN public.tenants.menu_category_active_color IS 'Active category tab/chip color';
COMMENT ON COLUMN public.tenants.menu_category_inactive_color IS 'Inactive category tab/chip color';
COMMENT ON COLUMN public.tenants.menu_cart_badge_background_color IS 'Cart badge background color on menu';
COMMENT ON COLUMN public.tenants.menu_cart_badge_text_color IS 'Cart badge text color on menu';
