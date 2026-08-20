-- Merchant-side MCP: per-tenant feature flag.
--
-- Gates the tenant admin "Connect AI" page (key minting/revocation UI).
-- Superadmin turns it on per tenant, same pattern as the other feature flags
-- (menu_engineering_enabled, bundles_enabled, ...). Default OFF so no merchant
-- sees the surface until it is deliberately enabled for them.

alter table public.tenants
  add column if not exists mcp_enabled boolean not null default false;

comment on column public.tenants.mcp_enabled is
  'Whether the tenant admin "Connect AI" (merchant MCP key management) page is available.';
