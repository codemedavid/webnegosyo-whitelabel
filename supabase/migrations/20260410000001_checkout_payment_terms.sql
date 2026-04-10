ALTER TABLE checkout_leads
  ADD COLUMN payment_term text DEFAULT 'full_payment';

UPDATE checkout_leads
SET payment_term = 'full_payment'
WHERE payment_term IS NULL;

ALTER TABLE checkout_leads
  ALTER COLUMN payment_term SET NOT NULL;

ALTER TABLE checkout_leads
  ADD CONSTRAINT checkout_leads_payment_term_check
  CHECK (payment_term IN ('downpayment_50', 'full_payment'));
