// Several MCP clients probe OpenID Connect discovery before, or instead of, the
// OAuth-specific document. This authorization server is not an OIDC provider,
// but serving the RFC 8414 metadata here removes a class of connection failures.
export { GET, OPTIONS } from '../oauth-authorization-server/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
