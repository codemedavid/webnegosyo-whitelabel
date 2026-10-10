-- checkout_leads is written ONLY through the service role (checkout-leads-service,
-- onboarding/*). A live policy `checkout_leads_public_insert` (WITH CHECK true)
-- plus anon column INSERT grants let anyone with the public key POST a row with
-- status='paid', paid_at, live_at, tenant_id: forged leads that inflate the Sales
-- Pipeline / Onboarding Funnel and pass issueLeadSetupLink's "paid" check.
-- Idempotent. NOT applied: probe as anon afterwards (insert must be refused).
drop policy if exists checkout_leads_public_insert on public.checkout_leads;
revoke insert, update, delete on public.checkout_leads from anon, authenticated;
