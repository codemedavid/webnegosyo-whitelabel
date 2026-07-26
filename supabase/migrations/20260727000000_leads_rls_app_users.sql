-- Align the sales-lead RLS policies with the rest of the schema so the
-- platform superadmin can reach them with their own JWT (mobile app), not only
-- through a service-role server action (web).
--
-- Verified live state before writing this migration:
--
--   leads                 RLS on, 1 policy using auth.users.raw_user_meta_data
--   lead_notes            RLS on, 0 policies  -> denies everyone
--   lead_status_history   RLS on, 0 policies  -> denies everyone
--   checkout_leads        RLS on, already app_users-based  (untouched here)
--   platform_payment_methods  RLS on, already app_users-based (untouched here)
--
-- Two distinct problems:
--
-- 1. `leads` gates on auth.users.raw_user_meta_data->>'role'. That metadata is
--    NULL for every user in this project, including the superadmin, so the
--    policy grants access to nobody. The web console works only because its
--    server actions use the service-role client, which bypasses RLS.
--
-- 2. `lead_notes` and `lead_status_history` have RLS enabled with no policy at
--    all, which denies every non-service-role caller outright.
--
-- Both are fixed by the same app_users-based check already used by
-- checkout_leads, platform_payment_methods and the core tenant tables
-- (0001_initial.sql). The web path is unaffected: service role still bypasses
-- RLS regardless of policy shape.

-- 1. leads — replace the metadata check with the app_users check.
DROP POLICY IF EXISTS "superadmin_all" ON leads;
DROP POLICY IF EXISTS "superadmin_all_leads" ON leads;

CREATE POLICY "leads_superadmin" ON leads
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid() AND au.role = 'superadmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid() AND au.role = 'superadmin'
    )
  );

-- 2. lead_status_history — currently unreachable (RLS on, no policy).
DROP POLICY IF EXISTS "superadmin_all" ON lead_status_history;
DROP POLICY IF EXISTS "superadmin_all_lead_status_history" ON lead_status_history;

CREATE POLICY "lead_status_history_superadmin" ON lead_status_history
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid() AND au.role = 'superadmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid() AND au.role = 'superadmin'
    )
  );

-- 3. lead_notes — currently unreachable (RLS on, no policy).
DROP POLICY IF EXISTS "superadmin_all" ON lead_notes;
DROP POLICY IF EXISTS "superadmin_all_lead_notes" ON lead_notes;

CREATE POLICY "lead_notes_superadmin" ON lead_notes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid() AND au.role = 'superadmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE au.user_id = auth.uid() AND au.role = 'superadmin'
    )
  );
