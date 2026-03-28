-- Add boost_priority to menu_items for merchant "Push Item" flow
-- Higher value = more likely to appear in upsell suggestions
ALTER TABLE menu_items
ADD COLUMN IF NOT EXISTS boost_priority integer DEFAULT 0;

-- Index for efficient sorting by boost priority
CREATE INDEX IF NOT EXISTS idx_menu_items_boost_priority
ON menu_items (tenant_id, boost_priority DESC)
WHERE boost_priority > 0;
