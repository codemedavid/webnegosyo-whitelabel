-- Senior/PWD ID photos (optional, off by default)
--
-- The law asks for the claimant's name and ID number (RR 7-2010 §7), not a
-- picture of the card. Some owners still want one to settle disputes, so a
-- store may switch photos to OPTIONAL: the cashier may photograph the ID or
-- skip it, and the sale never waits on it. There is deliberately no
-- "required" mode.
--
-- An ID photo is personal data (Data Privacy Act), so:
--   * the bucket is PRIVATE and has no storage policies at all — only the
--     service role (the upload and view routes) touches its objects;
--   * a photo's row is readable only by `discount_review` holders, branch-
--     scoped like the sales book, and only until it expires;
--   * every photo expires 90 days after it was taken. The daily purge
--     (`/api/gov-discounts/id-photos/purge`, Vercel cron) deletes the object
--     through the Storage API — Supabase refuses direct DELETEs on
--     storage.objects — and then the row. Viewing stops at `expires_at` even
--     if the purge is late.
--
-- Additive: one column with a default, one table, one bucket. Rollback at the
-- end.

-- ============================================
-- The store's choice
-- ============================================
ALTER TABLE public.store_tax_profiles
  ADD COLUMN IF NOT EXISTS id_photo_mode TEXT NOT NULL DEFAULT 'off';

ALTER TABLE public.store_tax_profiles
  DROP CONSTRAINT IF EXISTS store_tax_profiles_id_photo_mode_ck;
ALTER TABLE public.store_tax_profiles
  ADD CONSTRAINT store_tax_profiles_id_photo_mode_ck CHECK (id_photo_mode IN ('off', 'optional'));

COMMENT ON COLUMN public.store_tax_profiles.id_photo_mode IS
  'off (default) | optional: the register may photograph a Senior/PWD ID, never must.';

-- ============================================
-- The photos
-- ============================================
CREATE TABLE IF NOT EXISTS public.gov_discount_id_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Copied from the sales-book row the photo belongs to (branch scoping).
  outlet_id UUID REFERENCES public.outlets(id) ON DELETE SET NULL,

  -- Named like the sales book names an order and a claimant on it.
  backend TEXT NOT NULL,
  external_order_id TEXT NOT NULL,
  claimant_ref TEXT NOT NULL,

  object_path TEXT NOT NULL UNIQUE,
  captured_at TIMESTAMPTZ NOT NULL,
  -- Set by the trigger below: captured_at + 90 days, never from the client.
  expires_at TIMESTAMPTZ NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT gov_discount_id_photos_backend_ck
    CHECK (backend IN ('convex', 'tenant_supabase', 'platform_supabase')),
  -- One photo per claimant per order; a retake replaces it.
  CONSTRAINT gov_discount_id_photos_once UNIQUE (tenant_id, backend, external_order_id, claimant_ref)
);

COMMENT ON TABLE public.gov_discount_id_photos IS
  'Optional Senior/PWD ID photos. Private bucket gov-discount-id-photos; reviewer-only reads; purged 90 days after capture.';

CREATE INDEX IF NOT EXISTS idx_gov_discount_id_photos_expires
  ON public.gov_discount_id_photos(expires_at);
CREATE INDEX IF NOT EXISTS idx_gov_discount_id_photos_order
  ON public.gov_discount_id_photos(tenant_id, backend, external_order_id);

CREATE OR REPLACE FUNCTION public.gov_discount_id_photo_stamp() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  -- A phone clock in the future cannot stretch the 90 days.
  IF NEW.captured_at > now() THEN
    NEW.captured_at := now();
  END IF;
  NEW.expires_at := NEW.captured_at + interval '90 days';
  IF TG_OP = 'UPDATE' THEN
    NEW.created_at := OLD.created_at;
  ELSE
    NEW.created_at := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.gov_discount_id_photo_stamp() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_gov_discount_id_photo_stamp ON public.gov_discount_id_photos;
CREATE TRIGGER trg_gov_discount_id_photo_stamp
  BEFORE INSERT OR UPDATE ON public.gov_discount_id_photos
  FOR EACH ROW EXECUTE FUNCTION public.gov_discount_id_photo_stamp();

DROP TRIGGER IF EXISTS trg_gov_discount_id_photos_branch ON public.gov_discount_id_photos;
CREATE TRIGGER trg_gov_discount_id_photos_branch
  BEFORE INSERT OR UPDATE ON public.gov_discount_id_photos
  FOR EACH ROW EXECUTE FUNCTION public.gov_discount_branch_belongs_to_tenant();

ALTER TABLE public.gov_discount_id_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gov_discount_id_photos FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.gov_discount_id_photos FROM authenticated;

-- Reviewers only (branch-locked reviewers: their branch), and only until the
-- photo expires. The view route reads through this policy as the caller.
DROP POLICY IF EXISTS gov_discount_id_photos_read_reviewer ON public.gov_discount_id_photos;
CREATE POLICY gov_discount_id_photos_read_reviewer ON public.gov_discount_id_photos FOR SELECT TO authenticated
  USING (
    expires_at > now()
    AND public.app_user_has_permission(tenant_id, 'discount_review')
    AND public.app_user_may_reach_branch(tenant_id, outlet_id)
  );

-- ============================================
-- The bucket: private, no storage.objects policies (service role only)
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('gov-discount-id-photos', 'gov-discount-id-photos', false, 3145728, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================
-- Rollback
-- ============================================
-- (Empty the bucket through the Storage API first.)
-- DELETE FROM storage.buckets WHERE id = 'gov-discount-id-photos';
-- DROP TABLE IF EXISTS public.gov_discount_id_photos;
-- DROP FUNCTION IF EXISTS public.gov_discount_id_photo_stamp();
-- ALTER TABLE public.store_tax_profiles DROP CONSTRAINT IF EXISTS store_tax_profiles_id_photo_mode_ck;
-- ALTER TABLE public.store_tax_profiles DROP COLUMN IF EXISTS id_photo_mode;
