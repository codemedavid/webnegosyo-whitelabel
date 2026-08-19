-- Merchant-side MCP: bind credentials to a tenant.
--
-- mcp_api_keys rows historically belong to superadmin only (scopes =
-- ['superadmin'], no tenant association). Merchant credentials carry
-- scopes = ['tenant_admin'] and MUST reference the one tenant they can act on.
-- tenant_id stays NULL for superadmin keys, so existing credentials are
-- untouched.

alter table public.mcp_api_keys
  add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;

comment on column public.mcp_api_keys.tenant_id is
  'Tenant a tenant_admin-scoped key is pinned to. NULL for superadmin keys.';

create index if not exists mcp_api_keys_tenant_id_idx
  on public.mcp_api_keys (tenant_id)
  where tenant_id is not null;

-- A merchant key without a tenant (or a superadmin key with one) is a
-- provisioning bug — reject it at the database boundary.
alter table public.mcp_api_keys
  add constraint mcp_api_keys_tenant_scope_check
  check (
    (scopes @> array['tenant_admin']::text[]) = (tenant_id is not null)
  ) not valid;

alter table public.mcp_api_keys validate constraint mcp_api_keys_tenant_scope_check;
