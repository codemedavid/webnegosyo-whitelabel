-- Add promotion_banners JSONB column to tenants table
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS promotion_banners jsonb DEFAULT '[]'::jsonb;

-- COMMENT: Structure of promotion_banners JSONB array:
-- [
--   {
--     "id": "uuid-string",
--     "imageUrl": "https://example.com/image.jpg",
--     "title": "Optional Title",
--     "description": "Optional Description"
--   }
-- ]
