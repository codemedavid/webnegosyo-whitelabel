-- Make the tenant write policies actually check the tenant.
--
-- Five `*_write_admin` policies were written as:
--
--   au.role = 'admin' AND au.tenant_id = au.tenant_id
--
-- The right-hand side is the same column as the left, so the comparison is
-- always true and the policy collapses to "is the caller any admin at all".
-- Any merchant admin could insert, update or delete another tenant's
-- categories, customer form fields, menu items, order types and payment
-- methods — the merchant admin surfaces all write through the SSR client as
-- `authenticated`, so RLS was the only thing standing between two tenants.
--
-- Each policy is redefined to compare the admin's tenant to the tenant of the
-- row being decided about. Everything else is preserved exactly: still
-- PERMISSIVE, still FOR ALL, still granted to the same roles, and superadmins
-- still write across tenants because the platform console depends on it.
--
-- WITH CHECK is given explicitly rather than left to default to USING, so an
-- INSERT is judged on the row being written and the intent is readable.
--
-- Safe to apply ahead of any deploy: this only narrows what the database will
-- accept, and no application path relies on writing another tenant's rows.

-- categories
DROP POLICY IF EXISTS categories_write_admin ON public.categories;
CREATE POLICY categories_write_admin ON public.categories
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND (au.role = 'superadmin'
             OR (au.role = 'admin' AND au.tenant_id = categories.tenant_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND (au.role = 'superadmin'
             OR (au.role = 'admin' AND au.tenant_id = categories.tenant_id))
    )
  );

-- customer_form_fields
DROP POLICY IF EXISTS customer_form_fields_write_admin ON public.customer_form_fields;
CREATE POLICY customer_form_fields_write_admin ON public.customer_form_fields
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND (au.role = 'superadmin'
             OR (au.role = 'admin' AND au.tenant_id = customer_form_fields.tenant_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND (au.role = 'superadmin'
             OR (au.role = 'admin' AND au.tenant_id = customer_form_fields.tenant_id))
    )
  );

-- menu_items
DROP POLICY IF EXISTS menu_items_write_admin ON public.menu_items;
CREATE POLICY menu_items_write_admin ON public.menu_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND (au.role = 'superadmin'
             OR (au.role = 'admin' AND au.tenant_id = menu_items.tenant_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND (au.role = 'superadmin'
             OR (au.role = 'admin' AND au.tenant_id = menu_items.tenant_id))
    )
  );

-- order_types
DROP POLICY IF EXISTS order_types_write_admin ON public.order_types;
CREATE POLICY order_types_write_admin ON public.order_types
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND (au.role = 'superadmin'
             OR (au.role = 'admin' AND au.tenant_id = order_types.tenant_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND (au.role = 'superadmin'
             OR (au.role = 'admin' AND au.tenant_id = order_types.tenant_id))
    )
  );

-- payment_methods
DROP POLICY IF EXISTS payment_methods_write_admin ON public.payment_methods;
CREATE POLICY payment_methods_write_admin ON public.payment_methods
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND (au.role = 'superadmin'
             OR (au.role = 'admin' AND au.tenant_id = payment_methods.tenant_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND (au.role = 'superadmin'
             OR (au.role = 'admin' AND au.tenant_id = payment_methods.tenant_id))
    )
  );
