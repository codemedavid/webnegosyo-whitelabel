-- Applied to platform 2026-11-09 as version 20261109025736; the file carries
-- that version so the repo and the live migration history agree.
-- The /funnel's six-month plan can now be paid ₱999 a month for six months
-- ('six_month_installment'), replacing the ₱2,000 downpayment on the page. The
-- downpayment term stays valid for the leads already filed with it. Both
-- checkout leads and sign-up links (onboarding_invites) carry a term, so both
-- CHECKs widen. Purely additive: every existing row already holds an older term.
ALTER TABLE public.checkout_leads
  DROP CONSTRAINT IF EXISTS checkout_leads_payment_term_check;

ALTER TABLE public.checkout_leads
  ADD CONSTRAINT checkout_leads_payment_term_check
  CHECK (payment_term IN (
    'downpayment_50', 'full_payment', 'monthly_subscription', 'six_month_full', 'six_month_downpayment',
    'six_month_installment'
  ));

ALTER TABLE public.onboarding_invites
  DROP CONSTRAINT IF EXISTS onboarding_invites_payment_term_check;

ALTER TABLE public.onboarding_invites
  ADD CONSTRAINT onboarding_invites_payment_term_check
  CHECK (payment_term IN (
    'downpayment_50', 'full_payment', 'monthly_subscription', 'six_month_full', 'six_month_downpayment',
    'six_month_installment'
  ));
