-- Migration: Add variation_types column to menu_items table
-- This migration adds the missing variation_types column that was documented but not created in 0012

-- Add variation_types column
ALTER TABLE public.menu_items 
ADD COLUMN IF NOT EXISTS variation_types jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Add comment to document the structure
COMMENT ON COLUMN public.menu_items.variation_types IS 'Grouped variation types with options. Each type can have multiple options with images.';

-- The table now has both columns for backward compatibility:
-- - variations: Legacy flat array format
-- - variation_types: New grouped format with images and required/optional flags

