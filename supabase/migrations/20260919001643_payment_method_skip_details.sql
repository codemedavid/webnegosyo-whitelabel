-- Per-payment-method control over the checkout payment-details step.
--
-- The payment-details dialog exists to hand the customer something they need:
-- an account number to copy, a QR code to scan, a screenshot to upload. Cash
-- and cash-on-delivery have none of that, so the dialog is a dead step on the
-- way to placing the order. This flag lets a merchant switch it off per method.
--
-- Strictly opt-in: default false keeps every existing method behaving exactly
-- as it does today. Nothing is inferred from the method's name — "G cash" is a
-- wallet with a QR code, and a name test would wrongly silence it.
--
-- Precedence: require_payment_proof wins. The proof UI lives inside the dialog,
-- so a method that demands a screenshot still opens it or checkout could never
-- be completed.

ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS skip_payment_details boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN payment_methods.skip_payment_details IS
  'When true, choosing this method at checkout places the order directly instead of opening the payment-details dialog (e.g. Cash / COD). Overridden by require_payment_proof, which needs that dialog to collect the screenshot. Default false.';
