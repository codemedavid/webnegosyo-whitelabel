-- The /funnel now sells two plans: ₱1,499 monthly, or six months for ₱5,499
-- paid in full ('six_month_full') or with a ₱2,000 downpayment
-- ('six_month_downpayment'). A lead's amount is computed server-side from its
-- term (src/lib/checkout-leads/payment-terms.ts), and both checkout leads and
-- sign-up links (onboarding_invites) carry a term, so both CHECKs widen.
-- Purely additive: every existing row already holds one of the older terms.
ALTER TABLE public.checkout_leads
  DROP CONSTRAINT IF EXISTS checkout_leads_payment_term_check;

ALTER TABLE public.checkout_leads
  ADD CONSTRAINT checkout_leads_payment_term_check
  CHECK (payment_term IN (
    'downpayment_50', 'full_payment', 'monthly_subscription', 'six_month_full', 'six_month_downpayment'
  ));

ALTER TABLE public.onboarding_invites
  DROP CONSTRAINT IF EXISTS onboarding_invites_payment_term_check;

ALTER TABLE public.onboarding_invites
  ADD CONSTRAINT onboarding_invites_payment_term_check
  CHECK (payment_term IN (
    'downpayment_50', 'full_payment', 'monthly_subscription', 'six_month_full', 'six_month_downpayment'
  ));
