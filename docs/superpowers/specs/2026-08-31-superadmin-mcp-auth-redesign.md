# Superadmin MCP Authentication Redesign

**Date:** 2026-08-31
**Status:** Approved design

## Objective

Replace SmartMenu's custom superadmin MCP OAuth implementation with the smallest standards-based login flow that works across ChatGPT, Claude, Grok, and other conforming remote MCP clients.

The operator experience is:

1. Add the SmartMenu MCP URL to an MCP client.
2. Complete the existing SmartMenu superadmin sign-in in a browser.
3. Approve the connection.
4. Return to the MCP client with ongoing access managed through standard OAuth refresh tokens.

## Problem

The current implementation makes SmartMenu responsible for both the MCP resource server and a home-grown OAuth authorization server. Authentication behavior is spread across transport middleware, OAuth routes, database token tables, custom authorization codes, opaque keys, JWT signing, JWKS publication, discovery rewrites, and client-specific compatibility behavior.

Recent fixes repeatedly changed the authentication mechanism to accommodate individual client behavior. This made the flow harder to reason about and left login reliability dependent on several custom components agreeing on issuer, audience, discovery paths, signing algorithms, token formats, and refresh behavior.

## Decision

Use Supabase Auth as the OAuth 2.1 authorization server for the superadmin MCP surface. For superadmin authentication, SmartMenu acts only as a protected resource server. The separate merchant MCP flow remains on its existing implementation and is not redesigned here.

Supabase will own:

- OAuth 2.1 authorization-code flow with PKCE
- dynamic client registration
- authorization codes
- access and refresh token issuance
- token expiry and refresh-token rotation
- JWT signing and JWKS publication
- authorization-server metadata

SmartMenu will own:

- the Streamable HTTP MCP endpoint
- protected-resource metadata for that endpoint
- the existing superadmin sign-in experience
- a minimal authorization/consent page
- access-token verification
- a current `app_users.role = 'superadmin'` authorization check
- MCP tool registration and execution

## Alternatives Considered

### Static API keys

Static keys require the least server code, but they require secret copying and client-specific header configuration. Not every target client offers the same setup experience, and a copied long-lived superadmin credential is a poor default for interactive access.

### Separate identity provider

Auth0, WorkOS, Clerk, or another external provider could supply standards-based OAuth. This would add another identity system, user mapping, operational dependency, and potentially cost while SmartMenu already uses Supabase Auth.

## Architecture

```text
ChatGPT / Claude / Grok / other MCP client
                    |
                    | OAuth 2.1 Authorization Code + PKCE
                    v
              Supabase Auth
                    |
                    | signed Supabase access token
                    v
            SmartMenu MCP endpoint
                    |
                    +-- validate token signature and claims
                    +-- load current app_users role
                    +-- require role = superadmin
                    +-- dispatch MCP tool
```

The authorization server may have a different origin from the MCP resource. SmartMenu's superadmin protected-resource metadata will identify the Supabase authorization-server issuer. Superadmin MCP clients then use the authorization-server metadata exposed by Supabase instead of SmartMenu proxying or reproducing those endpoints. Merchant discovery remains unchanged.

## Request Flow

1. The client sends an unauthenticated request to the SmartMenu MCP endpoint.
2. SmartMenu returns HTTP `401` with a `WWW-Authenticate` Bearer challenge containing the protected-resource metadata URL.
3. The client reads protected-resource metadata and discovers Supabase Auth as the authorization server.
4. The client registers dynamically when needed and starts the authorization-code flow with PKCE.
5. Supabase sends the browser to SmartMenu's configured authorization path.
6. SmartMenu preserves the Supabase `authorization_id`. If there is no browser session, it sends the operator through the existing superadmin login and back to the authorization path.
7. SmartMenu retrieves the authorization request details and checks the signed-in user's current `app_users` row.
8. Only a current superadmin may approve. Approval and denial are submitted through the Supabase OAuth API.
9. Supabase redirects to the client, exchanges the code, and manages access and refresh tokens.
10. SmartMenu verifies the Supabase access token on every MCP request and rechecks the current superadmin role before tool dispatch.

## Authorization Boundary

Authentication proves the Supabase user identity. Authorization remains a SmartMenu decision.

- A valid Supabase token is not sufficient by itself.
- The token subject must resolve to an `app_users` row whose current role is `superadmin`.
- The role is checked at authorization time and again on MCP requests.
- Removing or changing the role blocks subsequent MCP access without relying on custom token revocation.
- The MCP service-role database client remains behind the authorization boundary and is never exposed to the client.

## Scope

### Included

- superadmin MCP authentication
- Supabase OAuth server integration
- one protected-resource discovery path
- one authorization/consent surface
- one token-verification and role-authorization boundary
- removal of superseded superadmin custom OAuth code and tests
- focused contract and authorization tests

### Excluded

- changes to MCP tools or their business behavior
- changes to tenant/merchant MCP authentication
- new login methods or account-management features
- client-specific token formats, discovery rewrites, or authentication branches
- unrelated superadmin dashboard changes

## Error Handling

- Missing, malformed, invalid, or expired token: HTTP `401` with the standard Bearer challenge.
- Authenticated non-superadmin: HTTP `403`.
- Missing `app_users` row: HTTP `403`.
- Supabase discovery or token-verification failure: fail closed; return `401` or a non-sensitive server error as appropriate.
- Database role lookup failure: fail closed; do not dispatch tools.
- Denied or cancelled authorization: use the standard OAuth denial response supplied by Supabase.
- Logs contain a request ID, route, and failure category only. Access tokens, authorization codes, refresh tokens, and login credentials are never logged.

## Migration

The migration uses a replace-then-remove sequence:

1. Enable and configure the Supabase OAuth 2.1 server, dynamic client registration, asymmetric signing keys, and SmartMenu authorization path.
2. Add the SmartMenu consent/role gate and Supabase token verifier.
3. Point protected-resource metadata at Supabase and protect the complete superadmin MCP transport.
4. Prove the new flow with automated tests and live client smoke tests.
5. Remove superadmin branches from the custom authorization, token, registration, JWT/JWKS, opaque OAuth-key, and discovery-rewrite code where those branches have no remaining consumer.
6. Preserve shared OAuth routes, helpers, and tables required by merchant MCP. Refactor shared routes to merchant-only behavior when their superadmin branch is removed.

Existing manually minted superadmin MCP API keys will no longer authenticate the superadmin MCP endpoint. No break-glass authentication path will bypass Supabase OAuth. The shared key table remains because merchant MCP keys are outside this redesign.

## Test Strategy

Tests exercise public boundaries rather than internal helper structure.

### Authentication contract

- Protected-resource metadata names the exact SmartMenu MCP resource and Supabase issuer.
- Unauthenticated MCP requests receive HTTP `401` with the correct `resource_metadata` challenge.
- Invalid and expired Supabase tokens are rejected.
- A valid Supabase token reaches the application authorization boundary.

### Authorization behavior

- A current superadmin can initialize, list tools, and call an authorized tool.
- A user with another role receives `403`.
- A user without an `app_users` row receives `403`.
- Removing the superadmin role blocks the next MCP request.
- A role lookup error fails closed.

### OAuth browser flow

- The authorization page preserves `authorization_id` through login.
- A signed-in superadmin can approve.
- A signed-in non-superadmin cannot approve.
- Denial returns through the Supabase-provided redirect.

### Compatibility smoke tests

Run the same deployed MCP URL through ChatGPT, Claude, and Grok. Each client must complete browser login, reconnect with a Bearer token, list tools, and execute one harmless read-only tool. No client-specific server configuration or code path is permitted.

## Acceptance Criteria

- ChatGPT, Claude, and Grok connect through one standards-based browser login flow.
- The existing Supabase superadmin identity is used; no separate MCP credential is created.
- Supabase, not application code, owns OAuth codes, access tokens, refresh tokens, rotation, signing, and JWKS.
- SmartMenu makes one explicit current-role decision before any superadmin tool execution.
- The MCP endpoint exposes no anonymous tools.
- No token or credential is written to application logs.
- Custom superadmin OAuth machinery is removed after the replacement is verified.
- Merchant MCP behavior and unrelated working-tree changes remain untouched.

## Operational Requirements

- Supabase OAuth 2.1 server is enabled for the production project.
- Dynamic client registration is enabled.
- Supabase uses an asymmetric JWT signing key so clients and SmartMenu can validate tokens through JWKS.
- The production SmartMenu authorization URL is configured in Supabase.
- Redirect URLs and site URL are correct for production and preview environments.
- Auth failures are observable by category without exposing secrets.

## References

- Supabase OAuth 2.1 Server: https://supabase.com/docs/guides/auth/oauth-server
- Supabase MCP Authentication: https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication
- Supabase OAuth 2.1 Getting Started: https://supabase.com/docs/guides/auth/oauth-server/getting-started
- MCP Authorization specification: https://modelcontextprotocol.io/specification/latest/basic/authorization
- Claude remote MCP authentication: https://code.claude.com/docs/en/mcp
- Grok custom MCP connectors: https://docs.x.ai/grok/connectors
