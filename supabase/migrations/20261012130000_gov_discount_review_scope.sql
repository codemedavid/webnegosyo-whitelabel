-- Senior/PWD ledger follow-ups (review of 20261012120000_gov_discounts):
--
-- 1. Reviews follow the claim's branch scope. The review policies checked
--    only the `discount_review` grant, so a branch-locked reviewer could read
--    or file reviews on another branch's grants by id. Requiring the claim to
--    be visible (under ITS policy, which is branch-scoped) closes both.
-- 2. The reviewer's name is read from THIS store's app_users row; a person with
--    rows in several stores could be stamped with another store's name.
-- 3. A reversal keeps the original granter in granted_by/granted_by_name and
--    records who took it back in the new reversed_by/reversed_by_name, so the
--    sales book can still say whose discount was reversed.

DROP POLICY IF EXISTS gov_discount_reviews_read ON public.gov_discount_reviews;
CREATE POLICY gov_discount_reviews_read ON public.gov_discount_reviews FOR SELECT TO authenticated
  USING (
    public.app_user_has_permission(tenant_id, 'discount_review')
    AND EXISTS (SELECT 1 FROM public.gov_discount_claims c WHERE c.id = claim_id)
  );

DROP POLICY IF EXISTS gov_discount_reviews_insert ON public.gov_discount_reviews;
CREATE POLICY gov_discount_reviews_insert ON public.gov_discount_reviews FOR INSERT TO authenticated
  WITH CHECK (
    public.app_user_has_permission(tenant_id, 'discount_review')
    AND EXISTS (SELECT 1 FROM public.gov_discount_claims c WHERE c.id = claim_id)
  );

CREATE OR REPLACE FUNCTION public.gov_discount_review_stamp() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_name TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.gov_discount_claims c WHERE c.id = NEW.claim_id AND c.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Review must belong to the same store as its record';
  END IF;
  IF auth.uid() IS NOT NULL THEN
    NEW.reviewer_user_id := auth.uid();
    SELECT coalesce(nullif(au.display_name, ''), au.email, 'Staff') INTO v_name
      FROM public.app_users au
     WHERE au.user_id = auth.uid()
       AND (au.tenant_id = NEW.tenant_id OR au.role = 'superadmin')
     ORDER BY (au.tenant_id = NEW.tenant_id) DESC NULLS LAST
     LIMIT 1;
    NEW.reviewer_name := coalesce(v_name, 'Staff');
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.gov_discount_review_stamp() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.gov_discount_claims
  ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_by_name TEXT;

COMMENT ON COLUMN public.gov_discount_claims.reversed_by_name IS 'On a reversed row: who took the discount back. granted_by_name stays the original granter.';

-- The append-only guard must also allow the new FK's own SET NULL.
CREATE OR REPLACE FUNCTION public.protect_gov_discount_claim() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  nullable_keys TEXT[] := ARRAY['granted_by', 'approved_by', 'approval_id', 'outlet_id', 'reversed_by'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = OLD.tenant_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Senior/PWD discount records are append-only';
  END IF;
  IF (to_jsonb(NEW) - nullable_keys) = (to_jsonb(OLD) - nullable_keys)
     AND (NEW.granted_by IS NULL OR NEW.granted_by = OLD.granted_by)
     AND (NEW.approved_by IS NULL OR NEW.approved_by = OLD.approved_by)
     AND (NEW.approval_id IS NULL OR NEW.approval_id = OLD.approval_id)
     AND (NEW.outlet_id IS NULL OR NEW.outlet_id = OLD.outlet_id)
     AND (NEW.reversed_by IS NULL OR NEW.reversed_by = OLD.reversed_by) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Senior/PWD discount records are append-only';
END;
$$;

-- Rollback
-- ALTER TABLE public.gov_discount_claims DROP COLUMN IF EXISTS reversed_by_name, DROP COLUMN IF EXISTS reversed_by;
-- (re-run the policy and function definitions from 20261012120000_gov_discounts.sql)
