-- Facebook tokens can act as the merchant's page. Tenant membership alone
-- must not grant staff access to them through PostgREST or permit connection
-- changes. Match the Messenger settings API's role + tenant + settings gate.
-- The anon column-limited public page lookup remains unchanged.
DROP POLICY IF EXISTS facebook_pages_write_admin ON public.facebook_pages;
CREATE POLICY facebook_pages_write_admin ON public.facebook_pages
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND (
          au.role = 'superadmin'
          OR (
            au.role = 'admin'
            AND au.tenant_id = facebook_pages.tenant_id
            AND (
              au.is_owner IS TRUE
              OR au.permissions IS NULL
              OR 'settings' = ANY(au.permissions)
            )
          )
        )
    )
  );
-- FOR ALL also uses USING as WITH CHECK, so inserts and tenant-changing
-- updates must satisfy this same gate for the resulting row.
