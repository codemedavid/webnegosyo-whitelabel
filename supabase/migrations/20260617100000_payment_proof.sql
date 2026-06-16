-- Payment proof at checkout (screenshot upload and/or reference number)
--
-- Each payment method can independently require proof of payment. When a customer
-- selects a method with require_payment_proof = true, checkout is blocked until
-- they provide AT LEAST ONE of: a payment screenshot OR a reference number.
-- Cash-on-delivery / cash methods can leave this off so they never gate checkout.
--
-- Storage hygiene: the screenshot lives on Cloudinary. We keep payment_proof_public_id
-- so the asset can be deleted (a) when the customer swaps the image pre-submit and
-- (b) automatically once the merchant marks the order's payment as verified.

ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS require_payment_proof boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN payment_methods.require_payment_proof IS
  'When true, checkout blocks until the customer provides a screenshot or reference number for this payment method. Default false (e.g. cash on delivery).';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_proof_url text,
  ADD COLUMN IF NOT EXISTS payment_proof_public_id text,
  ADD COLUMN IF NOT EXISTS payment_proof_reference text,
  ADD COLUMN IF NOT EXISTS payment_proof_uploaded_at timestamptz;

COMMENT ON COLUMN orders.payment_proof_url IS
  'Cloudinary secure_url of the customer-uploaded payment screenshot. NULL once purged after verification.';
COMMENT ON COLUMN orders.payment_proof_public_id IS
  'Cloudinary public_id of the payment screenshot, used to delete the asset on replace or after verification.';
COMMENT ON COLUMN orders.payment_proof_reference IS
  'Customer-entered payment reference / transaction number.';
COMMENT ON COLUMN orders.payment_proof_uploaded_at IS
  'Timestamp the payment proof (screenshot or reference) was captured at checkout.';
