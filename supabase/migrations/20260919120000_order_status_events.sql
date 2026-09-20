-- Order status events — who moved an order, and when
--
-- Every surface that confirms, readies, completes or cancels an order — the
-- web admin, the merchant app's list, kitchen board, drawer and scanner — took
-- only the new status and dropped the person doing it. A POS sale names its
-- cashier (customerData.pos.cashierId) and an edit names its editor
-- (edited_by), but the most common act of all, tapping Confirm on a web order,
-- left no trace. So "which orders did Ana confirm on her shift" could not be
-- answered, on any backend.
--
-- Lives in the PLATFORM database for every tenant, exactly like staff_shifts:
-- orders live in Convex or the platform's own orders table depending on the
-- store, and an event log beside the shifts works identically for both with
-- no Convex redeploy. The order is named by (backend, external_order_id), the
-- same pair customer_external_orders uses.
--
-- Append-only. An event is evidence of an act; a corrected act is a later
-- event, never an edit. No UPDATE or DELETE policy exists, and the trigger
-- refuses both for every role including service_role.
--
-- Additive: one new table, no existing object altered. Rollback at end.

CREATE TABLE IF NOT EXISTS order_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- The branch the order belongs to, when the writer knew it. NULL is
  -- "unknown or unbranched", not "the store pool": most status changes arrive
  -- with only the order id, so the read policy below also lets an actor read
  -- their own events regardless of branch.
  outlet_id UUID REFERENCES outlets(id) ON DELETE SET NULL,

  backend TEXT NOT NULL,
  external_order_id TEXT NOT NULL,

  -- 'placed' is the register ringing a sale (the cashier is the actor);
  -- 'status_changed' is any later move. Both carry the resulting status.
  event TEXT NOT NULL,
  status TEXT NOT NULL,
  previous_status TEXT,

  -- 'pos' or 'online', when the writer knew. Lets the shift report separate
  -- "sales I rang" from "web orders I handled" without re-reading the order.
  source TEXT,
  -- Snapshot at the time of the event, when known. Never recomputed.
  order_total NUMERIC(12,2),

  -- SET NULL with the name snapshotted, as staff_shifts does: removing an
  -- account must not anonymise last month's activity.
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,

  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT order_status_events_backend_ck
    CHECK (backend IN ('convex', 'tenant_supabase', 'platform_supabase')),
  CONSTRAINT order_status_events_event_ck
    CHECK (event IN ('placed', 'status_changed')),
  CONSTRAINT order_status_events_source_ck
    CHECK (source IS NULL OR source IN ('pos', 'online')),
  CONSTRAINT order_status_events_total_nonneg_ck
    CHECK (order_total IS NULL OR order_total >= 0)
);

COMMENT ON TABLE order_status_events IS 'Append-only: who placed or moved an order, per backend. Brackets the orders like staff_shifts does; moves nothing.';
COMMENT ON COLUMN order_status_events.actor_name IS 'Snapshot at write so deleting the account keeps the history named.';
COMMENT ON COLUMN order_status_events.order_total IS 'The order total as the writer saw it at the event. Evidence, never recomputed.';

-- The staff report reads newest-first per store, per person, per window; the
-- dedupe read asks for the latest event of one order.
CREATE INDEX IF NOT EXISTS idx_order_status_events_tenant_occurred
  ON order_status_events(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_status_events_actor
  ON order_status_events(tenant_id, actor_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_status_events_order
  ON order_status_events(tenant_id, backend, external_order_id, occurred_at DESC);

-- ============================================
-- The branch must belong to this store
-- ============================================
CREATE OR REPLACE FUNCTION order_status_event_branch_belongs_to_tenant() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.outlet_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM outlets o WHERE o.id = NEW.outlet_id AND o.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Order event branch belongs to a different store';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_order_status_event_branch ON order_status_events;
CREATE TRIGGER trg_order_status_event_branch
  BEFORE INSERT ON order_status_events
  FOR EACH ROW EXECUTE FUNCTION order_status_event_branch_belongs_to_tenant();

-- ============================================
-- Append-only, for every role
-- ============================================
-- Same shape as stock_movements (20260807120000): the service role bypasses
-- RLS, so the guarantee has to be a trigger. The one permitted update is the
-- FK's own SET NULL when an account is deleted — the name survives.
CREATE OR REPLACE FUNCTION protect_order_status_event() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Order status events are append-only';
  END IF;
  IF NEW.actor_user_id IS NULL AND OLD.actor_user_id IS NOT NULL
    AND (to_jsonb(NEW) - 'actor_user_id') = (to_jsonb(OLD) - 'actor_user_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Order status events are append-only';
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_order_status_event_append_only ON order_status_events;
CREATE TRIGGER trg_order_status_event_append_only
  BEFORE UPDATE OR DELETE ON order_status_events
  FOR EACH ROW EXECUTE FUNCTION protect_order_status_event();

-- ============================================
-- RLS — read by branch reach or as the actor; written only by the platform
-- ============================================
-- Every writer is a web route or server action running service-role after
-- verifying the caller's tenant, so no INSERT policy is granted to
-- `authenticated`: a phone with a session token cannot write events for a
-- colleague. Reads reuse app_user_may_reach_branch() from 20260809120000 so
-- the branch rule has one definition; the OR arm lets a branch-locked account
-- see its own acts on orders whose branch the writer did not know.
ALTER TABLE order_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_status_events_read_branch ON order_status_events;
CREATE POLICY order_status_events_read_branch ON order_status_events FOR SELECT TO authenticated
  USING (
    app_user_may_reach_branch(tenant_id, outlet_id)
    OR actor_user_id = auth.uid()
  );

DROP POLICY IF EXISTS order_status_events_read_superadmin ON order_status_events;
CREATE POLICY order_status_events_read_superadmin ON order_status_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users au WHERE au.user_id = auth.uid() AND au.role = 'superadmin'));

-- ============================================
-- Rollback
-- ============================================
-- DROP POLICY IF EXISTS order_status_events_read_superadmin ON order_status_events;
-- DROP POLICY IF EXISTS order_status_events_read_branch ON order_status_events;
-- DROP TRIGGER IF EXISTS trg_order_status_event_append_only ON order_status_events;
-- DROP FUNCTION IF EXISTS protect_order_status_event();
-- DROP TRIGGER IF EXISTS trg_order_status_event_branch ON order_status_events;
-- DROP FUNCTION IF EXISTS order_status_event_branch_belongs_to_tenant();
-- DROP TABLE IF EXISTS order_status_events;
