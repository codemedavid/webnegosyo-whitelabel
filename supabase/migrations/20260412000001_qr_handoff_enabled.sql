ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS qr_handoff_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN tenants.qr_handoff_enabled IS 'When enabled, web checkout shows a QR thank-you page instead of writing the order / redirecting to Messenger. The vendor scanner app is the sole writer.';
