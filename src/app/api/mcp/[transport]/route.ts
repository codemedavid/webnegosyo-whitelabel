import { createMcpHandler } from 'mcp-handler'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import { registerProvisioningTools } from '@/lib/mcp/register-tools'
import { createMcpTokenVerifier } from '@/lib/mcp/auth-adapter'
import { withCorsHeaders, corsPreflightResponse } from '@/lib/mcp/cors'
import { withSmartMenuAuth } from '@/lib/mcp/request-auth'

// SmartMenu MCP — remote Streamable-HTTP MCP server for superadmin tenant/menu/
// branding provisioning. One Bearer-keyed URL serves both Claude remote
// connectors and ChatGPT custom connectors.
//
// Auth: withMcpAuth extracts the Bearer key and verifies it (verifyMcpKey,
// service-role hash lookup) before any tool runs; an invalid/absent/revoked key
// returns 401. Because the key already proves superadmin authority, the tools
// operate through a service-role client (bypasses RLS) via ProvisioningCtx.

export const runtime = 'nodejs'
export const maxDuration = 60

// Service-role client is stable across requests; per-request authorization is
// enforced by withMcpAuth, not by this client.
const adminClient = createAdminClient()
const ctx: ProvisioningCtx = { client: adminClient }

const handler = createMcpHandler(
    (server) => {
        registerProvisioningTools(server, ctx)
    },
    { serverInfo: { name: 'smartmenu-mcp', version: '0.1.0' } },
    { basePath: '/api/mcp', maxDuration: 60, disableSse: true },
)

// `resourceMetadataPath` makes 401 responses carry a WWW-Authenticate header
// pointing at the protected-resource metadata, so an OAuth-capable client
// (Claude/ChatGPT) can discover the authorization server and log in — no
// copy-pasted key. Legacy `smk_live_` keys still work (verifier accepts both).
const authHandler = withSmartMenuAuth(handler as unknown as McpRouteHandler, createMcpTokenVerifier(adminClient), {
    resourceMetadataPath: '/.well-known/oauth-protected-resource',
    requiredScope: 'superadmin',
})

// Browser-hosted MCP clients preflight before their first JSON-RPC message, and
// Next's implicit OPTIONS response carries no Access-Control-* headers — so the
// transport must answer preflight and echo CORS on every response itself. The
// 401's WWW-Authenticate header is exposed so the client can follow the
// resource_metadata discovery hint.
type McpRouteHandler = (req: Request, ctx: unknown) => Promise<Response>

const corsHandler: McpRouteHandler = async (req, ctx) =>
    withCorsHeaders(await (authHandler as unknown as McpRouteHandler)(req, ctx))

export function OPTIONS(): Response {
    return corsPreflightResponse()
}

export { corsHandler as GET, corsHandler as POST, corsHandler as DELETE }
