-- A stocktake is resolved against the shelf at the INSERT, not at the read.
--
-- `resolveMovementDelta` computes a stocktake as `counted - currentQty`, where
-- `currentQty` came from a SELECT earlier in the same request. Anything landing
-- in that gap is absorbed silently. A probe against this database (in a
-- transaction that was rolled back) showed it exactly:
--
--   counted=900, a sale of 50 landed mid-flight, shelf_ended_at=850, lost=50
--
-- The merchant physically counted 900 and the system now disagrees with them,
-- with nothing in the ledger to say why. Worse than a plain lost update: the
-- whole point of a stocktake is to be the authority on what is actually there,
-- so the one movement that should never be wrong is the one that silently is.
--
-- The trigger already takes a row lock on `inventory_items` — the comment on
-- the original migration says movements "serialize on the item row rather than
-- racing through a read-modify-write in application code", which was true for
-- every reason EXCEPT the one that computes its delta from a prior read.
--
-- So the subtraction moves inside that lock. The application's job becomes
-- stating WHAT WAS COUNTED (`target_qty`, in stock units) and the database
-- resolves the difference against a figure that cannot go stale.
--
-- `quantity_delta` keeps its meaning exactly — the signed change actually
-- applied — so the ledger's shape, `balance_after`, and every report reading
-- them are untouched. The trigger overwrites the value the app sent rather than
-- rejecting it, so a client that has not been updated yet keeps working with
-- the old (racy) behaviour instead of failing outright.
--
-- Only `stocktake` may carry a target. A delivery is a RELATIVE movement and
-- must stay one; letting one state an absolute would make two deliveries in a
-- row overwrite each other rather than accumulate.

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS target_qty NUMERIC(16,4);

COMMENT ON COLUMN public.stock_movements.target_qty IS
  'Stocktakes only: the quantity physically counted, in the item stock unit. '
  'The trigger resolves quantity_delta from it under the row lock, so a sale '
  'landing between the app read and this insert cannot be swallowed. NULL for '
  'every relative movement (receive, waste, sale, void, transfers).';

ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_target_qty_stocktake_only;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_target_qty_stocktake_only
  CHECK (target_qty IS NULL OR reason = 'stocktake');

CREATE OR REPLACE FUNCTION apply_stock_movement() RETURNS TRIGGER AS $$
DECLARE
  new_qty NUMERIC(16,4);
  counted_against NUMERIC(16,4);
BEGIN
  -- A counted absolute is turned into a delta HERE, holding the row lock, so
  -- the figure it is measured against is the one the update is about to change.
  IF NEW.reason = 'stocktake' AND NEW.target_qty IS NOT NULL THEN
    SELECT current_qty INTO counted_against
      FROM inventory_items
     WHERE id = NEW.inventory_item_id
       AND tenant_id = NEW.tenant_id
       FOR UPDATE;

    IF counted_against IS NULL THEN
      RAISE EXCEPTION 'Stock movement references an inventory item outside its tenant';
    END IF;

    NEW.quantity_delta := NEW.target_qty - counted_against;
  END IF;

  UPDATE inventory_items
     SET current_qty = current_qty + NEW.quantity_delta
   WHERE id = NEW.inventory_item_id
     AND tenant_id = NEW.tenant_id
  RETURNING current_qty INTO new_qty;

  IF new_qty IS NULL THEN
    RAISE EXCEPTION 'Stock movement references an inventory item outside its tenant';
  END IF;

  NEW.balance_after := new_qty;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Rollback: restore the function body from `20260726120000` (drop the
-- stocktake branch), then
--   ALTER TABLE public.stock_movements
--     DROP CONSTRAINT IF EXISTS stock_movements_target_qty_stocktake_only,
--     DROP COLUMN IF EXISTS target_qty;
-- That returns stocktakes to being resolved from a possibly stale read.
