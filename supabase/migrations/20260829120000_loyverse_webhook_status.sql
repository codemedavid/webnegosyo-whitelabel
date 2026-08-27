-- Loyverse sync: make webhook registration status visible.
--
-- Webhook auto-registration deliberately never throws (a sync must not fail
-- because webhook setup did), which meant its failures lived only in a
-- one-shot report object nobody read. The real merchant ran for weeks with
-- ZERO webhooks registered in Loyverse — live sync silently off — because
-- the required env secret was missing and nothing surfaced it.
--
-- Two nullable columns, written by src/lib/loyverse/sync-orchestrator.ts on
-- every sync/reconcile, shown in the superadmin tenant form. Purely additive.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS loyverse_webhooks_registered_at timestamptz,
  ADD COLUMN IF NOT EXISTS loyverse_webhook_error text;

COMMENT ON COLUMN public.tenants.loyverse_webhooks_registered_at IS
  'Last time Loyverse webhooks were confirmed registered/active for this tenant. NULL = never confirmed. Written by src/lib/loyverse/sync-orchestrator.ts; deliberately NOT erased on later failures.';

COMMENT ON COLUMN public.tenants.loyverse_webhook_error IS
  'Error from the most recent webhook registration attempt, NULL when it succeeded. Surfaced in the superadmin tenant form so continuous sync being off is visible.';
