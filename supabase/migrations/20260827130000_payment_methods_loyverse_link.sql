-- Link SmartMenu payment methods to Loyverse payment types.
-- A non-null loyverse_payment_type_id marks the row as Loyverse-synced:
-- its name is owned by Loyverse, while details/qr/proof stay merchant-edited.
ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS loyverse_payment_type_id TEXT;

-- One SmartMenu method per Loyverse payment type per tenant (sync idempotency key).
CREATE UNIQUE INDEX IF NOT EXISTS payment_methods_tenant_loyverse_type_uidx
  ON payment_methods (tenant_id, loyverse_payment_type_id)
  WHERE loyverse_payment_type_id IS NOT NULL;
