-- Per-order-type "Pay after billing": checkout skips the payment-details step
-- (account numbers, QR codes, proof upload) — the customer picks a payment
-- method and the order is placed directly; the bill is settled after service.
-- Opt-in per order type; existing rows default to off (current behavior).

ALTER TABLE order_types
  ADD COLUMN IF NOT EXISTS after_billing_payment_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN order_types.after_billing_payment_enabled IS
  'When true, checkout skips the payment-details step; the customer picks a method and pays after billing.';
