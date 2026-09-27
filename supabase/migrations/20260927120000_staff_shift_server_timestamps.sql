-- Staff shifts — the server owns the clock
--
-- A shift's drawer is DERIVED from its window: every counter sale this
-- cashier rang up between opened_at and closed_at (webnegosyo-app
-- lib/shift-drawer.ts). Both ends of that window were written by the
-- cashier's own client, and neither the policies nor the custody trigger
-- (20260916150000) pinned them. A cashier could therefore:
--   * clock in with opened_at backdated, pulling earlier sales — someone
--     else's drawer — into their own window, or
--   * close with any closed_at (before opened_at, or next week), so the
--     stored shift no longer brackets the sales it was reconciled against.
-- The shift row is the evidence for a drawer's variance; its timestamps must
-- be the server's.
--
-- Also scopes the INSERT policy's permission check to the shift's own store.
-- It matched ANY app_users row for the caller, so a 'pos' grant held at one
-- store satisfied it at another where the account lacks 'pos'.
--
-- Only the `authenticated` role (the app) is overridden. The service role
-- keeps full control for imports and repairs.

CREATE OR REPLACE FUNCTION stamp_staff_shift_times() RETURNS TRIGGER AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.opened_at := now();
    NEW.created_at := now();
    NEW.closed_at := NULL;
    -- A shift is counted at close, never born counted.
    NEW.expected_cash := NULL;
    NEW.closing_count := NULL;
  ELSIF OLD.status = 'open' AND NEW.status = 'closed' THEN
    NEW.closed_at := now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_staff_shift_stamp_times ON staff_shifts;
CREATE TRIGGER trg_staff_shift_stamp_times
  BEFORE INSERT OR UPDATE ON staff_shifts
  FOR EACH ROW EXECUTE FUNCTION stamp_staff_shift_times();

DROP POLICY IF EXISTS staff_shifts_open_own ON staff_shifts;
CREATE POLICY staff_shifts_open_own ON staff_shifts FOR INSERT TO authenticated
  WITH CHECK (
    app_user_may_reach_branch(tenant_id, outlet_id)
    AND staff_user_id = auth.uid() AND status = 'open'
    AND EXISTS (SELECT 1 FROM app_users au
      WHERE au.user_id = auth.uid()
        AND au.tenant_id = staff_shifts.tenant_id
        AND (au.is_owner OR au.permissions IS NULL OR 'pos' = ANY(au.permissions)))
  );

-- ============================================
-- Rollback
-- ============================================
-- DROP TRIGGER IF EXISTS trg_staff_shift_stamp_times ON staff_shifts;
-- DROP FUNCTION IF EXISTS stamp_staff_shift_times();
-- (re-create staff_shifts_open_own from 20260916150000 to restore the old check)
