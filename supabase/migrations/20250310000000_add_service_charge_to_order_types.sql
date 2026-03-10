ALTER TABLE order_types
  ADD COLUMN IF NOT EXISTS service_charge_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS service_charge_type text CHECK (service_charge_type IN ('percentage', 'fixed')) DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS service_charge_value numeric(10,2) DEFAULT 0;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS service_charge_amount numeric(10,2) DEFAULT 0;
