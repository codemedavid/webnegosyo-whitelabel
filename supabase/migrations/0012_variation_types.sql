-- Migration: Enhanced Variation Types System
-- This migration adds support for grouped variation types with images
-- 
-- Changes:
-- - menu_items.variation_types (JSONB) - New grouped variation system
-- - Keeps menu_items.variations (JSONB) for backward compatibility
--
-- The existing 'variations' field is kept for backward compatibility.
-- New menu items should use 'variation_types' for better organization.

-- Add comment to document the new variation_types structure
COMMENT ON COLUMN public.menu_items.variations IS 'Legacy flat variations array. Use variation_types for new items.';

-- Example of new variation_types structure:
/*
variation_types: [
  {
    "id": "type-1",
    "name": "Size",
    "is_required": true,
    "display_order": 0,
    "options": [
      {
        "id": "opt-1",
        "name": "Small (10\")",
        "price_modifier": 0,
        "image_url": "https://cloudinary.com/.../small-pizza.jpg",
        "is_default": true,
        "display_order": 0
      },
      {
        "id": "opt-2",
        "name": "Medium (12\")",
        "price_modifier": 4.00,
        "image_url": "https://cloudinary.com/.../medium-pizza.jpg",
        "is_default": false,
        "display_order": 1
      },
      {
        "id": "opt-3",
        "name": "Large (14\")",
        "price_modifier": 7.00,
        "image_url": "https://cloudinary.com/.../large-pizza.jpg",
        "is_default": false,
        "display_order": 2
      }
    ]
  },
  {
    "id": "type-2",
    "name": "Spice Level",
    "is_required": false,
    "display_order": 1,
    "options": [
      {
        "id": "opt-4",
        "name": "Mild",
        "price_modifier": 0,
        "is_default": true,
        "display_order": 0
      },
      {
        "id": "opt-5",
        "name": "Spicy",
        "price_modifier": 0,
        "display_order": 1
      },
      {
        "id": "opt-6",
        "name": "Extra Hot",
        "price_modifier": 1.50,
        "display_order": 2
      }
    ]
  }
]
*/

-- No structural changes needed - JSONB is flexible
-- The application layer handles both formats:
-- 1. Legacy: menu_items.variations (flat array)
-- 2. New: menu_items.variation_types (grouped with images)

