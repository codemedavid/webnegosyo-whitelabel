-- Onboarding funnel events: which set-up screens each buyer reached, and the
-- milestones after (built, live, link shared, quick choices done).
--
-- One row per (set-up, event): the FIRST time it happens. Re-visits are
-- ignored (ON CONFLICT DO NOTHING), so a set-up has a few dozen rows at most
-- and "how far did they get, and when" is one indexed read. No answers are
-- stored here, only event names from a fixed list (checked in code and by
-- the pattern below).
--
-- Service role only: the wizard posts through the token-authenticated route,
-- milestones are written by the server; superadmins read through server code.
--
-- Safety: additive (one new table). Rollback at the bottom.

CREATE TABLE IF NOT EXISTS public.onboarding_events (
  onboarding_id uuid NOT NULL REFERENCES public.store_onboardings(id) ON DELETE CASCADE,
  event text NOT NULL CHECK (event ~ '^[a-z_]{2,40}(:[a-z_]{2,40})?$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (onboarding_id, event)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_events_created
  ON public.onboarding_events (created_at DESC);

COMMENT ON TABLE public.onboarding_events IS
  'First time each set-up reached a wizard screen or milestone. Service role only; no answers stored.';

ALTER TABLE public.onboarding_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.onboarding_events FROM anon, authenticated;
GRANT ALL ON public.onboarding_events TO service_role;

-- Rollback:
--   DROP TABLE IF EXISTS public.onboarding_events;
