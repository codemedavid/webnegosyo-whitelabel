-- Tenant operating hours (per-weekday open/close + closed days)
-- Drives advance-order scheduling slot windows so customers can only pick times
-- when the shop is actually open. NULL = no hours configured, in which case the
-- advance scheduler falls back to the historical 08:00–22:00 window (backward compatible).
--
-- Operating hours ONLY constrain advance/scheduled slot generation. ASAP ordering is
-- never gated by hours, so a missing/misconfigured value can never block the core flow.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS operating_hours jsonb,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Manila';

COMMENT ON COLUMN tenants.operating_hours IS
  'Per-weekday operating hours keyed by weekday 0=Sun..6=Sat, e.g. {"1":{"closed":false,"open":"09:00","close":"21:00"}}. NULL = unset (advance scheduler uses default 08:00–22:00).';

COMMENT ON COLUMN tenants.timezone IS
  'IANA timezone for the store (e.g. Asia/Manila). Used for advance-order slot math.';
