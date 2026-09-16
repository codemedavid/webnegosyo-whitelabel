-- Staff shifts — a drawer with a name on it
--
-- The register already records every sale, and pos-sales.ts can already say
-- what the drawer should hold for a DAY. What nothing records is the window
-- one person was responsible for it: who clocked in, with how much float,
-- and what the drawer actually held when they handed it over. Without that
-- row, a short drawer is a store problem; with it, it is a shift problem —
-- one person, one window, one number to explain.
--
-- The shift moves no money. Orders keep recording the money (the cashier is
-- already stamped into customerData.pos.cashierId); this table brackets them.
-- That is the inventory_counts precedent: the act in its own table, the
-- effect in the ledger it already lives in.
--
-- `expected_cash` is written ONCE, at close, and never recomputed: the
-- expectation is evidence. Re-deriving it months later — after edits and
-- refunds moved the orders underneath it — would quietly rewrite whether a
-- drawer balanced.
--
-- Additive: one new table, no existing object altered. Rollback at end.

CREATE TABLE IF NOT EXISTS staff_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- NULL = the unbranched store, matching inventory_counts and
  -- app_users.outlet_id. RESTRICT: the shift is the evidence for a drawer's
  -- variance, and deleting the branch must not orphan the explanation.
  outlet_id UUID REFERENCES outlets(id) ON DELETE RESTRICT,

  -- SET NULL, with the name snapshotted below: removing a staff account must
  -- not anonymise last month's drawer history.
  staff_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  staff_name TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'open',

  -- Cash in the drawer before the first sale. The turnover figure is
  -- (expected_cash - opening_float): the float goes back in the drawer for
  -- the next shift, so counting it as turnover would accuse every cashier of
  -- keeping it.
  opening_float NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Both written at close. expected_cash is what the register computed the
  -- drawer should hold; closing_count is what the person counted. The
  -- variance is derived, never stored — two of the three facts is enough.
  expected_cash NUMERIC(12,2),
  closing_count NUMERIC(12,2),

  note TEXT,

  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT staff_shifts_status_ck
    CHECK (status IN ('open','closed')),

  -- The two facts must agree, exactly as inventory_counts insists: a row
  -- saying 'closed' with no closed_at is a finished shift to the status
  -- filter and a running one to any read that trusts the timestamp.
  CONSTRAINT staff_shifts_closed_consistency_ck
    CHECK (
      (status = 'open' AND closed_at IS NULL)
      OR (status = 'closed' AND closed_at IS NOT NULL)
    ),

  -- A drawer cannot hold negative cash. The app refuses these before
  -- writing; this stops any other writer from inventing them.
  CONSTRAINT staff_shifts_opening_float_nonneg_ck CHECK (opening_float >= 0),
  CONSTRAINT staff_shifts_closing_count_nonneg_ck
    CHECK (closing_count IS NULL OR closing_count >= 0)
);

COMMENT ON TABLE staff_shifts IS 'One person''s custody of the register drawer, clock-in to clock-out. Brackets the orders (which carry cashierId themselves); moves no money.';
COMMENT ON COLUMN staff_shifts.expected_cash IS 'What the drawer should have held at close, frozen at the moment of closing. Evidence, never recomputed.';
COMMENT ON COLUMN staff_shifts.staff_name IS 'Snapshot at clock-in so deleting the account keeps the history named.';

-- One open shift per person per store. Two open shifts is two drawers for
-- one pair of hands, each reconciling against half the takings. The app
-- joins the running shift instead of opening a second; this refuses the race
-- the app cannot see.
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_shifts_one_open_per_staff
  ON staff_shifts(tenant_id, staff_user_id)
  WHERE status = 'open';

-- The owner's review reads newest-first per store, optionally per person.
CREATE INDEX IF NOT EXISTS idx_staff_shifts_tenant_opened
  ON staff_shifts(tenant_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_staff
  ON staff_shifts(tenant_id, staff_user_id, opened_at DESC);

-- ============================================
-- The branch must belong to this store
-- ============================================
-- Same reasoning as inventory_counts: the FK proves the outlet exists, not
-- whose it is. Without this a shift could be clocked in against a stranger's
-- branch.
CREATE OR REPLACE FUNCTION staff_shift_branch_belongs_to_tenant() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.outlet_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM outlets o WHERE o.id = NEW.outlet_id AND o.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Shift branch belongs to a different store';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_staff_shift_branch ON staff_shifts;
CREATE TRIGGER trg_staff_shift_branch
  BEFORE INSERT OR UPDATE OF tenant_id, outlet_id ON staff_shifts
  FOR EACH ROW EXECUTE FUNCTION staff_shift_branch_belongs_to_tenant();

-- ============================================
-- RLS — whoever may reach the branch may see its shifts
-- ============================================
-- Reuses app_user_may_reach_branch() from 20260809120000 so the branch rule
-- has one definition and cannot drift from inventory_stock or
-- inventory_counts. Owners and store-wide staff see every branch's shifts;
-- branch staff see their own branch's.
ALTER TABLE staff_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_shifts_manage_branch ON staff_shifts;
CREATE POLICY staff_shifts_manage_branch ON staff_shifts FOR ALL
  USING (app_user_may_reach_branch(tenant_id, outlet_id))
  WITH CHECK (app_user_may_reach_branch(tenant_id, outlet_id));

-- ============================================
-- Rollback
-- ============================================
-- DROP POLICY IF EXISTS staff_shifts_manage_branch ON staff_shifts;
-- DROP TRIGGER IF EXISTS trg_staff_shift_branch ON staff_shifts;
-- DROP FUNCTION IF EXISTS staff_shift_branch_belongs_to_tenant();
-- DROP TABLE IF EXISTS staff_shifts;
