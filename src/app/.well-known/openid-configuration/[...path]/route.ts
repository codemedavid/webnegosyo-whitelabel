// Path-suffixed OpenID Connect discovery, e.g.
// `/.well-known/openid-configuration/api/mcp/mcp`.
export { GET, OPTIONS } from '../../oauth-authorization-server/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
