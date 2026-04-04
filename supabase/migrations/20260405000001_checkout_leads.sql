-- Platform payment methods (not tenant-scoped)
CREATE TABLE platform_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('qr_code', 'bank_transfer', 'other')),
  details text,
  qr_code_url text,
  is_active boolean NOT NULL DEFAULT true,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "superadmin_all" ON platform_payment_methods
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'superadmin'
    )
  );

-- Allow anonymous reads of active payment methods (for checkout form)
CREATE POLICY "public_read_active" ON platform_payment_methods
  FOR SELECT USING (is_active = true);

-- Checkout leads
CREATE TABLE checkout_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number text UNIQUE NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  business_name text NOT NULL,
  notes text,
  selected_payment_method_id uuid REFERENCES platform_payment_methods(id),
  status text NOT NULL DEFAULT 'initiated'
    CHECK (status IN ('initiated', 'paid', 'setup_in_progress', 'live', 'cancelled')),
  payment_proof_url text,
  payment_proof_uploaded_at timestamptz,
  amount numeric NOT NULL DEFAULT 3899,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE checkout_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "superadmin_all" ON checkout_leads
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'superadmin'
    )
  );

-- Checkout lead status history
CREATE TABLE checkout_lead_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_lead_id uuid NOT NULL REFERENCES checkout_leads(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE checkout_lead_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "superadmin_all" ON checkout_lead_status_history
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'superadmin'
    )
  );

-- Indexes
CREATE INDEX idx_checkout_leads_status ON checkout_leads(status);
CREATE INDEX idx_checkout_leads_reference ON checkout_leads(reference_number);
CREATE INDEX idx_checkout_leads_email ON checkout_leads(email);
CREATE INDEX idx_checkout_leads_created_at ON checkout_leads(created_at DESC);
CREATE INDEX idx_checkout_lead_history_lead_id ON checkout_lead_status_history(checkout_lead_id);
CREATE INDEX idx_platform_payment_methods_active ON platform_payment_methods(is_active, order_index);
