-- Tighten custody for both existing and newly provisioned shift tables.
DROP POLICY IF EXISTS staff_shifts_manage_branch ON staff_shifts;
DROP POLICY IF EXISTS staff_shifts_read_branch ON staff_shifts;
DROP POLICY IF EXISTS staff_shifts_open_own ON staff_shifts;
DROP POLICY IF EXISTS staff_shifts_close_own ON staff_shifts;
CREATE POLICY staff_shifts_read_branch ON staff_shifts FOR SELECT TO authenticated
  USING (app_user_may_reach_branch(tenant_id, outlet_id));
CREATE POLICY staff_shifts_open_own ON staff_shifts FOR INSERT TO authenticated
  WITH CHECK (
    app_user_may_reach_branch(tenant_id, outlet_id)
    AND staff_user_id = auth.uid() AND status = 'open'
    AND EXISTS (SELECT 1 FROM app_users au WHERE au.user_id = auth.uid()
      AND (au.is_owner OR au.permissions IS NULL OR 'pos' = ANY(au.permissions)))
  );
CREATE POLICY staff_shifts_close_own ON staff_shifts FOR UPDATE TO authenticated
  USING (app_user_may_reach_branch(tenant_id, outlet_id) AND staff_user_id = auth.uid() AND status = 'open')
  WITH CHECK (app_user_may_reach_branch(tenant_id, outlet_id) AND staff_user_id = auth.uid() AND status = 'closed');

-- Custody and the opening float are fixed facts; closing only records the count.
CREATE OR REPLACE FUNCTION protect_staff_shift_custody() RETURNS TRIGGER AS $$
BEGIN
  -- Preserve the name snapshot when auth.users removes the referenced account.
  IF NEW.staff_user_id IS NULL AND OLD.staff_user_id IS NOT NULL
    AND (to_jsonb(NEW) - 'staff_user_id') = (to_jsonb(OLD) - 'staff_user_id') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'closed' OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.outlet_id IS DISTINCT FROM OLD.outlet_id
    OR NEW.staff_user_id IS DISTINCT FROM OLD.staff_user_id
    OR NEW.opened_at IS DISTINCT FROM OLD.opened_at
    OR NEW.opening_float IS DISTINCT FROM OLD.opening_float THEN
    RAISE EXCEPTION 'Shift custody cannot be changed';
  END IF;
  IF NEW.status = 'closed' AND (NEW.expected_cash IS NULL OR NEW.closing_count IS NULL) THEN
    RAISE EXCEPTION 'Closing a shift requires the expected cash and counted cash';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_staff_shift_custody ON staff_shifts;
CREATE TRIGGER trg_staff_shift_custody BEFORE UPDATE ON staff_shifts
  FOR EACH ROW EXECUTE FUNCTION protect_staff_shift_custody();
