-- Lalamove sender (pickup) contact.
--
-- The Lalamove driver calls the SENDER number to coordinate pickup at the
-- store. Previously the booking code mistakenly sent the customer's phone as
-- the sender, so drivers called the customer for pickup. This column lets each
-- merchant set the store's own pickup contact number. When NULL, booking falls
-- back to footer_phone / footer_whatsapp, then to the tenant name.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS lalamove_sender_phone text;

COMMENT ON COLUMN tenants.lalamove_sender_phone IS
  'Store pickup contact number (E.164 preferred) the Lalamove driver calls for pickup. Falls back to footer_phone when null.';
