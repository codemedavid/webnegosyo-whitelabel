-- The /funnel page sells SmartMenu at ₱999/month with no setup fee. Its order
-- form writes a checkout lead on a new 'monthly_subscription' term.
--
-- 20260410000001 declared a CHECK on payment_term, but the platform database
-- never got it (probed 2026-10-06: no checkout_leads_payment_term_check). Drop
-- whatever is there and re-add the constraint with all three terms, so the repo
-- and the database agree again. Existing rows hold only the two old terms.
ALTER TABLE public.checkout_leads
  DROP CONSTRAINT IF EXISTS checkout_leads_payment_term_check;

ALTER TABLE public.checkout_leads
  ADD CONSTRAINT checkout_leads_payment_term_check
  CHECK (payment_term IN ('downpayment_50', 'full_payment', 'monthly_subscription'));
