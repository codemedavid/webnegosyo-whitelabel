-- Add manual upsell flag to menu_items
-- Admins can mark individual items to always appear in the checkout upsell interstitial
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS show_in_checkout_upsell boolean NOT NULL DEFAULT false;
