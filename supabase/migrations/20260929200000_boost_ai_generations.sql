-- Boost Sales AI generations: a log of every AI run and the offers it proposed.
--
-- A store gets a small number of free generations. The count is the log
-- itself (running + succeeded rows), so the log must be tamper-proof from the
-- browser: `authenticated` may only READ its own store's rows. Every write is
-- the service role, after the server action has checked the merchant's
-- permission. A failed run does not count against the allowance.
--
-- Proposals are reviewed one by one: pending -> approved -> applied, or
-- rejected. Nothing goes live without an approval first
-- (src/lib/boost/ai/lifecycle.ts).

-- 1. Generations ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.boost_ai_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed')),
  model text,
  -- Where the order history came from and how much of it the AI read.
  data_source text,
  orders_analyzed integer NOT NULL DEFAULT 0 CHECK (orders_analyzed >= 0),
  summary text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

COMMENT ON TABLE public.boost_ai_generations IS
  'One row per Boost Sales AI run. running+succeeded rows count against the store''s free allowance. Service-role writes only.';

CREATE INDEX IF NOT EXISTS idx_boost_ai_generations_tenant_time
  ON public.boost_ai_generations (tenant_id, created_at DESC);

-- 2. Proposals --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.boost_ai_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid NOT NULL REFERENCES public.boost_ai_generations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('combo', 'upgrade', 'pairing', 'last_call')),
  position integer NOT NULL DEFAULT 0,
  -- The validated offer (a BoostIdea); applied exactly as stored.
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  applied_at timestamptz,
  -- Id of the combo / upgrade the proposal became, when there is one.
  applied_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.boost_ai_proposals IS
  'Offers proposed by a Boost Sales AI run, reviewed pending -> approved -> applied (or rejected). Service-role writes only.';

CREATE INDEX IF NOT EXISTS idx_boost_ai_proposals_generation
  ON public.boost_ai_proposals (generation_id, position);
CREATE INDEX IF NOT EXISTS idx_boost_ai_proposals_tenant
  ON public.boost_ai_proposals (tenant_id);

-- 3. Access -----------------------------------------------------------------

ALTER TABLE public.boost_ai_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boost_ai_proposals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.boost_ai_generations FROM anon, authenticated;
REVOKE ALL ON public.boost_ai_proposals FROM anon, authenticated;
GRANT SELECT ON public.boost_ai_generations TO authenticated;
GRANT SELECT ON public.boost_ai_proposals TO authenticated;
GRANT ALL ON public.boost_ai_generations TO service_role;
GRANT ALL ON public.boost_ai_proposals TO service_role;

CREATE POLICY boost_ai_generations_select_store ON public.boost_ai_generations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.app_users au
    WHERE au.user_id = (SELECT auth.uid())
      AND (au.role = 'superadmin' OR (au.role = 'admin' AND au.tenant_id = boost_ai_generations.tenant_id))
  ));

CREATE POLICY boost_ai_proposals_select_store ON public.boost_ai_proposals
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.app_users au
    WHERE au.user_id = (SELECT auth.uid())
      AND (au.role = 'superadmin' OR (au.role = 'admin' AND au.tenant_id = boost_ai_proposals.tenant_id))
  ));

-- 4. Claiming a generation --------------------------------------------------

-- Atomically reserve one generation: two clicks at once cannot both take the
-- last free slot. A run left 'running' for longer than p_stale_after (the
-- server died mid-call) stops counting and is marked failed.
-- Returns the new generation id, or NULL when the allowance is used up.
CREATE OR REPLACE FUNCTION public.claim_boost_ai_generation(
  p_tenant_id uuid,
  p_user_id uuid,
  p_limit integer,
  p_stale_after interval DEFAULT interval '10 minutes'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_used integer;
  v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('boost_ai_generation:' || p_tenant_id::text));

  UPDATE public.boost_ai_generations
     SET status = 'failed', error = 'Timed out', completed_at = now()
   WHERE tenant_id = p_tenant_id
     AND status = 'running'
     AND created_at < now() - p_stale_after;

  SELECT count(*) INTO v_used
    FROM public.boost_ai_generations
   WHERE tenant_id = p_tenant_id
     AND status IN ('running', 'succeeded');

  IF v_used >= p_limit THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.boost_ai_generations (tenant_id, created_by, status)
  VALUES (p_tenant_id, p_user_id, 'running')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_boost_ai_generation(uuid, uuid, integer, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_boost_ai_generation(uuid, uuid, integer, interval) TO service_role;

-- Rollback:
--   DROP FUNCTION IF EXISTS public.claim_boost_ai_generation(uuid, uuid, integer, interval);
--   DROP TABLE IF EXISTS public.boost_ai_proposals;
--   DROP TABLE IF EXISTS public.boost_ai_generations;
