-- Advisor remediation from the 2026-08-29 platform-DB audit.
-- APPLIED to the live project on 2026-08-29; this file mirrors it for the repo.
--
-- SECURITY DEFINER functions were callable by the API roles through the default
-- EXECUTE grant to PUBLIC (notify_order_push, for one, would let an anonymous
-- caller enqueue push notifications). Revoke PUBLIC and grant back only what
-- each function actually needs:
--   * trigger functions need no API-role EXECUTE at all — Postgres checks
--     EXECUTE when the trigger is CREATED, not when it fires (verified live:
--     an anon order insert still fires orders_notify_push after the revoke)
--   * initialize_order_types_for_tenant is called via rpc() by signed-in
--     tenant admins and by the service role
--   * order_accepts_anon_items is evaluated inside the order_items RLS policy,
--     so the anon inserting role keeps EXECUTE (intentional advisor WARN)
revoke execute on function public.notify_order_push() from public, anon, authenticated;
revoke execute on function public.sync_order_amount_paid() from public, anon, authenticated;
revoke execute on function public.outlet_menu_item_tenant_matches() from public, anon, authenticated;

revoke execute on function public.initialize_order_types_for_tenant(uuid) from public, anon;
grant execute on function public.initialize_order_types_for_tenant(uuid) to authenticated, service_role;

revoke execute on function public.order_accepts_anon_items(uuid) from public, authenticated;
grant execute on function public.order_accepts_anon_items(uuid) to anon;

-- Pin a fixed search_path on every function the linter flagged as mutable, so
-- a crafted schema earlier on the path can never shadow the tables they touch.
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.create_default_order_types_for_tenant() set search_path = public, pg_temp;
alter function public.initialize_order_types_for_tenant(uuid) set search_path = public, pg_temp;
alter function public.enforce_staff_limit() set search_path = public, pg_temp;
alter function public.apply_stock_movement() set search_path = public, pg_temp;
alter function public.enforce_app_user_outlet_tenant() set search_path = public, pg_temp;
alter function public.app_user_may_reach_branch(uuid, uuid) set search_path = public, pg_temp;
alter function public.stock_transfer_branches_belong_to_tenant() set search_path = public, pg_temp;
alter function public.stock_movement_count_session_is_valid() set search_path = public, pg_temp;
alter function public.inventory_count_branch_belongs_to_tenant() set search_path = public, pg_temp;
alter function public.staff_shift_branch_belongs_to_tenant() set search_path = public, pg_temp;
