-- Inventory system — Phase 5C: the way back onto the menu after auto-86
--
-- Phase 5B could take an item off the menu when a base ingredient ran out, but
-- nothing ever put it back. A merchant who restocked found the dish still
-- hidden, and the alert that would have explained it had already auto-resolved
-- on the very delivery that fixed the stock.
--
-- Re-enabling needs one thing the database did not record: WHO turned the item
-- off. `is_available = false` means the same whether this system hid the item
-- or the merchant did, and putting the merchant's deliberately-hidden item back
-- on sale is a worse failure than leaving an auto-86'd one hidden. This column
-- is that marker — set when auto-86 hides an item, cleared when stock recovers
-- and it goes back on the menu.
--
-- Additive & reversible: one nullable column. Rollback block at the end.

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS auto_disabled_at TIMESTAMPTZ;

COMMENT ON COLUMN menu_items.auto_disabled_at IS 'Set when auto-86 took this item off the menu; NULL means availability is the merchant''s own choice. Only a row with this set may be re-enabled automatically.';

-- Recovery filters on this column within one tenant, and the marked rows are a
-- tiny minority of any menu, so a partial index is the whole working set.
CREATE INDEX IF NOT EXISTS idx_menu_items_auto_disabled
  ON menu_items(tenant_id) WHERE auto_disabled_at IS NOT NULL;

-- ============================================
-- Rollback (manual):
--   DROP INDEX IF EXISTS idx_menu_items_auto_disabled;
--   ALTER TABLE menu_items DROP COLUMN IF EXISTS auto_disabled_at;
-- ============================================
