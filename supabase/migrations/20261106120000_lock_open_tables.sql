-- Closes tables the anon key could write, and removes grants nothing uses.
--
-- pairing_rule_targets and pairing_rule_target_items carried an `ALL ... true`
-- policy for every role, so the public anon key could insert, change or delete
-- rows for any store (probed 2026-11-06). Every writer is the service role
-- (src/lib/pairing-rules-service.ts). The public read policies stay: storefronts
-- read these rules.

drop policy if exists pairing_rule_targets_admin_all on public.pairing_rule_targets;
drop policy if exists pairing_rule_target_items_admin_all on public.pairing_rule_target_items;

revoke insert, update, delete, truncate, references, trigger
  on public.pairing_rule_targets, public.pairing_rule_target_items
  from anon, authenticated;

-- RLS on and no policy already refuses these for client roles. Removing the
-- leftover grants means a policy added later can't quietly open them.
revoke all on public.app_signup_requests from anon, authenticated;
revoke all on public.mcp_oauth_codes from anon, authenticated;
revoke all on public.order_push_notifications from anon, authenticated;
revoke all on public.loyalty_reservations from anon, authenticated;

-- One-off copy from the 2026-08-21 Loyverse duplicate clean-up: one store's
-- menu rows, no foreign keys, views or code references. Exported before the drop.
drop table if exists public.menu_items_loyverse_dupe_backup_20260821;
