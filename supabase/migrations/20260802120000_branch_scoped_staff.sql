-- Branch-scoped merchant accounts — multi-branch Phase 2.
--
-- Purely additive: one nullable column on app_users, one CHECK, one index, one
-- validation trigger, and a rewrite of the existing staff-limit trigger. No
-- renames, no drops, no backfill. `outlet_id IS NULL` means "every branch",
-- which is exactly what every account that exists today means, so no current
-- row changes behaviour and no current query needs updating.
--
-- Design note: a branch account is NOT a new role. Adding role='branch_admin'
-- would have to be taught to every `role = 'admin'` test in the RLS policies,
-- src/middleware.ts, admin-service.ts, and the merchant app's
-- session-resolve.ts. A nullable scope column reaches all of those as data
-- instead, the same way orders.outlet_id did in 20260730120000.

-- ============================================
-- 1. app_users.outlet_id — the branch an account is confined to
-- ============================================
-- ON DELETE SET NULL rather than CASCADE: deleting a branch must not delete
-- the people who worked at it. Their accounts widen to the whole tenant, which
-- is visible to the owner and recoverable, unlike a deleted login.
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS outlet_id UUID REFERENCES public.outlets(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.app_users.outlet_id IS
  'Branch this account is confined to. NULL = every branch (all pre-multi-branch accounts, and every owner).';

-- An owner or a superadmin is never confined to one branch: the cross-branch
-- comparison views exist for exactly those accounts. The application resolves
-- the same rule in src/lib/outlets/branch-scope.ts; this constraint stops an
-- out-of-band write from creating a row whose meaning the two disagree on.
ALTER TABLE public.app_users
  DROP CONSTRAINT IF EXISTS app_users_outlet_scope_ck;
ALTER TABLE public.app_users
  ADD CONSTRAINT app_users_outlet_scope_ck CHECK (
    outlet_id IS NULL OR (role = 'admin' AND is_owner = false)
  );

CREATE INDEX IF NOT EXISTS app_users_tenant_outlet_idx
  ON public.app_users(tenant_id, outlet_id);

-- ============================================
-- 2. The branch must belong to the account's own tenant
-- ============================================
-- Not expressible as a CHECK (it reads another table), and a composite foreign
-- key would require a redundant unique index on outlets(id, tenant_id). A
-- trigger states the rule where the wrong value is written: an account scoped
-- to another merchant's branch would see that merchant's orders.
CREATE OR REPLACE FUNCTION public.enforce_app_user_outlet_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  outlet_tenant UUID;
BEGIN
  IF new.outlet_id IS NULL THEN
    RETURN new;
  END IF;

  SELECT o.tenant_id INTO outlet_tenant
  FROM public.outlets o
  WHERE o.id = new.outlet_id;

  IF outlet_tenant IS NULL THEN
    RAISE EXCEPTION 'Unknown branch for this account';
  END IF;

  IF new.tenant_id IS NULL OR outlet_tenant <> new.tenant_id THEN
    RAISE EXCEPTION 'Branch does not belong to this account''s store';
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS app_users_enforce_outlet_tenant ON public.app_users;
CREATE TRIGGER app_users_enforce_outlet_tenant
  BEFORE INSERT OR UPDATE ON public.app_users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_app_user_outlet_tenant();

-- ============================================
-- 3. Staff limit becomes per-branch for branch accounts
-- ============================================
-- The cap from 20260710120000 counted every staff row in the tenant, which
-- makes a multi-branch business unusable: five branches would share three
-- accounts between them. A branch-scoped account is now counted against its
-- own branch; tenant-wide accounts keep the original tenant-wide cap. Both
-- limits are still 3, and a single-location tenant sees no change at all.
CREATE OR REPLACE FUNCTION public.enforce_staff_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  peer_count INTEGER;
BEGIN
  IF new.role = 'admin' AND new.is_owner = false AND new.tenant_id IS NOT NULL THEN
    SELECT count(*) INTO peer_count
    FROM public.app_users
    WHERE tenant_id = new.tenant_id
      AND role = 'admin'
      AND is_owner = false
      AND user_id <> new.user_id
      -- Same bucket as the incoming row: its branch, or the tenant-wide pool.
      AND outlet_id IS NOT DISTINCT FROM new.outlet_id;

    IF peer_count >= 3 THEN
      IF new.outlet_id IS NULL THEN
        RAISE EXCEPTION 'Staff limit reached: a store may have at most 3 store-wide staff accounts';
      ELSE
        RAISE EXCEPTION 'Staff limit reached: a branch may have at most 3 staff accounts';
      END IF;
    END IF;
  END IF;

  RETURN new;
END;
$$;

-- ============================================
-- Rollback (manual)
-- ============================================
-- DROP TRIGGER IF EXISTS app_users_enforce_outlet_tenant ON public.app_users;
-- DROP FUNCTION IF EXISTS public.enforce_app_user_outlet_tenant();
-- DROP INDEX IF EXISTS app_users_tenant_outlet_idx;
-- ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_outlet_scope_ck;
-- ALTER TABLE public.app_users DROP COLUMN IF EXISTS outlet_id;
-- (and restore the tenant-wide enforce_staff_limit body from 20260710120000)
