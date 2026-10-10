-- Sign-up links for customers who bought outside the funnel.
--
-- Staff make a link (Superadmin → Checkout Leads → Sign-up links) and send it
-- anywhere. Whoever opens it types their own name, business, email and phone,
-- becomes a PAID checkout lead at the link's plan, and lands in the same
-- set-up wizard as every other paid buyer.
--
-- 1. onboarding_invites — one row per link. Single use: `claimed_at` is set
--    by ONE conditional UPDATE (… WHERE claimed_at IS NULL AND revoked_at IS
--    NULL AND expires_at > now()), so two people racing on the same link get
--    one store between them. Only the sha256 of the code is stored: whoever
--    holds the code gets a store, so a leaked row must not be replayable.
--    Service-role only (RLS on, no policies, no grants).
-- 2. onboarding_email_taken(email) — whether an email already has a login,
--    so the join form refuses it BEFORE the link is spent (the wizard would
--    otherwise fail at its last step). Service role only.

CREATE TABLE IF NOT EXISTS public.onboarding_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
  payment_term text NOT NULL
    CHECK (payment_term IN ('downpayment_50', 'full_payment', 'monthly_subscription')),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  revoked_at timestamptz,
  checkout_lead_id uuid UNIQUE REFERENCES public.checkout_leads(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_invites_created_at_idx ON public.onboarding_invites (created_at DESC);

ALTER TABLE public.onboarding_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.onboarding_invites FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.onboarding_email_taken(p_email text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = lower(trim(p_email))
  );
$function$;

REVOKE ALL ON FUNCTION public.onboarding_email_taken(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.onboarding_email_taken(text) TO service_role;
