-- Step 2 of 2 for tenant_secrets (see 20260904120000_tenant_secrets.sql).
--
-- APPLY ONLY AFTER the web app that reads/writes `tenant_secrets` is deployed.
-- Until then these columns are still what checkout, Lalamove and Loyverse use;
-- dropping them early takes every store's integrations down.
--
-- Copies anything written to the old columns since step 1, then drops them.
-- After this the anon key can no longer select a secret from `tenants`
-- (42703 undefined_column), which is the probe for this fix.

insert into public.tenant_secrets (
  tenant_id, lalamove_api_key, lalamove_secret_key, messenger_page_access_token,
  convex_deploy_key, loyverse_access_token
)
-- nullif: an empty string in the old column is "unset", and must not win
-- over a real secret already stored (coalesce alone would let it).
-- Where both hold a value the OLD column wins — verified 2026-09-10 against
-- the two stores that differed: the tenants row was the later edit in both.
select id, nullif(lalamove_api_key, ''), nullif(lalamove_secret_key, ''),
       nullif(messenger_page_access_token, ''), nullif(convex_deploy_key, ''),
       nullif(loyverse_access_token, '')
from public.tenants
on conflict (tenant_id) do update set
  lalamove_api_key            = coalesce(excluded.lalamove_api_key, tenant_secrets.lalamove_api_key),
  lalamove_secret_key         = coalesce(excluded.lalamove_secret_key, tenant_secrets.lalamove_secret_key),
  messenger_page_access_token = coalesce(excluded.messenger_page_access_token, tenant_secrets.messenger_page_access_token),
  convex_deploy_key           = coalesce(excluded.convex_deploy_key, tenant_secrets.convex_deploy_key),
  loyverse_access_token       = coalesce(excluded.loyverse_access_token, tenant_secrets.loyverse_access_token);

alter table public.tenants
  drop column if exists lalamove_api_key,
  drop column if exists lalamove_secret_key,
  drop column if exists messenger_page_access_token,
  drop column if exists convex_deploy_key,
  drop column if exists loyverse_access_token;
