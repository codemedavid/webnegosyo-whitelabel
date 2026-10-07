-- ===========================================================================
-- NOT YET APPLIED — DO NOT APPLY YET.
-- Apply only after a merchant-app build that uses
-- webnegosyo-app/lib/customers/attach-lookup.ts (the pos_find_customer /
-- pos_create_customer RPC path) has shipped to ALL stores. Older builds read
-- public.customers directly from the POS picker and Wallet-card scan, so a
-- register-only cashier on such a build would lose guest search/attach the
-- moment these policies land.
--
-- Formerly 20261004120000_customers_staff_permission.sql (a version that
-- collided with 20261004120000_loyalty_sms_gateway.sql). The two register
-- RPCs this file used to define were split out and applied on their own as
-- 20261004170000_pos_customer_attach_rpcs.sql.
-- ===========================================================================
--
-- Customer PII is readable only with the `customers` staff grant.
--
-- Every policy below used to ask one question:
--   au.role = 'admin' and au.tenant_id = <row>.tenant_id
-- A staff account IS role 'admin' (owners differ only by is_owner and a NULL
-- or full permissions array), so a cashier granted only the register could
-- read the whole guest list — names, phones, emails, spend, SMS consent —
-- straight through PostgREST. The merchant app's guest list, campaign editor
-- and POS picker all read these tables directly. PH Data Privacy Act exposure.
--
-- Now every policy goes through public.loyalty_has_permission (despite its
-- name, it is THE tenant staff-permission check: superadmin, owner, legacy
-- NULL-permissions admin, or a staff member holding the key). The web admin
-- already enforces the same key in verifyTenantPermission and the middleware,
-- so owners and staff with `customers` see no change. `customers` has no
-- IMPLIED_BY entry, so no other key needs to be honoured here.
--
-- The register still has to attach a guest to a sale without the grant. It
-- gets two narrow definer functions instead of the table: an EXACT
-- phone/email lookup that returns only what attaching needs, and a
-- quick-create. Both are open to `pos` (or `customers`) staff. They are
-- defined in 20261004170000_pos_customer_attach_rpcs.sql, which must already
-- be applied.
--
-- Platform-staff policies (platform_staff_*) are untouched.

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
drop policy if exists customers_select_by_tenant on public.customers;
drop policy if exists customers_write_admin on public.customers;
drop policy if exists customers_select_with_grant on public.customers;
drop policy if exists customers_insert_with_grant on public.customers;
drop policy if exists customers_update_with_grant on public.customers;
drop policy if exists customers_delete_with_grant on public.customers;

create policy customers_select_with_grant on public.customers for select to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers'));
create policy customers_insert_with_grant on public.customers for insert to authenticated
  with check (public.loyalty_has_permission(tenant_id, 'customers'));
create policy customers_update_with_grant on public.customers for update to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers'))
  with check (public.loyalty_has_permission(tenant_id, 'customers'));
create policy customers_delete_with_grant on public.customers for delete to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers'));

-- ---------------------------------------------------------------------------
-- customer_external_orders (per-guest order history for foreign backends;
-- written by the service role, read by owners through the Customer Hub)
-- ---------------------------------------------------------------------------
drop policy if exists customer_external_orders_select_by_tenant on public.customer_external_orders;
drop policy if exists customer_external_orders_write_admin on public.customer_external_orders;
drop policy if exists customer_external_orders_select_with_grant on public.customer_external_orders;
drop policy if exists customer_external_orders_insert_with_grant on public.customer_external_orders;
drop policy if exists customer_external_orders_update_with_grant on public.customer_external_orders;
drop policy if exists customer_external_orders_delete_with_grant on public.customer_external_orders;

create policy customer_external_orders_select_with_grant on public.customer_external_orders for select to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers'));
create policy customer_external_orders_insert_with_grant on public.customer_external_orders for insert to authenticated
  with check (public.loyalty_has_permission(tenant_id, 'customers'));
create policy customer_external_orders_update_with_grant on public.customer_external_orders for update to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers'))
  with check (public.loyalty_has_permission(tenant_id, 'customers'));
create policy customer_external_orders_delete_with_grant on public.customer_external_orders for delete to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers'));

-- ---------------------------------------------------------------------------
-- SMS campaigns (recipient phones; run from the guest list screen)
-- ---------------------------------------------------------------------------
drop policy if exists sms_campaigns_rw on public.sms_campaigns;
drop policy if exists sms_campaigns_select_with_grant on public.sms_campaigns;
drop policy if exists sms_campaigns_insert_with_grant on public.sms_campaigns;
drop policy if exists sms_campaigns_update_with_grant on public.sms_campaigns;
drop policy if exists sms_campaigns_delete_with_grant on public.sms_campaigns;

create policy sms_campaigns_select_with_grant on public.sms_campaigns for select to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers'));
create policy sms_campaigns_insert_with_grant on public.sms_campaigns for insert to authenticated
  with check (public.loyalty_has_permission(tenant_id, 'customers'));
create policy sms_campaigns_update_with_grant on public.sms_campaigns for update to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers'))
  with check (public.loyalty_has_permission(tenant_id, 'customers'));
create policy sms_campaigns_delete_with_grant on public.sms_campaigns for delete to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers'));

drop policy if exists sms_campaign_runs_rw on public.sms_campaign_runs;
drop policy if exists sms_campaign_runs_select_with_grant on public.sms_campaign_runs;
drop policy if exists sms_campaign_runs_insert_with_grant on public.sms_campaign_runs;
drop policy if exists sms_campaign_runs_update_with_grant on public.sms_campaign_runs;
drop policy if exists sms_campaign_runs_delete_with_grant on public.sms_campaign_runs;

create policy sms_campaign_runs_select_with_grant on public.sms_campaign_runs for select to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers'));
create policy sms_campaign_runs_insert_with_grant on public.sms_campaign_runs for insert to authenticated
  with check (public.loyalty_has_permission(tenant_id, 'customers'));
create policy sms_campaign_runs_update_with_grant on public.sms_campaign_runs for update to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers'))
  with check (public.loyalty_has_permission(tenant_id, 'customers'));
create policy sms_campaign_runs_delete_with_grant on public.sms_campaign_runs for delete to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers'));

drop policy if exists sms_sends_rw on public.sms_sends;
drop policy if exists sms_sends_select_with_grant on public.sms_sends;
drop policy if exists sms_sends_insert_with_grant on public.sms_sends;
drop policy if exists sms_sends_update_with_grant on public.sms_sends;
drop policy if exists sms_sends_delete_with_grant on public.sms_sends;

create policy sms_sends_select_with_grant on public.sms_sends for select to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers'));
create policy sms_sends_insert_with_grant on public.sms_sends for insert to authenticated
  with check (public.loyalty_has_permission(tenant_id, 'customers'));
create policy sms_sends_update_with_grant on public.sms_sends for update to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers'))
  with check (public.loyalty_has_permission(tenant_id, 'customers'));
create policy sms_sends_delete_with_grant on public.sms_sends for delete to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers'));

drop policy if exists sms_suppressions_rw on public.sms_suppressions;
drop policy if exists sms_suppressions_select_with_grant on public.sms_suppressions;
drop policy if exists sms_suppressions_insert_with_grant on public.sms_suppressions;
drop policy if exists sms_suppressions_update_with_grant on public.sms_suppressions;
drop policy if exists sms_suppressions_delete_with_grant on public.sms_suppressions;

create policy sms_suppressions_select_with_grant on public.sms_suppressions for select to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers'));
create policy sms_suppressions_insert_with_grant on public.sms_suppressions for insert to authenticated
  with check (public.loyalty_has_permission(tenant_id, 'customers'));
create policy sms_suppressions_update_with_grant on public.sms_suppressions for update to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers'))
  with check (public.loyalty_has_permission(tenant_id, 'customers'));
create policy sms_suppressions_delete_with_grant on public.sms_suppressions for delete to authenticated
  using (public.loyalty_has_permission(tenant_id, 'customers'));

