-- order_revisions / order_payments: a child row takes its branch from its order
--
-- Branch managers (`app_users.outlet_id` set) could not save an edited order:
-- "new row violates row-level security policy for table order_revisions".
--
-- The INSERT policy admits a branch account only when the row's OWN `outlet_id`
-- equals the account's branch. The merchant app's POS edit flow sent
-- `outletId` to `recordPayment` but never to `reviseOrder`, so every revision
-- went in with `outlet_id = NULL` — fine for a store-wide account (NULL branch
-- = every branch), refused for every branch manager. Store-wide owners never
-- saw it, which is why it reached a store.
--
-- The app is fixed too, but installed builds keep sending NULL until they
-- update, and any future writer can forget the same field. The parent order is
-- the authority on which branch a revision or payment belongs to
-- (`20260814120000` backfilled these columns from it for the same reason), so
-- the database stamps it on the way in.
--
-- WITH CHECK runs AFTER BEFORE-row triggers, so the policy judges the stamped
-- row. Nothing is widened: a branch manager still cannot write a child row for
-- another branch's order — the stamped branch is that order's, and the policy
-- refuses it exactly as before.
--
-- SECURITY DEFINER on purpose, and it NARROWS access. The policy alone checked
-- only the row's own columns, so a branch manager could file a revision or a
-- payment against ANOTHER branch's order by writing their own branch into
-- `outlet_id` (probed: admitted). Under SECURITY INVOKER the lookup could not
-- see that order and left the claim in place. Read with the definer's rights,
-- the row always carries its order's real tenant and branch, and the
-- unchanged policy refuses it. The function only copies two columns from the
-- parent; it never decides access, and it returns no data to the caller.

CREATE OR REPLACE FUNCTION public.order_child_inherit_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  parent_tenant uuid;
  parent_outlet uuid;
BEGIN
  SELECT o.tenant_id, o.outlet_id
    INTO parent_tenant, parent_outlet
    FROM public.orders o
   WHERE o.id = NEW.order_id;

  IF FOUND THEN
    NEW.tenant_id := parent_tenant;
    -- An unattributed order (no branch) leaves whatever the writer sent.
    IF parent_outlet IS NOT NULL THEN
      NEW.outlet_id := parent_outlet;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_revisions_inherit_branch ON public.order_revisions;
CREATE TRIGGER order_revisions_inherit_branch
  BEFORE INSERT ON public.order_revisions
  FOR EACH ROW EXECUTE FUNCTION public.order_child_inherit_branch();

DROP TRIGGER IF EXISTS order_payments_inherit_branch ON public.order_payments;
CREATE TRIGGER order_payments_inherit_branch
  BEFORE INSERT ON public.order_payments
  FOR EACH ROW EXECUTE FUNCTION public.order_child_inherit_branch();

-- A trigger function: never callable as an RPC.
REVOKE ALL ON FUNCTION public.order_child_inherit_branch() FROM PUBLIC, anon, authenticated;

-- Rollback:
--   DROP TRIGGER IF EXISTS order_revisions_inherit_branch ON public.order_revisions;
--   DROP TRIGGER IF EXISTS order_payments_inherit_branch ON public.order_payments;
--   DROP FUNCTION IF EXISTS public.order_child_inherit_branch();
