-- Anyone holding the public anon key could change or delete the pairing targets
-- of every store: live policies `*_admin_all` were FOR ALL TO public USING (true).
-- They are not in any migration (dashboard drift; 20260328200000 created a
-- different set that is not live).
--
-- Every write goes through src/lib/pairing-rules-service.ts with the service role,
-- which bypasses RLS, so no client path needs a write policy. The storefront read
-- policies (*_public_read) stay.
drop policy if exists pairing_rule_targets_admin_all on public.pairing_rule_targets;
drop policy if exists pairing_rule_target_items_admin_all on public.pairing_rule_target_items;

revoke insert, update, delete on public.pairing_rule_targets from anon, authenticated;
revoke insert, update, delete on public.pairing_rule_target_items from anon, authenticated;
