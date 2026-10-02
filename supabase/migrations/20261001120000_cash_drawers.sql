-- Cash drawers — named tills, zero-balance drawers, and cash pickups
--
-- Until now a shift WAS the drawer: one person, their float, their count.
-- A counter with two tills ("Cashier 1", "Cashier 2") had no way to say which
-- physical drawer a shift held, an owner who wanted one till to run at ZERO
-- BALANCE (start empty, hand everything over at close) could not pin that on
-- the till, and nobody could take cash out of a busy drawer mid-shift without
-- it reading as a shortage at close.
--
-- This adds the three facts the best-practice POS cash cycle needs:
--   * cash_drawers           — the physical till: a name, its standard starting
--                              cash, and whether it is a zero-balance drawer.
--   * staff_shifts.drawer_*  — which till a shift held, SNAPSHOTTED at clock-in
--                              (renaming "Cashier 1" must not rewrite history).
--   * shift_cash_movements   — cash that entered or left the drawer without a
--                              sale: pay in, pay out, and an owner's pickup.
--                              Append-only evidence, exactly like stock_movements.
--
-- Expected cash at close is still frozen onto the shift (staff_shifts.expected_cash)
-- and now nets the movements: float + cash sales + pay in − pay out − collected.
--
-- Additive: two new tables, five nullable/defaulted columns, one replaced
-- UPDATE policy. Existing shifts keep drawer_id NULL ("personal drawer").
-- Rollback at end.

-- ============================================
-- 0. Who may manage the store's cash
-- ============================================
-- The owner, a full-access account (permissions NULL — admins created before
-- staff management), or staff holding 'store_setup'. Mirrors the app's
-- canManageCash (lib/cash-drawers.ts). SECURITY INVOKER: app_users RLS already
-- lets a user read their own row.
CREATE OR REPLACE FUNCTION app_user_manages_cash(target_tenant_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_users au
     WHERE au.user_id = auth.uid()
       AND au.tenant_id = target_tenant_id
       AND au.role = ANY (ARRAY['admin','superadmin'])
       AND (COALESCE(au.is_owner, false)
            OR au.permissions IS NULL
            OR 'store_setup' = ANY (au.permissions))
  );
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp;

COMMENT ON FUNCTION app_user_manages_cash IS 'Owner, full-access admin, or store_setup holder of this tenant: may set up drawers, collect cash from any drawer, and close a shift on a cashier''s behalf.';

-- ============================================
-- 1. cash_drawers — the physical tills
-- ============================================
CREATE TABLE IF NOT EXISTS cash_drawers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- NULL = the unbranched store, like staff_shifts.outlet_id.
  outlet_id UUID REFERENCES outlets(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  -- The standard float the till starts each shift with. Pre-filled at
  -- clock-in; the cashier still counts and confirms it.
  starting_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Zero balance: the till starts EMPTY and is emptied at close — every peso
  -- counted is handed over, nothing is left for the next shift.
  is_zero_balance BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  -- Archived, never deleted: closed shifts point at it as evidence.
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT cash_drawers_name_ck CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  CONSTRAINT cash_drawers_starting_cash_ck CHECK (starting_cash >= 0 AND starting_cash <= 10000000),
  CONSTRAINT cash_drawers_zero_balance_ck CHECK (NOT is_zero_balance OR starting_cash = 0)
);

COMMENT ON TABLE cash_drawers IS 'A physical till ("Cashier 1"). A shift holds one at a time; a zero-balance till starts empty and hands over everything at close.';

-- Two live tills called "Cashier 1" in one branch is one name for two drawers.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_drawers_live_name
  ON cash_drawers (tenant_id, COALESCE(outlet_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)))
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cash_drawers_tenant ON cash_drawers (tenant_id, outlet_id, sort_order);

CREATE OR REPLACE FUNCTION cash_drawer_branch_belongs_to_tenant() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.outlet_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM outlets o WHERE o.id = NEW.outlet_id AND o.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Drawer branch belongs to a different store';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.outlet_id IS DISTINCT FROM OLD.outlet_id) THEN
    RAISE EXCEPTION 'A drawer cannot move to another store or branch';
  END IF;
  NEW.name := btrim(NEW.name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_cash_drawer_branch ON cash_drawers;
CREATE TRIGGER trg_cash_drawer_branch BEFORE INSERT OR UPDATE ON cash_drawers
  FOR EACH ROW EXECUTE FUNCTION cash_drawer_branch_belongs_to_tenant();

ALTER TABLE cash_drawers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cash_drawers_read_branch ON cash_drawers;
CREATE POLICY cash_drawers_read_branch ON cash_drawers FOR SELECT TO authenticated
  USING (app_user_may_reach_branch(tenant_id, outlet_id));

DROP POLICY IF EXISTS cash_drawers_insert_manager ON cash_drawers;
CREATE POLICY cash_drawers_insert_manager ON cash_drawers FOR INSERT TO authenticated
  WITH CHECK (app_user_may_reach_branch(tenant_id, outlet_id) AND app_user_manages_cash(tenant_id));

DROP POLICY IF EXISTS cash_drawers_update_manager ON cash_drawers;
CREATE POLICY cash_drawers_update_manager ON cash_drawers FOR UPDATE TO authenticated
  USING (app_user_may_reach_branch(tenant_id, outlet_id) AND app_user_manages_cash(tenant_id))
  WITH CHECK (app_user_may_reach_branch(tenant_id, outlet_id) AND app_user_manages_cash(tenant_id));
-- No DELETE policy: archive instead.

-- ============================================
-- 2. staff_shifts — which till the shift held
-- ============================================
ALTER TABLE staff_shifts
  ADD COLUMN IF NOT EXISTS drawer_id UUID REFERENCES cash_drawers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS drawer_name TEXT,
  ADD COLUMN IF NOT EXISTS is_zero_balance BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_by_name TEXT;

DO $$ BEGIN
  ALTER TABLE staff_shifts ADD CONSTRAINT staff_shifts_zero_balance_float_ck
    CHECK (NOT is_zero_balance OR opening_float = 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN staff_shifts.drawer_name IS 'The till''s name at clock-in. Snapshot: renaming the drawer later must not rewrite history.';
COMMENT ON COLUMN staff_shifts.is_zero_balance IS 'The till''s policy at clock-in: started empty, everything handed over at close.';
COMMENT ON COLUMN staff_shifts.closed_by IS 'Who counted and closed the drawer — the cashier, or a manager closing on their behalf.';

-- One pair of hands per till: a drawer two people hold reconciles against nobody.
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_shifts_one_open_per_drawer
  ON staff_shifts (drawer_id) WHERE status = 'open' AND drawer_id IS NOT NULL;

-- The drawer must be this store's and this branch's, live, and its policy is
-- read from the drawer row — never trusted from the client.
CREATE OR REPLACE FUNCTION staff_shift_drawer_snapshot() RETURNS TRIGGER AS $$
DECLARE
  d cash_drawers%ROWTYPE;
BEGIN
  IF NEW.drawer_id IS NULL THEN
    NEW.drawer_name := NULL;
    NEW.is_zero_balance := false;
    RETURN NEW;
  END IF;
  SELECT * INTO d FROM cash_drawers WHERE id = NEW.drawer_id;
  IF NOT FOUND OR d.tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Drawer belongs to a different store';
  END IF;
  IF d.outlet_id IS DISTINCT FROM NEW.outlet_id THEN
    RAISE EXCEPTION 'Drawer belongs to a different branch';
  END IF;
  IF d.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'This drawer was removed. Choose another drawer.';
  END IF;
  NEW.drawer_name := d.name;
  NEW.is_zero_balance := d.is_zero_balance;
  IF d.is_zero_balance THEN
    NEW.opening_float := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_staff_shift_drawer_snapshot ON staff_shifts;
CREATE TRIGGER trg_staff_shift_drawer_snapshot BEFORE INSERT ON staff_shifts
  FOR EACH ROW EXECUTE FUNCTION staff_shift_drawer_snapshot();

-- Custody now also pins the till; closing records who closed it.
CREATE OR REPLACE FUNCTION protect_staff_shift_custody() RETURNS TRIGGER AS $$
BEGIN
  -- Preserve the name snapshot when auth.users removes the referenced account.
  IF (NEW.staff_user_id IS NULL AND OLD.staff_user_id IS NOT NULL
      OR NEW.closed_by IS NULL AND OLD.closed_by IS NOT NULL)
    AND (to_jsonb(NEW) - 'staff_user_id' - 'closed_by') = (to_jsonb(OLD) - 'staff_user_id' - 'closed_by') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'closed' OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.outlet_id IS DISTINCT FROM OLD.outlet_id
    OR NEW.staff_user_id IS DISTINCT FROM OLD.staff_user_id
    OR NEW.opened_at IS DISTINCT FROM OLD.opened_at
    OR NEW.opening_float IS DISTINCT FROM OLD.opening_float
    OR NEW.drawer_id IS DISTINCT FROM OLD.drawer_id
    OR NEW.drawer_name IS DISTINCT FROM OLD.drawer_name
    OR NEW.is_zero_balance IS DISTINCT FROM OLD.is_zero_balance THEN
    RAISE EXCEPTION 'Shift custody cannot be changed';
  END IF;
  IF NEW.status = 'closed' AND (NEW.expected_cash IS NULL OR NEW.closing_count IS NULL) THEN
    RAISE EXCEPTION 'Closing a shift requires the expected cash and counted cash';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- The server stamps the closer, like it stamps the clock (20260927120000).
CREATE OR REPLACE FUNCTION stamp_staff_shift_times() RETURNS TRIGGER AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.opened_at := now();
    NEW.created_at := now();
    NEW.closed_at := NULL;
    NEW.expected_cash := NULL;
    NEW.closing_count := NULL;
    NEW.closed_by := NULL;
    NEW.closed_by_name := NULL;
  ELSIF OLD.status = 'open' AND NEW.status = 'closed' THEN
    NEW.closed_at := now();
    NEW.closed_by := auth.uid();
  ELSE
    NEW.closed_by := OLD.closed_by;
    NEW.closed_by_name := OLD.closed_by_name;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- A manager may count and close a cashier's drawer (forgotten clock-outs, or
-- the owner collecting at the end of the day). The cashier still closes their own.
DROP POLICY IF EXISTS staff_shifts_close_own ON staff_shifts;
DROP POLICY IF EXISTS staff_shifts_close ON staff_shifts;
CREATE POLICY staff_shifts_close ON staff_shifts FOR UPDATE TO authenticated
  USING (app_user_may_reach_branch(tenant_id, outlet_id) AND status = 'open'
         AND (staff_user_id = auth.uid() OR app_user_manages_cash(tenant_id)))
  WITH CHECK (app_user_may_reach_branch(tenant_id, outlet_id) AND status = 'closed'
         AND (staff_user_id = auth.uid() OR app_user_manages_cash(tenant_id)));

-- ============================================
-- 3. shift_cash_movements — cash in / out without a sale
-- ============================================
CREATE TABLE IF NOT EXISTS shift_cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  outlet_id UUID REFERENCES outlets(id) ON DELETE RESTRICT,
  shift_id UUID NOT NULL REFERENCES staff_shifts(id) ON DELETE RESTRICT,
  -- collect: cash taken out to the owner / safe (a pickup or safe drop)
  -- pay_in : cash added (more change, a top-up)
  -- pay_out: cash spent from the till (ice, LPG, a delivery rider)
  kind TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  reason TEXT,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT shift_cash_movements_kind_ck CHECK (kind IN ('collect','pay_in','pay_out')),
  CONSTRAINT shift_cash_movements_amount_ck CHECK (amount > 0 AND amount <= 10000000),
  CONSTRAINT shift_cash_movements_reason_ck CHECK (
    (reason IS NULL OR char_length(reason) <= 200)
    AND (kind = 'collect' OR char_length(btrim(COALESCE(reason, ''))) > 0)
  )
);

COMMENT ON TABLE shift_cash_movements IS 'Append-only: cash that entered or left a shift''s drawer without a sale. Nets into the drawer''s expected cash.';

CREATE INDEX IF NOT EXISTS idx_shift_cash_movements_shift ON shift_cash_movements (shift_id, created_at);
CREATE INDEX IF NOT EXISTS idx_shift_cash_movements_tenant ON shift_cash_movements (tenant_id, created_at DESC);

-- The tenant and branch are the shift's, the shift must still be open, and
-- the server owns the clock and the recorder.
CREATE OR REPLACE FUNCTION shift_cash_movement_guard() RETURNS TRIGGER AS $$
DECLARE
  s staff_shifts%ROWTYPE;
BEGIN
  SELECT * INTO s FROM staff_shifts WHERE id = NEW.shift_id;
  IF NOT FOUND OR s.tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Shift belongs to a different store';
  END IF;
  IF s.status <> 'open' THEN
    RAISE EXCEPTION 'This shift is already closed';
  END IF;
  NEW.outlet_id := s.outlet_id;
  IF current_user = 'authenticated' THEN
    NEW.created_at := now();
    NEW.recorded_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_shift_cash_movement_guard ON shift_cash_movements;
CREATE TRIGGER trg_shift_cash_movement_guard BEFORE INSERT ON shift_cash_movements
  FOR EACH ROW EXECUTE FUNCTION shift_cash_movement_guard();

ALTER TABLE shift_cash_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shift_cash_movements_read_branch ON shift_cash_movements;
CREATE POLICY shift_cash_movements_read_branch ON shift_cash_movements FOR SELECT TO authenticated
  USING (app_user_may_reach_branch(tenant_id, outlet_id));

-- The drawer's holder records their own pay in / out / drop; a manager may
-- record any of them (typically a pickup) on any open drawer they can reach.
DROP POLICY IF EXISTS shift_cash_movements_insert ON shift_cash_movements;
CREATE POLICY shift_cash_movements_insert ON shift_cash_movements FOR INSERT TO authenticated
  WITH CHECK (
    app_user_may_reach_branch(tenant_id, outlet_id)
    AND EXISTS (
      SELECT 1 FROM staff_shifts s
       WHERE s.id = shift_cash_movements.shift_id
         AND s.tenant_id = shift_cash_movements.tenant_id
         AND s.status = 'open'
         AND (s.staff_user_id = auth.uid() OR app_user_manages_cash(s.tenant_id))
    )
  );
-- No UPDATE / DELETE policy: a wrong entry is corrected by a new one.

-- ============================================
-- Rollback (manual)
-- ============================================
-- DROP TABLE IF EXISTS shift_cash_movements;
-- DROP FUNCTION IF EXISTS shift_cash_movement_guard();
-- DROP POLICY IF EXISTS staff_shifts_close ON staff_shifts;
-- CREATE POLICY staff_shifts_close_own ON staff_shifts FOR UPDATE TO authenticated
--   USING (app_user_may_reach_branch(tenant_id, outlet_id) AND staff_user_id = auth.uid() AND status = 'open')
--   WITH CHECK (app_user_may_reach_branch(tenant_id, outlet_id) AND staff_user_id = auth.uid() AND status = 'closed');
-- DROP TRIGGER IF EXISTS trg_staff_shift_drawer_snapshot ON staff_shifts;
-- DROP FUNCTION IF EXISTS staff_shift_drawer_snapshot();
-- DROP INDEX IF EXISTS idx_staff_shifts_one_open_per_drawer;
-- ALTER TABLE staff_shifts DROP CONSTRAINT IF EXISTS staff_shifts_zero_balance_float_ck,
--   DROP COLUMN IF EXISTS drawer_id, DROP COLUMN IF EXISTS drawer_name,
--   DROP COLUMN IF EXISTS is_zero_balance, DROP COLUMN IF EXISTS closed_by, DROP COLUMN IF EXISTS closed_by_name;
-- (re-create protect_staff_shift_custody / stamp_staff_shift_times from 20260916150000 / 20260927120000)
-- DROP TABLE IF EXISTS cash_drawers;
-- DROP FUNCTION IF EXISTS cash_drawer_branch_belongs_to_tenant();
-- DROP FUNCTION IF EXISTS app_user_manages_cash(UUID);
