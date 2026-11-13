-- Customer app P9: one row per store-app build that App Studio starts
-- (plan docs/plans/2026-11-13-customer-app-p9-build-pipeline.md).
--
-- App Studio inserts a row (queued) and dispatches the GitHub workflow with a
-- one-time token; only the token's sha256 is kept here. The workflow trades
-- the token for its manifest (preparing), starts the EAS build and reports
-- its id (building); EAS's webhook then finishes it (finished / errored /
-- cancelled) and reports the TestFlight / Play submission (submit_status).
--
-- Service role only, like tenant_apps: App Studio's server actions check the
-- console permission, the CI routes check the CI secret + build token, the
-- EAS route checks the webhook signature.

CREATE TABLE IF NOT EXISTS public.tenant_app_builds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant_apps(tenant_id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'preparing', 'building', 'finished', 'errored', 'cancelled')),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  token_expires_at timestamptz NOT NULL,
  eas_build_id text UNIQUE CHECK (eas_build_id IS NULL OR eas_build_id ~ '^[0-9a-f-]{36}$'),
  app_version text CHECK (app_version IS NULL OR char_length(app_version) <= 32),
  build_number text CHECK (build_number IS NULL OR char_length(build_number) <= 32),
  artifact_url text CHECK (artifact_url IS NULL OR (artifact_url ~ '^https://' AND char_length(artifact_url) <= 2000)),
  -- Whether this build was sent to testers (TestFlight / Play internal), and how that went.
  submit_status text NOT NULL DEFAULT 'none'
    CHECK (submit_status IN ('none', 'submitting', 'submitted', 'submit_failed')),
  error text CHECK (error IS NULL OR char_length(error) <= 2000),
  -- What was built: the identity, versions and asset URLs handed to the workflow.
  manifest jsonb CHECK (manifest IS NULL OR jsonb_typeof(manifest) = 'object'),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

COMMENT ON TABLE public.tenant_app_builds IS
  'Store-app builds started from App Studio (GitHub workflow → EAS). Service role only.';

-- One open build per app and platform: a second tap can't start a parallel build.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_app_builds_one_open
  ON public.tenant_app_builds (tenant_id, platform)
  WHERE status IN ('queued', 'preparing', 'building');

CREATE INDEX IF NOT EXISTS tenant_app_builds_tenant_created
  ON public.tenant_app_builds (tenant_id, created_at DESC);

-- A status only moves forward, and a finished build stays finished: a late or
-- replayed webhook (EAS retries) can never reopen or rewrite an outcome.
CREATE OR REPLACE FUNCTION public.tenant_app_builds_forward_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  rank_old int := CASE OLD.status WHEN 'queued' THEN 0 WHEN 'preparing' THEN 1 WHEN 'building' THEN 2 ELSE 3 END;
  rank_new int := CASE NEW.status WHEN 'queued' THEN 0 WHEN 'preparing' THEN 1 WHEN 'building' THEN 2 ELSE 3 END;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND (rank_new < rank_old OR rank_old = 3) THEN
    RAISE EXCEPTION 'build % cannot move from % to %', OLD.id, OLD.status, NEW.status USING ERRCODE = '23514';
  END IF;
  IF OLD.eas_build_id IS NOT NULL AND NEW.eas_build_id IS DISTINCT FROM OLD.eas_build_id THEN
    RAISE EXCEPTION 'build % already has its EAS build', OLD.id USING ERRCODE = '23514';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.platform IS DISTINCT FROM OLD.platform THEN
    RAISE EXCEPTION 'build % cannot change store or platform', OLD.id USING ERRCODE = '23514';
  END IF;
  IF NEW.status IN ('finished', 'errored', 'cancelled') AND OLD.status NOT IN ('finished', 'errored', 'cancelled') THEN
    NEW.finished_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tenant_app_builds_forward_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tenant_app_builds_forward_only ON public.tenant_app_builds;
CREATE TRIGGER tenant_app_builds_forward_only
  BEFORE UPDATE ON public.tenant_app_builds
  FOR EACH ROW EXECUTE FUNCTION public.tenant_app_builds_forward_only();

ALTER TABLE public.tenant_app_builds ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tenant_app_builds FROM anon, authenticated;

GRANT ALL ON public.tenant_app_builds TO service_role;
