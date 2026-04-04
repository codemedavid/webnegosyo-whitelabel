-- Add included_item_ids to bundle_slots
-- NULL = all items from category (backward compatible)
-- Non-null array = only these specific items are available in the slot
ALTER TABLE bundle_slots ADD COLUMN included_item_ids TEXT[] DEFAULT NULL;
