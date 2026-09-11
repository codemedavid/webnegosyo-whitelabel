-- Step 2 of 2 for tenant_secrets (see 20260904120000_tenant_secrets.sql).
--
-- APPLY ONLY AFTER the web app that reads/writes `tenant_secrets` is deployed.
-- Until then these columns are still what checkout, Lalamove and Loyverse use;
-- dropping them early takes every store's integrations down.
--
-- Fills anything the old columns still hold that `tenant_secrets` is missing,
-- then drops them. After this the anon key can no longer select a secret from
-- `tenants` (42703 undefined_column), which is the probe for this fix.

insert into public.tenant_secrets (
  tenant_id, lalamove_api_key, lalamove_secret_key, messenger_page_access_token,
  convex_deploy_key, loyverse_access_token
)
-- nullif: an empty string in the old column is "unset", not a value.
select id, nullif(lalamove_api_key, ''), nullif(lalamove_secret_key, ''),
       nullif(messenger_page_access_token, ''), nullif(convex_deploy_key, ''),
       nullif(loyverse_access_token, '')
from public.tenants
on conflict (tenant_id) do update set
  -- GAP-FILL ONLY: the stored secret wins wherever it holds a value.
  --
  -- The old rule was "the legacy column wins", on the reasoning that the
  -- `tenants` row was always the later edit. That stopped being true once the
  -- cut-over web app shipped: it writes `tenant_secrets` and then bumps the
  -- `tenants` row without touching the legacy columns, so a store re-pointed
  -- at a new Convex deployment keeps a STALE key in `tenants` and the correct
  -- one here. Verified 2026-09-11 on `foodify`, whose legacy deploy key names
  -- a different deployment than its own `convex_deployment_url`; letting the
  -- legacy column win would have broken its deploys.
  --
  -- The two rows where the legacy column genuinely was the newer value
  -- (cribings-kitchen-by-pasabytes, cafejuancho) were reconciled into this
  -- table on 2026-09-11, so gap-fill is now correct for every store.
  lalamove_api_key            = coalesce(tenant_secrets.lalamove_api_key, excluded.lalamove_api_key),
  lalamove_secret_key         = coalesce(tenant_secrets.lalamove_secret_key, excluded.lalamove_secret_key),
  messenger_page_access_token = coalesce(tenant_secrets.messenger_page_access_token, excluded.messenger_page_access_token),
  convex_deploy_key           = coalesce(tenant_secrets.convex_deploy_key, excluded.convex_deploy_key),
  loyverse_access_token       = coalesce(tenant_secrets.loyverse_access_token, excluded.loyverse_access_token);

alter table public.tenants
  drop column if exists lalamove_api_key,
  drop column if exists lalamove_secret_key,
  drop column if exists messenger_page_access_token,
  drop column if exists convex_deploy_key,
  drop column if exists loyverse_access_token;
