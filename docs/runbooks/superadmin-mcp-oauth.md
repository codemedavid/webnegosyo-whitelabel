# Superadmin MCP OAuth Operations

## Supabase dashboard

1. Authentication > OAuth Server: enable OAuth 2.1 server.
2. Enable Dynamic Client Registration.
3. Set Authorization Path to `/superadmin/mcp/authorize`.
4. Authentication > Signing Keys: use an asymmetric signing key (RS256 or ES256).
5. Authentication > Hooks: enable the Postgres Custom Access Token hook
   `public.superadmin_mcp_access_token_hook`.
6. Authentication > URL Configuration: production Site URL is
   `https://www.webnegosyo.com`.

## Public contract probes

- Supabase authorization metadata returns 200.
- SmartMenu protected-resource metadata names the exact resource and Supabase issuer.
- An unauthenticated MCP initialize request returns 401 with `resource_metadata`.
- The challenge contains neither a local `authorization_uri` nor a custom scope.
- A normal SmartMenu browser JWT is rejected by MCP.
- Removing `app_users.role = superadmin` causes the next MCP request to return 403.

Probe commands:

```bash
curl -i https://www.webnegosyo.com/.well-known/oauth-protected-resource
curl -i https://www.webnegosyo.com/.well-known/oauth-protected-resource/api/mcp/mcp
curl -i https://www.webnegosyo.com/api/mcp/mcp \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}}'
```

Expected: both metadata responses are `200` and name the Supabase issuer;
initialize is `401`; `WWW-Authenticate` contains `resource_metadata` only, with
no token and no client-specific authorization URL.

## Client smoke test

For ChatGPT, Claude, and Grok: remove the old connection, add
`https://www.webnegosyo.com/api/mcp/mcp`, complete browser login and consent,
list tools, and call one read-only tool (`list_tenants`). Record date, client,
result, and request ID. No client-specific headers or server URL variants are allowed.

## Role revocation check

Using a test superadmin connection:

1. Change the test account role away from `superadmin`.
2. Repeat `list_tenants` without reconnecting.
3. Confirm HTTP `403` and no tool execution.
4. Restore the test account role.

Expected: the already-issued token no longer grants MCP access.

## Verification log

| Date | Client | Result | Request ID | Notes |
|------|--------|--------|------------|-------|
