import { OAUTH_PATHS, OAUTH_SCOPE } from '@/lib/mcp/oauth-config'

/**
 * Builders for the OAuth discovery documents. Kept separate from the route
 * handlers because the same document is served from several URLs: RFC 9728 §3.1
 * and RFC 8414 §3.1 require clients to build the metadata URL by inserting the
 * well-known segment BETWEEN the host and the resource path, so
 * `/.well-known/oauth-protected-resource/api/mcp/mcp` must answer identically to
 * `/.well-known/oauth-protected-resource`.
 */

export interface ProtectedResourceMetadata {
  resource: string
  authorization_servers: string[]
  bearer_methods_supported: string[]
  scopes_supported: string[]
}

export interface AuthorizationServerMetadata {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  registration_endpoint: string
  response_types_supported: string[]
  grant_types_supported: string[]
  code_challenge_methods_supported: string[]
  token_endpoint_auth_methods_supported: string[]
  scopes_supported: string[]
}

/** RFC 9728 — tells an MCP client which authorization server guards the endpoint. */
export function buildProtectedResourceMetadata(origin: string): ProtectedResourceMetadata {
  return {
    resource: `${origin}${OAUTH_PATHS.mcp}`,
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
    scopes_supported: [OAUTH_SCOPE],
  }
}

/** RFC 8414 — advertises the endpoints, grants, and PKCE support for self-configuration. */
export function buildAuthorizationServerMetadata(origin: string): AuthorizationServerMetadata {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}${OAUTH_PATHS.authorize}`,
    token_endpoint: `${origin}${OAUTH_PATHS.token}`,
    registration_endpoint: `${origin}${OAUTH_PATHS.register}`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [OAUTH_SCOPE],
  }
}
