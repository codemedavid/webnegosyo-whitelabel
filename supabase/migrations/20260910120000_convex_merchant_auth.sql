-- Merchant identity for the per-tenant Convex deployments.
--
-- Every store's Convex functions used to admit any caller who knew the
-- deployment URL — and the URL ships inside the customer app. The template
-- (v28) now gates merchant reads/writes on the platform Supabase JWT. Two
-- things have to exist on this side for that to work:
--
--  1. The JWT must say which store the caller belongs to. The access-token
--     hook already registered for the project stamps `wn_role` and
--     `wn_tenant_id` from `app_users` onto every token. Convex verifies the
--     token against this project's JWKS (ES256) and reads those claims.
--
--  2. A per-store rollout switch. The merchant app must ship the token before
--     a store is enforced, or its registers go dark; `convex_auth_enforced`
--     is flipped per tenant once the app is in the field, and the config sync
--     carries it (with `convex_public_reads`, for the no-login demo store)
--     into the deployment's `tenantConfig`.

alter table public.tenants
  add column if not exists convex_auth_enforced boolean not null default false,
  add column if not exists convex_public_reads boolean not null default false;

comment on column public.tenants.convex_auth_enforced is
  'When true the store''s Convex deployment refuses merchant calls that carry no valid platform JWT. Flip only after the merchant app build that sends the token is in the field.';
comment on column public.tenants.convex_public_reads is
  'Demo store only: the Convex deployment answers reads without a token (App Review walks the app with no login). Writes always need a token.';

-- The hook runs as supabase_auth_admin, which has no grant on app_users.
grant select (user_id, role, tenant_id) on public.app_users to supabase_auth_admin;

create or replace function public.superadmin_mcp_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb;
  membership record;
begin
  claims := event->'claims';

  -- Kept from 20260831140000: pin the audience of MCP-issued tokens.
  if claims->>'client_id' is not null then
    claims := jsonb_set(claims, '{aud}', to_jsonb('https://www.webnegosyo.com/api/mcp/mcp'::text));
  end if;

  -- Store membership, read from app_users so a token can only ever name the
  -- store its account belongs to. A user with no app_users row (a customer
  -- account, if one ever exists) gets no claims and is refused by Convex.
  select role, tenant_id into membership
  from public.app_users
  where user_id = (event->>'user_id')::uuid;

  if found then
    claims := claims
      || jsonb_build_object('wn_role', membership.role)
      || jsonb_build_object('wn_tenant_id', membership.tenant_id);
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.superadmin_mcp_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.superadmin_mcp_access_token_hook(jsonb) from authenticated, anon, public;
