-- Restores the grants and policies. This reopens anon writes on the pairing
-- tables, so use it only to recover from a break, and fix forward after that.
-- The dropped backup table is not recreated here: its rows are in
-- ~/Documents/whitelabel-archive/db-backups-2026-11-06/.

grant insert, update, delete, truncate, references, trigger
  on public.pairing_rule_targets, public.pairing_rule_target_items
  to anon, authenticated;

create policy pairing_rule_targets_admin_all on public.pairing_rule_targets for all using (true);
create policy pairing_rule_target_items_admin_all on public.pairing_rule_target_items for all using (true);

grant all on public.app_signup_requests to anon, authenticated;
grant all on public.mcp_oauth_codes to anon, authenticated;
grant all on public.order_push_notifications to anon, authenticated;
grant all on public.loyalty_reservations to anon, authenticated;
