-- Launch combos wait for the owner's OK.
--
-- Onboarding drafts a new store's first combos from its menu. They must not go
-- live without the owner's approval, so they are filed exactly like Boost
-- Sales AI suggestions (pending -> approved -> applied) in a generation of
-- their own, marked source = 'launch'.
--
-- A launch generation is the platform's work, not the merchant's, so it never
-- counts against the store's free AI generations: the claim RPC and the app
-- count only source = 'ai'. One launch generation per store (partial unique
-- index), so a retried build cannot file the combos twice.
--
-- Safety: additive. The new column defaults to 'ai', so every existing row
-- keeps counting exactly as before. Writes stay service-role only.

ALTER TABLE public.boost_ai_generations
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'ai';

ALTER TABLE public.boost_ai_generations
  DROP CONSTRAINT IF EXISTS boost_ai_generations_source_check;
ALTER TABLE public.boost_ai_generations
  ADD CONSTRAINT boost_ai_generations_source_check CHECK (source IN ('ai', 'launch'));

COMMENT ON COLUMN public.boost_ai_generations.source IS
  'ai = a merchant-started AI run (counts against the free allowance); launch = combos drafted by onboarding (never counts).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_boost_ai_generations_one_launch
  ON public.boost_ai_generations (tenant_id)
  WHERE source = 'launch';

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
     AND source = 'ai'
     AND status = 'running'
     AND created_at < now() - p_stale_after;

  SELECT count(*) INTO v_used
    FROM public.boost_ai_generations
   WHERE tenant_id = p_tenant_id
     AND source = 'ai'
     AND status IN ('running', 'succeeded');

  IF v_used >= p_limit THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.boost_ai_generations (tenant_id, created_by, status, source)
  VALUES (p_tenant_id, p_user_id, 'running', 'ai')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_boost_ai_generation(uuid, uuid, integer, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_boost_ai_generation(uuid, uuid, integer, interval) TO service_role;

-- Rollback:
--   (restore the claim function from 20260929200000_boost_ai_generations.sql)
--   DROP INDEX IF EXISTS public.uq_boost_ai_generations_one_launch;
--   ALTER TABLE public.boost_ai_generations DROP CONSTRAINT IF EXISTS boost_ai_generations_source_check;
--   ALTER TABLE public.boost_ai_generations DROP COLUMN IF EXISTS source;
