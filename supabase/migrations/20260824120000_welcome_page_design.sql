-- Multi-branch WELCOME page: design, promos and entry choice for the starter
-- screen shown before the storefront (mode tiles → branch list).
--
-- Purely additive. No renames, no drops, no backfill. Every existing tenant
-- row keeps its exact current screen: order-type tiles, no banners, default
-- styling.
--
--   welcome_entry_mode      — 'order_types' (today's tiles) or 'single_cta'
--                             (one big button that jumps straight to the
--                             branch list; order type is asked at checkout,
--                             the flow outlet_selection_timing='after'
--                             already proves out).
--   welcome_show_order_types— tiles visibility toggle within 'order_types'.
--   welcome_cta_text        — custom label for the big button.
--   welcome_page_banners    — promo banners for THIS page, separate from the
--                             menu's promotion_banners; each entry carries a
--                             format: landscape | portrait | square.
--   welcome_*_color         — explicit palette overrides; NULL = keep the
--                             screen's default styling (same contract as the
--                             cart/checkout page palettes).
--
-- Application-side single source of truth: src/lib/outlets/welcome-page.ts —
-- unknown values there read as today's behaviour, so a bad write degrades to
-- the shipped screen, never to a broken one.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS welcome_entry_mode TEXT NOT NULL DEFAULT 'order_types';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS welcome_show_order_types BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS welcome_cta_text TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS welcome_heading_text TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS welcome_subheading_text TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS welcome_page_banners JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS welcome_background_color TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS welcome_heading_color TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS welcome_subtext_color TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS welcome_tile_background_color TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS welcome_tile_icon_color TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS welcome_tile_text_color TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS welcome_cta_background_color TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS welcome_cta_text_color TEXT;

COMMENT ON COLUMN tenants.welcome_entry_mode IS
  'How the customer enters the multi-branch welcome page: order_types (mode tiles, the shipped default) or single_cta (one button straight to the branch list).';
COMMENT ON COLUMN tenants.welcome_page_banners IS
  'Promo banners for the welcome page, separate from promotion_banners. Array of {id, imageUrl, format: landscape|portrait|square, title?, description?}.';

-- Constrained rather than free text so a typo cannot leave the page with no
-- entry affordance at all. The application layer additionally reads anything
-- unexpected as 'order_types'; this is the second line of that same defence.
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_welcome_entry_mode_ck;
ALTER TABLE tenants ADD CONSTRAINT tenants_welcome_entry_mode_ck
  CHECK (welcome_entry_mode IN ('order_types', 'single_cta'));

-- ============================================
-- Rollback (manual)
-- ============================================
-- ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_welcome_entry_mode_ck;
-- ALTER TABLE tenants DROP COLUMN IF EXISTS welcome_entry_mode;
-- ALTER TABLE tenants DROP COLUMN IF EXISTS welcome_show_order_types;
-- ALTER TABLE tenants DROP COLUMN IF EXISTS welcome_cta_text;
-- ALTER TABLE tenants DROP COLUMN IF EXISTS welcome_heading_text;
-- ALTER TABLE tenants DROP COLUMN IF EXISTS welcome_subheading_text;
-- ALTER TABLE tenants DROP COLUMN IF EXISTS welcome_page_banners;
-- ALTER TABLE tenants DROP COLUMN IF EXISTS welcome_background_color;
-- ALTER TABLE tenants DROP COLUMN IF EXISTS welcome_heading_color;
-- ALTER TABLE tenants DROP COLUMN IF EXISTS welcome_subtext_color;
-- ALTER TABLE tenants DROP COLUMN IF EXISTS welcome_tile_background_color;
-- ALTER TABLE tenants DROP COLUMN IF EXISTS welcome_tile_icon_color;
-- ALTER TABLE tenants DROP COLUMN IF EXISTS welcome_tile_text_color;
-- ALTER TABLE tenants DROP COLUMN IF EXISTS welcome_cta_background_color;
-- ALTER TABLE tenants DROP COLUMN IF EXISTS welcome_cta_text_color;
