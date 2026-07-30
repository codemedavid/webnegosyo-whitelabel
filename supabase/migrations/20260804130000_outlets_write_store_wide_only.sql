-- Only a store-wide admin may manage branches.
--
-- `outlets_write_admin` (from `20260730120000`) is FOR ALL and matches any
-- `role='admin'` row in the tenant. A branch manager IS `role='admin'` plus an
-- `outlet_id` — that was the deliberate choice in `20260802120000`, because a
-- new role string would have had to be taught to every existing admin check —
-- but nobody went back to this policy. The consequence: the manager of one
-- branch can rename or deactivate every OTHER branch, including ones they do
-- not run.
--
-- The shape of the company is the owner's. A branch account runs a branch.
--
-- Inert on apply: 0 of 157 accounts are branch-scoped, so no account that can
-- write outlets today loses the ability. It only binds once a branch manager
-- exists, which is the moment it is needed.
--
-- SELECT is untouched (`outlets_select_public` is USING (true)) — the branch
-- picker, every order screen, and the storefront all list branches.

DROP POLICY IF EXISTS outlets_write_admin ON public.outlets;
CREATE POLICY outlets_write_admin ON public.outlets
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND (
          au.role = 'superadmin'
          OR (
            au.role = 'admin'
            AND au.tenant_id = outlets.tenant_id
            -- NULL = store-wide, which is what every pre-branch account is.
            AND au.outlet_id IS NULL
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid()
        AND (
          au.role = 'superadmin'
          OR (
            au.role = 'admin'
            AND au.tenant_id = outlets.tenant_id
            AND au.outlet_id IS NULL
          )
        )
    )
  );

COMMENT ON POLICY outlets_write_admin ON public.outlets IS
  'Branch CRUD is store-wide-only. A branch-scoped admin (app_users.outlet_id '
  'IS NOT NULL) runs a branch and may not reshape the others. Mirrors '
  'canManageOutlets in src/lib/outlets/branch-scope.ts.';

-- Rollback: restore the predicate from `20260730120000` by dropping the
-- `au.outlet_id IS NULL` clause from both USING and WITH CHECK. That re-opens
-- branch CRUD to branch managers.
