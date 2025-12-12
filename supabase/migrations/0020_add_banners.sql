-- Add banner fields to tenants table
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS announcement_text text,
ADD COLUMN IF NOT EXISTS announcement_bg_color text DEFAULT '#FFF4E5',
ADD COLUMN IF NOT EXISTS announcement_text_color text DEFAULT '#663C00',
ADD COLUMN IF NOT EXISTS is_announcement_visible boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS promotion_image_url text,
ADD COLUMN IF NOT EXISTS is_promotion_visible boolean DEFAULT false;
