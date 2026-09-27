-- A merchant's own client writes exactly one kind of audit row: the manual
-- movement they just recorded. Every order-driven row is written by the service
-- role. Without this, an admin could insert a self-attributed `order_sale`
-- "applied" row with invented lines into a log whose purpose is settling
-- "was this deducted twice?" disputes.
DROP POLICY IF EXISTS inventory_audit_log_insert_branch ON public.inventory_audit_log;

CREATE POLICY inventory_audit_log_insert_branch ON public.inventory_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.app_user_may_reach_branch(tenant_id, outlet_id)
              AND actor_user_id = auth.uid()
              AND event = 'manual_movement'
              AND order_id IS NULL);
