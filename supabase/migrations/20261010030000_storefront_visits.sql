-- Storefront visits: how many people opened a store, per Manila business day.
--
-- The owner's Start here page needs a number a brand-new store can show
-- before its first order. One row per store per day (never one per visit),
-- so a busy store costs one row a day. Written only by the service role via
-- record_storefront_visit() — called from POST /api/storefront/visit, which
-- rate limits per IP; the browser counts at most one visit per session.
-- Read only by the service role, after the caller is verified as an owner.

CREATE TABLE IF NOT EXISTS public.storefront_visits (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Business day in Asia/Manila.
  day date NOT NULL,
  visits integer NOT NULL DEFAULT 0 CHECK (visits >= 0),
  PRIMARY KEY (tenant_id, day)
);

COMMENT ON TABLE public.storefront_visits IS
  'Storefront opens per store per Manila day (one per browser session). Service role only.';

ALTER TABLE public.storefront_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storefront_visits FROM anon, authenticated;
GRANT ALL ON public.storefront_visits TO service_role;

CREATE OR REPLACE FUNCTION public.record_storefront_visit(p_tenant_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.storefront_visits AS v (tenant_id, day, visits)
  VALUES (p_tenant_id, (now() AT TIME ZONE 'Asia/Manila')::date, 1)
  ON CONFLICT (tenant_id, day) DO UPDATE SET visits = v.visits + 1;
$$;

REVOKE ALL ON FUNCTION public.record_storefront_visit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_storefront_visit(uuid) TO service_role;

-- Rollback:
--   DROP FUNCTION IF EXISTS public.record_storefront_visit(uuid);
--   DROP TABLE IF EXISTS public.storefront_visits;
