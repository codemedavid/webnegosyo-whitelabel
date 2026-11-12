-- ===========================================================================
-- Owl assistant: who may use it, and the new kinds of proposal it may file
-- (docs/plans/2026-11-12-owl-more-tools-and-access.md).
--
--   * New staff permission key `assistant` ("Use the Owl assistant"), OPT-IN
--     (owner's call, 2026-11-12): legacy full access (`permissions IS NULL`)
--     does NOT hold it; owners and superadmins always do. No backfill: the
--     owner ticks it by name (live 2026-11-12: 1 non-owner account had used
--     Owl in 60 days). The Owl routes enforce it in app code
--     (resolveAssistantAccess); the SQL twin is kept equal so every copy of
--     the rule agrees (staff-permissions-parity / permission-of-parity tests).
--     Both function bodies = the live bodies of 2026-11-12 (20261027120100 /
--     20261027160000) with 'assistant' added to the opt-in array, nothing else.
--     Inert in SQL today: no policy asks for 'assistant'.
--   * assistant_actions kinds: payment methods (create / change), a new
--     ingredient. Additive only — every existing kind stays valid.
--
-- Safe to apply before the deploy: nothing reads the new array entry, and the
-- new kinds are only written by code that ships with them.
-- Rollback: re-run 20261027120100's function and 20261013150000's constraint.
-- ===========================================================================

set lock_timeout = '3s';

create or replace function public.app_user_has_permission(p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.app_users au
     where au.user_id = auth.uid()
       and (
         au.role = 'superadmin'
         or (
           au.role = 'admin'
           and au.tenant_id = p_tenant_id
           and (
             au.is_owner is true
             or (au.permissions is null and p_permission <> all (array['activity_view', 'approve_requests', 'expenses', 'cash_manage', 'assistant']))
             or p_permission = any (au.permissions)
             -- IMPLIED_BY in src/lib/staff-permissions.ts: strict subsets of a held grant.
             or (p_permission in ('kitchen', 'tables') and 'orders' = any (au.permissions))
             or (p_permission = 'reports' and 'analytics' = any (au.permissions))
           )
         )
       )
  );
$$;

revoke all on function public.app_user_has_permission(uuid, text) from public, anon;
grant execute on function public.app_user_has_permission(uuid, text) to authenticated, service_role;

create or replace function public.app_user_has_permission_of(p_user uuid, p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.app_users au
     where au.user_id = p_user
       and (
         au.role = 'superadmin'
         or (
           au.role = 'admin'
           and au.tenant_id = p_tenant_id
           and (
             au.is_owner is true
             or (au.permissions is null and p_permission <> all (array['activity_view', 'approve_requests', 'expenses', 'cash_manage', 'assistant']))
             or p_permission = any (au.permissions)
             -- IMPLIED_BY in src/lib/staff-permissions.ts: strict subsets of a held grant.
             or (p_permission in ('kitchen', 'tables') and 'orders' = any (au.permissions))
             or (p_permission = 'reports' and 'analytics' = any (au.permissions))
           )
         )
       )
  );
$$;

revoke all on function public.app_user_has_permission_of(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.app_user_has_permission_of(uuid, uuid, text) to service_role;

ALTER TABLE public.assistant_actions DROP CONSTRAINT IF EXISTS assistant_actions_kind_check;

ALTER TABLE public.assistant_actions ADD CONSTRAINT assistant_actions_kind_check CHECK (kind IN (
  'bundle', 'upsell', 'menu_item', 'stock_adjustment', 'sms_campaign', 'voucher',
  'offer_change', 'last_call', 'loyalty_program', 'loyalty_status',
  'campaign_status', 'voucher_status', 'menu_item_change', 'menu_import',
  'sms_automation', 'sms_automation_status', 'sms_automation_run',
  'payment_method', 'payment_method_change', 'ingredient'
));
