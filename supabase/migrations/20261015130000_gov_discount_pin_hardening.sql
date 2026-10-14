-- Senior/PWD security hardening (security review 2026-10-15).
--
-- 1. Approval PINs: the lock now ESCALATES. Five wrong tries lock the PIN for
--    15 minutes, the next lock for 1 hour, every lock after that for 24 hours.
--    `lock_count` survives a lock (the old code reset the only counter on
--    lock, so a script could guess 480 PINs a day forever); a successful
--    verify — or the manager setting a new PIN — starts over.
-- 2. Approvals are bound to the sale they were given for: `sale_fingerprint`
--    = sha256 of the claimants (kind, name, masked ID) + the cashier, computed
--    by the server (`src/lib/gov-discount-ledger/approval-binding.ts`). The
--    sales book consumes an approval only for a grant with the same print.
--
-- Additive: one column on each table, two functions replaced in place.

ALTER TABLE public.staff_approval_pins
  ADD COLUMN IF NOT EXISTS lock_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.gov_discount_approvals
  ADD COLUMN IF NOT EXISTS sale_fingerprint TEXT;

COMMENT ON COLUMN public.staff_approval_pins.lock_count IS
  'Locks since the last successful verify; decides the next lock length (15 min, 1 h, 24 h).';
COMMENT ON COLUMN public.gov_discount_approvals.sale_fingerprint IS
  'sha256 of the approved claimants + cashier; the sales book consumes the approval only for a matching grant.';

CREATE OR REPLACE FUNCTION public.set_staff_approval_pin(p_user_id UUID, p_tenant_id UUID, p_pin TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
BEGIN
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION 'PIN must be 4 to 6 digits';
  END IF;
  INSERT INTO public.staff_approval_pins (user_id, tenant_id, pin_hash, failed_attempts, locked_until, lock_count, updated_at)
  VALUES (p_user_id, p_tenant_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), 0, NULL, 0, now())
  ON CONFLICT (user_id, tenant_id) DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash, failed_attempts = 0, locked_until = NULL, lock_count = 0, updated_at = now();
END;
$$;

-- 'ok' | 'wrong' | 'locked' | 'no_pin'. The row is locked FOR UPDATE, so
-- parallel guesses cannot share one attempt.
CREATE OR REPLACE FUNCTION public.verify_staff_approval_pin(p_user_id UUID, p_tenant_id UUID, p_pin TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_row public.staff_approval_pins%ROWTYPE;
  v_locks INTEGER;
BEGIN
  SELECT * INTO v_row FROM public.staff_approval_pins
   WHERE user_id = p_user_id AND tenant_id = p_tenant_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'no_pin';
  END IF;
  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > now() THEN
    RETURN 'locked';
  END IF;
  IF p_pin IS NOT NULL AND v_row.pin_hash = extensions.crypt(p_pin, v_row.pin_hash) THEN
    UPDATE public.staff_approval_pins SET failed_attempts = 0, locked_until = NULL, lock_count = 0
     WHERE user_id = p_user_id AND tenant_id = p_tenant_id;
    RETURN 'ok';
  END IF;
  IF v_row.failed_attempts + 1 < 5 THEN
    UPDATE public.staff_approval_pins SET failed_attempts = v_row.failed_attempts + 1
     WHERE user_id = p_user_id AND tenant_id = p_tenant_id;
    RETURN 'wrong';
  END IF;
  v_locks := v_row.lock_count + 1;
  UPDATE public.staff_approval_pins
     SET failed_attempts = 0,
         lock_count = v_locks,
         locked_until = now() + CASE
           WHEN v_locks <= 1 THEN interval '15 minutes'
           WHEN v_locks = 2 THEN interval '1 hour'
           ELSE interval '24 hours'
         END
   WHERE user_id = p_user_id AND tenant_id = p_tenant_id;
  RETURN 'locked';
END;
$$;

REVOKE ALL ON FUNCTION public.set_staff_approval_pin(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_staff_approval_pin(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_staff_approval_pin(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_staff_approval_pin(UUID, UUID, TEXT) TO service_role;

-- Rollback:
--   (restore the two functions from 20261012120000_gov_discounts.sql)
--   ALTER TABLE public.gov_discount_approvals DROP COLUMN IF EXISTS sale_fingerprint;
--   ALTER TABLE public.staff_approval_pins DROP COLUMN IF EXISTS lock_count;
