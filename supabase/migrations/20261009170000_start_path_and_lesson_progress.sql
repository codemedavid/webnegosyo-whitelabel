-- The owner's "Start here" path and in-admin lesson progress.
--
-- 1. owner_path_ticks: the few Start-here steps no data can prove (e.g. "I put
--    my link on my Facebook page"). Every other step ticks itself from the
--    store's own data. One row per store per step.
-- 2. university_lesson_progress: which University lessons a person watched in
--    the admin's Learn page, so the path and Learn agree on phone and laptop
--    (the public portal keeps its per-browser progress).
--
-- Both are written and read ONLY by the service role, from server code that
-- first verifies the caller is an admin of the store (and, for progress, that
-- the row is the caller's own). No anon/authenticated grants.
--
-- Safety: additive (two new tables). Rollback at the bottom.

CREATE TABLE IF NOT EXISTS public.owner_path_ticks (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  step_id text NOT NULL CHECK (step_id ~ '^[a-z_]{2,40}$'),
  ticked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ticked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, step_id)
);

COMMENT ON TABLE public.owner_path_ticks IS
  'Start-here steps an owner marked done by hand (the ones data cannot prove). Service role only.';

ALTER TABLE public.owner_path_ticks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_path_ticks FROM anon, authenticated;
GRANT ALL ON public.owner_path_ticks TO service_role;

CREATE TABLE IF NOT EXISTS public.university_lesson_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.university_lessons(id) ON DELETE CASCADE,
  -- The store the lesson was watched from, for per-store reporting; null = outside a store.
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  watched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_university_lesson_progress_tenant
  ON public.university_lesson_progress (tenant_id)
  WHERE tenant_id IS NOT NULL;

COMMENT ON TABLE public.university_lesson_progress IS
  'Lessons a person marked watched in the admin Learn page. Service role only.';

ALTER TABLE public.university_lesson_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.university_lesson_progress FROM anon, authenticated;
GRANT ALL ON public.university_lesson_progress TO service_role;

-- Rollback:
--   DROP TABLE IF EXISTS public.university_lesson_progress;
--   DROP TABLE IF EXISTS public.owner_path_ticks;
