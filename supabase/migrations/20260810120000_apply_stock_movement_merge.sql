-- One definition of apply_stock_movement(), because two of them fought.
--
-- `20260807130000` (stocktake resolved under the row lock, via `target_qty`) and
-- `20260808120000` (per-branch `inventory_stock`) each CREATE OR REPLACE the
-- WHOLE function, and neither body contains the other's work. Whichever runs
-- last wins outright and silently deletes the other feature.
--
-- On this database branch-stock lost: the live body was probed and contains
-- `target_qty` with no reference to `inventory_stock`. So `inventory_stock` has
-- been frozen at its backfill values ever since, `balance_after` has been
-- recording the chain roll-up instead of the branch, and — paired with the
-- branch-scoped RLS of `20260809120000`, which hides store-pool rows from a
-- branch account — every branch manager's inventory screen reads zero for every
-- ingredient. On a fresh `supabase db reset` the filename ordering flips the
-- winner and the stocktake race fix is the casualty instead.
--
-- This migration is the merge, and it is the last word: it must sort after both.
--
-- It also fixes what merging exposes. A branch stocktake was resolving against
-- `inventory_items.current_qty`, which is the SUM of every branch. North holds
-- 10, South holds 90, the North manager counts 10 — and the old arithmetic
-- writes `10 - 100 = -90`, driving North to -80 and the store total to 10. A
-- count is a statement about ONE shelf, so it is resolved against that shelf's
-- row.

-- ============================================
-- 1. The merged trigger
-- ============================================
CREATE OR REPLACE FUNCTION apply_stock_movement() RETURNS TRIGGER AS $$
DECLARE
  branch_qty NUMERIC(16,4);
  rollup_qty NUMERIC(16,4);
  counted_against NUMERIC(16,4);
BEGIN
  -- A branch must belong to the same tenant, or stock would move into another
  -- store's shop. Checked here rather than by a foreign key because the key can
  -- only point at outlets, not at the tenant pairing. First, so a refused
  -- movement has taken no locks.
  IF NEW.outlet_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM outlets o WHERE o.id = NEW.outlet_id AND o.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Stock movement references a branch outside its tenant';
  END IF;

  -- The roll-up row is locked before anything is read, and it is also the
  -- tenant guard: an item belonging to another tenant matches nothing. Every
  -- movement for this ingredient — whatever its branch — passes through this
  -- one lock, so the per-branch read below cannot go stale underneath us and
  -- two branches can never deadlock against each other.
  SELECT current_qty INTO rollup_qty
    FROM inventory_items
   WHERE id = NEW.inventory_item_id
     AND tenant_id = NEW.tenant_id
     FOR UPDATE;

  IF rollup_qty IS NULL THEN
    RAISE EXCEPTION 'Stock movement references an inventory item outside its tenant';
  END IF;

  -- A counted absolute becomes a delta HERE, holding that lock, so the figure
  -- it is measured against is the one the update is about to change. Anything
  -- landing between the app's read and this insert would otherwise be absorbed
  -- silently — and a stocktake is the one movement whose whole purpose is to be
  -- authoritative about what is physically on the shelf.
  --
  -- Measured against THIS BRANCH's shelf. COALESCE to zero because a branch
  -- that has never held this ingredient has no row yet, and counting 10 there
  -- means +10, not a comparison against the chain.
  IF NEW.reason = 'stocktake' AND NEW.target_qty IS NOT NULL THEN
    SELECT current_qty INTO counted_against
      FROM inventory_stock
     WHERE tenant_id = NEW.tenant_id
       AND inventory_item_id = NEW.inventory_item_id
       AND outlet_id IS NOT DISTINCT FROM NEW.outlet_id
       FOR UPDATE;

    NEW.quantity_delta := NEW.target_qty - COALESCE(counted_against, 0);
  END IF;

  UPDATE inventory_items
     SET current_qty = current_qty + NEW.quantity_delta
   WHERE id = NEW.inventory_item_id
     AND tenant_id = NEW.tenant_id
  RETURNING current_qty INTO rollup_qty;

  -- IS NOT DISTINCT FROM so a NULL branch matches the store pool row rather
  -- than matching nothing, which is what plain `=` would do.
  UPDATE inventory_stock
     SET current_qty = current_qty + NEW.quantity_delta,
         updated_at = now()
   WHERE tenant_id = NEW.tenant_id
     AND inventory_item_id = NEW.inventory_item_id
     AND outlet_id IS NOT DISTINCT FROM NEW.outlet_id
  RETURNING current_qty INTO branch_qty;

  IF branch_qty IS NULL THEN
    -- First movement this branch has ever seen for this ingredient. Two
    -- concurrent first movements both miss the UPDATE and both insert; the
    -- loser catches the unique violation and re-runs the UPDATE, so a
    -- merchant's first delivery to a new branch never fails on a race.
    BEGIN
      INSERT INTO inventory_stock (tenant_id, inventory_item_id, outlet_id, current_qty)
      VALUES (NEW.tenant_id, NEW.inventory_item_id, NEW.outlet_id, NEW.quantity_delta)
      RETURNING current_qty INTO branch_qty;
    EXCEPTION WHEN unique_violation THEN
      UPDATE inventory_stock
         SET current_qty = current_qty + NEW.quantity_delta,
             updated_at = now()
       WHERE tenant_id = NEW.tenant_id
         AND inventory_item_id = NEW.inventory_item_id
         AND outlet_id IS NOT DISTINCT FROM NEW.outlet_id
      RETURNING current_qty INTO branch_qty;
    END;
  END IF;

  -- The balance at THIS BRANCH. For a single-location tenant it equals the
  -- roll-up, so nothing changes for them; for a branched one, a branch history
  -- reporting the chain's total would be unreadable.
  NEW.balance_after := branch_qty;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stock_movements_apply ON stock_movements;
CREATE TRIGGER stock_movements_apply BEFORE INSERT ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION apply_stock_movement();

-- ============================================
-- 2. Repair what the frozen table missed
-- ============================================
-- Between `20260808120000` landing and this migration, every movement updated
-- `inventory_items.current_qty` and none updated `inventory_stock`. The
-- roll-up is therefore correct and the branch rows are stale.
--
-- On this database the drift is nil (one item, one movement, one stock row,
-- probed before writing this), so both statements below are no-ops here. They
-- exist for any environment where that is not true, and because a migration
-- that only repairs the databases you happened to look at is not a repair.

-- Every item gets its store-pool row, including items created after the
-- original backfill ran.
INSERT INTO inventory_stock (tenant_id, inventory_item_id, outlet_id, current_qty, reorder_level)
SELECT ii.tenant_id, ii.id, NULL, 0, ii.reorder_level
  FROM inventory_items ii
 WHERE NOT EXISTS (
   SELECT 1 FROM inventory_stock s
    WHERE s.inventory_item_id = ii.id AND s.outlet_id IS NULL
 );

-- The store pool absorbs the difference, restoring the invariant that the
-- branches sum to the roll-up. Missed movements are credited to the pool rather
-- than guessed at per branch: the ledger's `outlet_id` records where each
-- movement was *meant* to go, but replaying it would double-count anything the
-- backfill already carried across, and inventing per-branch numbers is worse
-- than concentrating a known-correct total somewhere a human can re-count.
UPDATE inventory_stock s
   SET current_qty = s.current_qty + (
         i.current_qty - (
           SELECT COALESCE(SUM(s2.current_qty), 0)
             FROM inventory_stock s2
            WHERE s2.inventory_item_id = s.inventory_item_id
         )
       ),
       updated_at = now()
  FROM inventory_items i
 WHERE i.id = s.inventory_item_id
   AND s.outlet_id IS NULL
   AND i.current_qty IS DISTINCT FROM (
         SELECT COALESCE(SUM(s3.current_qty), 0)
           FROM inventory_stock s3
          WHERE s3.inventory_item_id = s.inventory_item_id
       );

-- ============================================
-- Rollback (manual): there is no safe partial rollback — reverting to either
-- earlier body re-deletes the other feature, which is the defect this exists to
-- fix. To undo the branch dimension entirely, follow the rollback block of
-- `20260808120000` (which restores a pre-branch body) and then re-apply the
-- stocktake branch from `20260807130000` on top of it.
-- ============================================
