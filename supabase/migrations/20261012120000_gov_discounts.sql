-- Government-mandated discounts (Senior Citizen, PWD, athletes, Medal of Valor)
--
-- What the law asks of a restaurant, and what this migration stores for it:
--
--   * The store's tax registration decides the arithmetic (VAT stores remove
--     12% VAT first, non-VAT stores do not) and what the receipt must say
--     (TIN, "VAT REG" / "NON-VAT REG", the input-tax disclaimer).
--       -> store_tax_profiles (+ an append-only change log)
--   * Not every item is covered (retail merchandise, a bucket of beer).
--       -> menu_items / categories .gov_discount_eligible
--   * Every discounted sale must record the claimant's name and ID number,
--     the gross sale and the discount (RR 7-2010 §7, RR 5-2017 §5.9) — the
--     "Senior Citizen / PWD sales book".
--       -> gov_discount_claims: append-only, written only by the platform
--          after it RE-PRICES the grant itself. NOT foreign-keyed to orders:
--          an owner deleting orders must never erase a BIR record.
--   * Owners want a second pair of eyes on large grants.
--       -> staff_approval_pins (bcrypt, lockout) + gov_discount_approvals
--   * Owners and managers review what was granted.
--       -> gov_discount_reviews (append-only verdicts)
--
-- Lives in the PLATFORM database for every tenant, like order_status_events:
-- the order is named by (backend, external_order_id), so Convex stores are
-- covered with no Convex redeploy.
--
-- Additive: new tables, two new columns with defaults, new functions. Rollback
-- at the end.

-- ============================================
-- Permission helper (generic)
-- ============================================
-- Same rule as staff-permissions.ts `hasPermission`: superadmin, the owner, or
-- a full-access account (permissions NULL), or an explicit grant.
CREATE OR REPLACE FUNCTION public.app_user_has_permission(p_tenant_id UUID, p_permission TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users au
     WHERE au.user_id = auth.uid()
       AND (au.role = 'superadmin' OR (
         au.role = 'admin' AND au.tenant_id = p_tenant_id
         AND (au.is_owner IS TRUE OR au.permissions IS NULL OR p_permission = ANY (au.permissions))
       ))
  );
$$;
REVOKE ALL ON FUNCTION public.app_user_has_permission(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_user_has_permission(UUID, TEXT) TO authenticated, service_role;

-- Owner (or superadmin) of this store.
CREATE OR REPLACE FUNCTION public.app_user_is_store_owner(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users au
     WHERE au.user_id = auth.uid()
       AND (au.role = 'superadmin'
            OR (au.role = 'admin' AND au.tenant_id = p_tenant_id AND au.is_owner IS TRUE))
  );
$$;
REVOKE ALL ON FUNCTION public.app_user_is_store_owner(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_user_is_store_owner(UUID) TO authenticated, service_role;

-- Any account of this store (or a superadmin).
CREATE OR REPLACE FUNCTION public.app_user_belongs_to_store(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users au
     WHERE au.user_id = auth.uid()
       AND (au.role = 'superadmin' OR (au.role = 'admin' AND au.tenant_id = p_tenant_id))
  );
$$;
REVOKE ALL ON FUNCTION public.app_user_belongs_to_store(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_user_belongs_to_store(UUID) TO authenticated, service_role;

-- ============================================
-- Store tax profile
-- ============================================
CREATE TABLE IF NOT EXISTS public.store_tax_profiles (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,

  vat_status TEXT NOT NULL,
  registered_name TEXT,
  tin TEXT,
  tin_branch_code TEXT,
  business_address TEXT,

  -- Only an accredited POS with a Permit To Use may print an invoice. Until
  -- then every printout carries the RR 7-2024 B.15 disclaimer.
  is_bir_registered_pos BOOLEAN NOT NULL DEFAULT false,
  pos_min TEXT,
  pos_serial_no TEXT,
  pos_ptu_no TEXT,

  -- Senior and PWD are always offered (the app enforces it); these add the
  -- optional kinds.
  enabled_kinds TEXT[] NOT NULL DEFAULT ARRAY['senior', 'pwd'],
  allow_shared_table BOOLEAN NOT NULL DEFAULT true,
  approval_rule TEXT NOT NULL DEFAULT 'above',
  approval_threshold NUMERIC(12,2) NOT NULL DEFAULT 500,
  service_charge_mode TEXT NOT NULL DEFAULT 'full',

  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT store_tax_profiles_vat_status_ck CHECK (vat_status IN ('vat', 'non_vat')),
  CONSTRAINT store_tax_profiles_tin_ck
    CHECK (tin IS NULL OR tin ~ '^[0-9]{3}-?[0-9]{3}-?[0-9]{3}(-?[0-9]{3,5})?$'),
  CONSTRAINT store_tax_profiles_branch_code_ck
    CHECK (tin_branch_code IS NULL OR tin_branch_code ~ '^[0-9]{3,5}$'),
  CONSTRAINT store_tax_profiles_kinds_ck
    CHECK (enabled_kinds <@ ARRAY['senior', 'pwd', 'athlete', 'medal_of_valor']),
  CONSTRAINT store_tax_profiles_approval_rule_ck
    CHECK (approval_rule IN ('never', 'above', 'always')),
  CONSTRAINT store_tax_profiles_threshold_ck
    CHECK (approval_threshold >= 0 AND approval_threshold <= 1000000),
  CONSTRAINT store_tax_profiles_service_mode_ck
    CHECK (service_charge_mode IN ('full', 'exempt_share')),
  CONSTRAINT store_tax_profiles_text_lengths_ck CHECK (
    coalesce(length(registered_name), 0) <= 160 AND coalesce(length(business_address), 0) <= 300
    AND coalesce(length(pos_min), 0) <= 40 AND coalesce(length(pos_serial_no), 0) <= 60
    AND coalesce(length(pos_ptu_no), 0) <= 60
  )
);

COMMENT ON TABLE public.store_tax_profiles IS 'BIR registration and Senior/PWD discount rules per store. Owner-only writes, every change logged in store_tax_profile_changes.';

CREATE TABLE IF NOT EXISTS public.store_tax_profile_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  before JSONB,
  after JSONB NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_tax_profile_changes_tenant
  ON public.store_tax_profile_changes(tenant_id, changed_at DESC);

-- Stamp who changed it (never trusted from the client) and log the change.
CREATE OR REPLACE FUNCTION public.store_tax_profile_stamp() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.store_tax_profile_log() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.store_tax_profile_changes (tenant_id, changed_by, before, after)
  VALUES (
    NEW.tenant_id,
    NEW.updated_by,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) - 'updated_at' ELSE NULL END,
    to_jsonb(NEW) - 'updated_at'
  );
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.store_tax_profile_log() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_store_tax_profile_stamp ON public.store_tax_profiles;
CREATE TRIGGER trg_store_tax_profile_stamp
  BEFORE INSERT OR UPDATE ON public.store_tax_profiles
  FOR EACH ROW EXECUTE FUNCTION public.store_tax_profile_stamp();

DROP TRIGGER IF EXISTS trg_store_tax_profile_log ON public.store_tax_profiles;
CREATE TRIGGER trg_store_tax_profile_log
  AFTER INSERT OR UPDATE ON public.store_tax_profiles
  FOR EACH ROW EXECUTE FUNCTION public.store_tax_profile_log();

ALTER TABLE public.store_tax_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_tax_profile_changes ENABLE ROW LEVEL SECURITY;

-- Every account of the store reads it: the register needs the VAT status.
DROP POLICY IF EXISTS store_tax_profiles_read ON public.store_tax_profiles;
CREATE POLICY store_tax_profiles_read ON public.store_tax_profiles FOR SELECT TO authenticated
  USING (public.app_user_belongs_to_store(tenant_id));

DROP POLICY IF EXISTS store_tax_profiles_insert_owner ON public.store_tax_profiles;
CREATE POLICY store_tax_profiles_insert_owner ON public.store_tax_profiles FOR INSERT TO authenticated
  WITH CHECK (public.app_user_is_store_owner(tenant_id));

DROP POLICY IF EXISTS store_tax_profiles_update_owner ON public.store_tax_profiles;
CREATE POLICY store_tax_profiles_update_owner ON public.store_tax_profiles FOR UPDATE TO authenticated
  USING (public.app_user_is_store_owner(tenant_id))
  WITH CHECK (public.app_user_is_store_owner(tenant_id));

DROP POLICY IF EXISTS store_tax_profile_changes_read_owner ON public.store_tax_profile_changes;
CREATE POLICY store_tax_profile_changes_read_owner ON public.store_tax_profile_changes FOR SELECT TO authenticated
  USING (public.app_user_is_store_owner(tenant_id));

REVOKE DELETE ON public.store_tax_profiles FROM anon, authenticated;
REVOKE ALL ON public.store_tax_profiles FROM anon;
REVOKE ALL ON public.store_tax_profile_changes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.store_tax_profile_changes FROM authenticated;

-- ============================================
-- Which items the discount covers
-- ============================================
-- Default TRUE: the law covers food and drink, so an item is covered unless
-- the owner excludes it. Effective eligibility = item AND its category.
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS gov_discount_eligible BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS gov_discount_eligible BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.menu_items.gov_discount_eligible IS 'False excludes the item from Senior/PWD discounts (e.g. retail merchandise).';
COMMENT ON COLUMN public.categories.gov_discount_eligible IS 'False excludes every item in the category from Senior/PWD discounts.';

-- ============================================
-- Manager approval: PINs and one-time approvals
-- ============================================
-- PINs are bcrypt hashes, readable by nobody but the service role. Five wrong
-- tries lock the PIN for 15 minutes.
CREATE TABLE IF NOT EXISTS public.staff_approval_pins (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);
ALTER TABLE public.staff_approval_pins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_approval_pins FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_staff_approval_pin(p_user_id UUID, p_tenant_id UUID, p_pin TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
BEGIN
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION 'PIN must be 4 to 6 digits';
  END IF;
  INSERT INTO public.staff_approval_pins (user_id, tenant_id, pin_hash, failed_attempts, locked_until, updated_at)
  VALUES (p_user_id, p_tenant_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), 0, NULL, now())
  ON CONFLICT (user_id, tenant_id) DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash, failed_attempts = 0, locked_until = NULL, updated_at = now();
END;
$$;

-- 'ok' | 'wrong' | 'locked' | 'no_pin'. The counter moves in the same
-- statement that reads it, so parallel guesses cannot share one attempt.
CREATE OR REPLACE FUNCTION public.verify_staff_approval_pin(p_user_id UUID, p_tenant_id UUID, p_pin TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_row public.staff_approval_pins%ROWTYPE;
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
    UPDATE public.staff_approval_pins SET failed_attempts = 0, locked_until = NULL
     WHERE user_id = p_user_id AND tenant_id = p_tenant_id;
    RETURN 'ok';
  END IF;
  UPDATE public.staff_approval_pins
     SET failed_attempts = CASE WHEN failed_attempts + 1 >= 5 THEN 0 ELSE failed_attempts + 1 END,
         locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END
   WHERE user_id = p_user_id AND tenant_id = p_tenant_id;
  RETURN CASE WHEN v_row.failed_attempts + 1 >= 5 THEN 'locked' ELSE 'wrong' END;
END;
$$;

REVOKE ALL ON FUNCTION public.set_staff_approval_pin(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_staff_approval_pin(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_staff_approval_pin(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_staff_approval_pin(UUID, UUID, TEXT) TO service_role;

-- One approval = one sale. Issued by the server after a PIN check, consumed by
-- the server when the sale's grant is recorded. 30 minutes to be used.
CREATE TABLE IF NOT EXISTS public.gov_discount_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  outlet_id UUID REFERENCES public.outlets(id) ON DELETE SET NULL,
  approver_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approver_name TEXT NOT NULL,
  cashier_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cashier_name TEXT NOT NULL,
  -- What was approved: the reduction and the claimants (masked IDs only).
  approved_reduction NUMERIC(12,2) NOT NULL CHECK (approved_reduction >= 0),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 minutes',
  consumed_at TIMESTAMPTZ,
  consumed_order TEXT
);
CREATE INDEX IF NOT EXISTS idx_gov_discount_approvals_tenant
  ON public.gov_discount_approvals(tenant_id, created_at DESC);
ALTER TABLE public.gov_discount_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gov_discount_approvals FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.gov_discount_approvals FROM authenticated;

DROP POLICY IF EXISTS gov_discount_approvals_read ON public.gov_discount_approvals;
CREATE POLICY gov_discount_approvals_read ON public.gov_discount_approvals FOR SELECT TO authenticated
  USING (public.app_user_has_permission(tenant_id, 'discount_review'));

-- ============================================
-- The ledger: one row per claimant per recorded revision
-- ============================================
CREATE TABLE IF NOT EXISTS public.gov_discount_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  outlet_id UUID REFERENCES public.outlets(id) ON DELETE SET NULL,

  backend TEXT NOT NULL,
  external_order_id TEXT NOT NULL,
  -- "#12" or the like, snapshotted for the sales book's invoice column.
  order_label TEXT,
  order_created_at TIMESTAMPTZ,
  -- The order's revision this grant belongs to; an edit records afresh.
  revision INTEGER NOT NULL DEFAULT 0,
  -- 'granted', or 'reversed' when an edit or cancellation took it back.
  event TEXT NOT NULL DEFAULT 'granted',

  claimant_ref TEXT NOT NULL,
  kind TEXT NOT NULL,
  claimant_name TEXT NOT NULL,
  id_number TEXT NOT NULL,
  allocation_mode TEXT NOT NULL,
  diners INTEGER,

  vat_status TEXT NOT NULL,
  gross_share NUMERIC(12,2) NOT NULL,
  vat_exempt_sales NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_removed NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL,
  net_due NUMERIC(12,2) NOT NULL,
  reduction NUMERIC(12,2) NOT NULL,
  order_total NUMERIC(12,2),

  -- What the PLATFORM computed for the same grant, and how it checked.
  server_reduction NUMERIC(12,2),
  verification TEXT NOT NULL,
  flags TEXT[] NOT NULL DEFAULT '{}',

  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_by_name TEXT NOT NULL,
  approval_id UUID REFERENCES public.gov_discount_approvals(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by_name TEXT,

  source TEXT NOT NULL DEFAULT 'pos',
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT gov_discount_claims_backend_ck
    CHECK (backend IN ('convex', 'tenant_supabase', 'platform_supabase')),
  CONSTRAINT gov_discount_claims_event_ck CHECK (event IN ('granted', 'reversed')),
  CONSTRAINT gov_discount_claims_kind_ck
    CHECK (kind IN ('senior', 'pwd', 'athlete', 'medal_of_valor')),
  CONSTRAINT gov_discount_claims_mode_ck CHECK (allocation_mode IN ('items', 'shared')),
  CONSTRAINT gov_discount_claims_vat_ck CHECK (vat_status IN ('vat', 'non_vat')),
  CONSTRAINT gov_discount_claims_verification_ck
    CHECK (verification IN ('verified', 'mismatch', 'payload_only')),
  CONSTRAINT gov_discount_claims_source_ck CHECK (source IN ('pos', 'online')),
  CONSTRAINT gov_discount_claims_amounts_ck CHECK (
    gross_share >= 0 AND vat_exempt_sales >= 0 AND vat_removed >= 0
    AND discount >= 0 AND net_due >= 0 AND reduction >= 0
  ),
  CONSTRAINT gov_discount_claims_once UNIQUE
    (tenant_id, backend, external_order_id, revision, claimant_ref, event)
);

COMMENT ON TABLE public.gov_discount_claims IS 'Senior/PWD sales book. Append-only, service-role writes after server re-pricing. Never cascades from orders: BIR records outlive order deletion.';

CREATE INDEX IF NOT EXISTS idx_gov_discount_claims_tenant_occurred
  ON public.gov_discount_claims(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_gov_discount_claims_id_number
  ON public.gov_discount_claims(tenant_id, id_number, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_gov_discount_claims_order
  ON public.gov_discount_claims(tenant_id, backend, external_order_id);
CREATE INDEX IF NOT EXISTS idx_gov_discount_claims_granted_by
  ON public.gov_discount_claims(tenant_id, granted_by, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.gov_discount_branch_belongs_to_tenant() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.outlet_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.outlets o WHERE o.id = NEW.outlet_id AND o.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Discount branch belongs to a different store';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gov_discount_claims_branch ON public.gov_discount_claims;
CREATE TRIGGER trg_gov_discount_claims_branch
  BEFORE INSERT ON public.gov_discount_claims
  FOR EACH ROW EXECUTE FUNCTION public.gov_discount_branch_belongs_to_tenant();

-- Append-only for every role, service role included. The only permitted
-- updates are the foreign keys' own SET NULL when a user, approval or branch
-- is deleted — the snapshotted names survive.
CREATE OR REPLACE FUNCTION public.protect_gov_discount_claim() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  nullable_keys TEXT[] := ARRAY['granted_by', 'approved_by', 'approval_id', 'outlet_id'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- A store being deleted takes its ledger with it (tenant cascade).
    IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = OLD.tenant_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Senior/PWD discount records are append-only';
  END IF;
  IF (to_jsonb(NEW) - nullable_keys) = (to_jsonb(OLD) - nullable_keys)
     AND (NEW.granted_by IS NULL OR NEW.granted_by = OLD.granted_by)
     AND (NEW.approved_by IS NULL OR NEW.approved_by = OLD.approved_by)
     AND (NEW.approval_id IS NULL OR NEW.approval_id = OLD.approval_id)
     AND (NEW.outlet_id IS NULL OR NEW.outlet_id = OLD.outlet_id) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Senior/PWD discount records are append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_gov_discount_claims_append_only ON public.gov_discount_claims;
CREATE TRIGGER trg_gov_discount_claims_append_only
  BEFORE UPDATE OR DELETE ON public.gov_discount_claims
  FOR EACH ROW EXECUTE FUNCTION public.protect_gov_discount_claim();

ALTER TABLE public.gov_discount_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gov_discount_claims FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.gov_discount_claims FROM authenticated;

-- Reviewers only, and a branch-locked reviewer only for their branch. The
-- cashier who granted it does NOT read the ledger: the receipt is their copy.
DROP POLICY IF EXISTS gov_discount_claims_read_reviewer ON public.gov_discount_claims;
CREATE POLICY gov_discount_claims_read_reviewer ON public.gov_discount_claims FOR SELECT TO authenticated
  USING (
    public.app_user_has_permission(tenant_id, 'discount_review')
    AND public.app_user_may_reach_branch(tenant_id, outlet_id)
  );

-- ============================================
-- Reviews: a reviewer's verdict on a grant, append-only
-- ============================================
CREATE TABLE IF NOT EXISTS public.gov_discount_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES public.gov_discount_claims(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL,
  note TEXT,
  reviewer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gov_discount_reviews_verdict_ck CHECK (verdict IN ('ok', 'problem')),
  CONSTRAINT gov_discount_reviews_note_ck CHECK (note IS NULL OR length(note) <= 500)
);
CREATE INDEX IF NOT EXISTS idx_gov_discount_reviews_claim
  ON public.gov_discount_reviews(claim_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gov_discount_reviews_tenant
  ON public.gov_discount_reviews(tenant_id, created_at DESC);

-- The reviewer is whoever is signed in, never what the client claims; the
-- claim must belong to the same store.
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
      FROM public.app_users au WHERE au.user_id = auth.uid() LIMIT 1;
    NEW.reviewer_name := coalesce(v_name, 'Staff');
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.gov_discount_review_stamp() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_gov_discount_review_stamp ON public.gov_discount_reviews;
CREATE TRIGGER trg_gov_discount_review_stamp
  BEFORE INSERT ON public.gov_discount_reviews
  FOR EACH ROW EXECUTE FUNCTION public.gov_discount_review_stamp();

CREATE OR REPLACE FUNCTION public.protect_gov_discount_review() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.reviewer_user_id IS NULL AND OLD.reviewer_user_id IS NOT NULL
     AND (to_jsonb(NEW) - 'reviewer_user_id') = (to_jsonb(OLD) - 'reviewer_user_id') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM public.gov_discount_claims c WHERE c.id = OLD.claim_id
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Discount reviews are append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_gov_discount_reviews_append_only ON public.gov_discount_reviews;
CREATE TRIGGER trg_gov_discount_reviews_append_only
  BEFORE UPDATE OR DELETE ON public.gov_discount_reviews
  FOR EACH ROW EXECUTE FUNCTION public.protect_gov_discount_review();

ALTER TABLE public.gov_discount_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gov_discount_reviews FROM anon;
REVOKE UPDATE, DELETE ON public.gov_discount_reviews FROM authenticated;

DROP POLICY IF EXISTS gov_discount_reviews_read ON public.gov_discount_reviews;
CREATE POLICY gov_discount_reviews_read ON public.gov_discount_reviews FOR SELECT TO authenticated
  USING (public.app_user_has_permission(tenant_id, 'discount_review'));

DROP POLICY IF EXISTS gov_discount_reviews_insert ON public.gov_discount_reviews;
CREATE POLICY gov_discount_reviews_insert ON public.gov_discount_reviews FOR INSERT TO authenticated
  WITH CHECK (public.app_user_has_permission(tenant_id, 'discount_review'));

-- ============================================
-- Rollback
-- ============================================
-- DROP TABLE IF EXISTS public.gov_discount_reviews;
-- DROP FUNCTION IF EXISTS public.protect_gov_discount_review();
-- DROP FUNCTION IF EXISTS public.gov_discount_review_stamp();
-- DROP TABLE IF EXISTS public.gov_discount_claims;
-- DROP FUNCTION IF EXISTS public.protect_gov_discount_claim();
-- DROP FUNCTION IF EXISTS public.gov_discount_branch_belongs_to_tenant();
-- DROP TABLE IF EXISTS public.gov_discount_approvals;
-- DROP FUNCTION IF EXISTS public.verify_staff_approval_pin(UUID, UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.set_staff_approval_pin(UUID, UUID, TEXT);
-- DROP TABLE IF EXISTS public.staff_approval_pins;
-- ALTER TABLE public.categories DROP COLUMN IF EXISTS gov_discount_eligible;
-- ALTER TABLE public.menu_items DROP COLUMN IF EXISTS gov_discount_eligible;
-- DROP TABLE IF EXISTS public.store_tax_profile_changes;
-- DROP TABLE IF EXISTS public.store_tax_profiles;
-- DROP FUNCTION IF EXISTS public.store_tax_profile_log();
-- DROP FUNCTION IF EXISTS public.store_tax_profile_stamp();
-- DROP FUNCTION IF EXISTS public.app_user_belongs_to_store(UUID);
-- DROP FUNCTION IF EXISTS public.app_user_is_store_owner(UUID);
-- DROP FUNCTION IF EXISTS public.app_user_has_permission(UUID, TEXT);
