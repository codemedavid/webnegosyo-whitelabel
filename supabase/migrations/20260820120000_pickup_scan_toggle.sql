-- Per-tenant switch for the scan-to-collect pickup flow.
--
-- Defaults to true so every existing store keeps today's behaviour: pickup
-- orders show a collection QR and the merchant app accepts it. Turning this
-- off both hides the customer's code and makes the app refuse tickets that
-- were already printed or screenshotted — the switch has to bite on codes
-- that still decode perfectly well.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS pickup_scan_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tenants.pickup_scan_enabled IS
  'Tenant-admin switch for scan-to-collect pickup. False hides the customer QR and blocks confirmation in the merchant app.';
