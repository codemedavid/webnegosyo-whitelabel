-- Add-on prices on order lines.
--
-- `order_items.addons` is a text[] of labels ("Fried Rice ×2"), so no view of
-- an order could say what an add-on cost. `addon_details` keeps, per add-on,
-- the name, the per-portion price the server charged (from the dish's own
-- JSON, `priceOrderLines`) and the portions:
--   [{ "name": "Fried Rice", "price": 15, "quantity": 2 }]
-- `price` is null when the dish no longer carries the add-on (nothing charged).
--
-- Nullable with no default: a metadata-only ALTER (no rewrite of order_items),
-- and every existing reader keeps reading `addons`. Older rows and writers that
-- do not know the column (POS app, order edits) leave it NULL; readers fall
-- back to the labels. Table-level grants already cover new columns, and the
-- existing INSERT policies (order_items_insert_customer for anon checkout,
-- order_items_write_admin) are row policies, so no policy change is needed.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS addon_details jsonb;

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_addon_details_is_array;

-- NOT VALID: existing rows are all NULL, and skipping the scan keeps the lock
-- short on a table every store writes to.
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_addon_details_is_array
  CHECK (addon_details IS NULL OR jsonb_typeof(addon_details) = 'array') NOT VALID;

COMMENT ON COLUMN public.order_items.addon_details IS
  'Per add-on {name, price (per portion, null = not charged), quantity}, priced by the server at checkout. NULL on older rows; read addons then.';
