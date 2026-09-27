-- Inventory audit log + manual-movement retry key + stock_alerts tenant fix.
--
-- 1. inventory_audit_log
--    `stock_movements` records what a deduction DID. It cannot say what was
--    ATTEMPTED: a second depletion of the same order is refused by the claim in
--    `order_stock_applications` and leaves no trace at all, and an order-driven
--    ledger row names neither the path that triggered it (web checkout, the
--    register, the customer app, a QR hand-off, an edit, an un-cancel) nor the
--    person who rang it up. "Stock was deducted twice" could therefore not be
--    confirmed or refuted from the database. This table is one row per stock
--    OPERATION — applied, refused as a duplicate, stood down for a cancellation,
--    found nothing to deduct, or failed — with the source, the acting user and
--    the per-ingredient lines it wrote.
--
--    Append-only for tenants: SELECT only. Rows are written by the service role
--    (the order pipeline) and by the merchant's own client for manual movements,
--    so INSERT is allowed where the ledger's own INSERT would be.
--
-- 2. stock_movements.client_request_id
--    A phone that times out after the server has written a delivery shows an
--    error, and the merchant taps Save again. Without a key the second request
--    is a second delivery. With one, the database refuses it (unique index) and
--    the service returns the movement already recorded.
--
-- 3. stock_alerts read/write policy
--    `outlet_id IS NULL OR app_user_may_reach_branch(...)` let ANY caller —
--    anon included — read and modify every store-wide alert on the platform
--    (probed 2026-09-26: anon saw 44 alerts across 3 tenants). The NULL branch
--    was meant to widen visibility within a store, not across stores.

-- ── 1. audit log ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inventory_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  event text NOT NULL CHECK (event IN (
    'order_sale', 'order_restore', 'order_edit', 'order_redeplete', 'manual_movement'
  )),
  outcome text NOT NULL CHECK (outcome IN (
    'applied', 'duplicate', 'cancelled_first', 'nothing_to_deduct', 'failed'
  )),
  source text NOT NULL CHECK (source IN (
    'web_checkout', 'customer_app', 'pos', 'qr_scan', 'merchant_app', 'web_admin', 'system'
  )),
  order_id text,
  revision integer,
  outlet_id uuid,
  actor_user_id uuid,
  movement_count integer NOT NULL DEFAULT 0 CHECK (movement_count >= 0),
  -- [{ inventoryItemId, name, quantityDelta, enteredQuantity, enteredUnitId }]
  lines jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(lines) = 'array'),
  -- A manual movement identical to one the same person recorded minutes ago.
  -- Recorded, never refused: two identical deliveries can be real.
  is_suspected_duplicate boolean NOT NULL DEFAULT false,
  detail text CHECK (detail IS NULL OR length(detail) <= 2000)
);

COMMENT ON TABLE public.inventory_audit_log IS
  'One row per stock operation attempt (applied, duplicate-refused, failed, ...) with source and actor. Append-only.';

CREATE INDEX IF NOT EXISTS idx_inventory_audit_log_tenant_time
  ON public.inventory_audit_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_audit_log_order
  ON public.inventory_audit_log (tenant_id, order_id) WHERE order_id IS NOT NULL;

ALTER TABLE public.inventory_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventory_audit_log FROM anon;
GRANT SELECT, INSERT ON public.inventory_audit_log TO authenticated;
GRANT ALL ON public.inventory_audit_log TO service_role;

-- Same reach as the ledger it explains: a branch manager reads their branch,
-- store-wide accounts read everything in their store. NULL outlet = the store
-- pool, exactly as on stock_movements.
CREATE POLICY inventory_audit_log_select_branch ON public.inventory_audit_log
  FOR SELECT TO authenticated
  USING (public.app_user_may_reach_branch(tenant_id, outlet_id));

CREATE POLICY inventory_audit_log_select_superadmin ON public.inventory_audit_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_users au
                 WHERE au.user_id = auth.uid() AND au.role = 'superadmin'));

-- A merchant may only log under their own name.
CREATE POLICY inventory_audit_log_insert_branch ON public.inventory_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.app_user_may_reach_branch(tenant_id, outlet_id)
              AND actor_user_id = auth.uid());

-- ── 2. manual-movement retry key ────────────────────────────────────────────

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS client_request_id uuid;

COMMENT ON COLUMN public.stock_movements.client_request_id IS
  'Idempotency key a client sends with a manual movement; a retried save is refused by the unique index.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_client_request
  ON public.stock_movements (tenant_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- ── 3. stock_alerts: store membership first, then branch reach ──────────────

DROP POLICY IF EXISTS stock_alerts_manage_branch ON public.stock_alerts;

CREATE POLICY stock_alerts_manage_branch ON public.stock_alerts
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.app_users au
            WHERE au.user_id = auth.uid()
              AND au.tenant_id = stock_alerts.tenant_id
              AND au.role = ANY (ARRAY['admin', 'superadmin']))
    AND (outlet_id IS NULL OR public.app_user_may_reach_branch(tenant_id, outlet_id))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.app_users au
            WHERE au.user_id = auth.uid()
              AND au.tenant_id = stock_alerts.tenant_id
              AND au.role = ANY (ARRAY['admin', 'superadmin']))
    AND (outlet_id IS NULL OR public.app_user_may_reach_branch(tenant_id, outlet_id))
  );

-- Rollback:
--   DROP TABLE IF EXISTS public.inventory_audit_log;
--   DROP INDEX IF EXISTS public.idx_stock_movements_client_request;
--   ALTER TABLE public.stock_movements DROP COLUMN IF EXISTS client_request_id;
--   (stock_alerts: do NOT restore the previous policy — it was a cross-tenant leak.)
