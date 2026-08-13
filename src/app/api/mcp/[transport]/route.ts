import { createMcpHandler } from 'mcp-handler'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import { registerProvisioningTools } from '@/lib/mcp/register-tools'
import { createMcpTokenVerifier } from '@/lib/mcp/auth-adapter'
import { withCorsHeaders, corsPreflightResponse } from '@/lib/mcp/cors'
import { withSmartMenuAuth } from '@/lib/mcp/request-auth'

// SmartMenu MCP — remote Streamable-HTTP MCP server for superadmin tenant/menu/
// branding provisioning. One URL serves both Claude remote connectors and
// ChatGPT custom connectors.
//
// The MCP handshake and tool discovery remain available anonymously, as OAuth
// MCP clients require them immediately after redirect. Every registered tool
// advertises OAuth and checks the verified superadmin scope before dispatching.

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

// A supplied credential is still verified at the transport boundary and added
// to the MCP request context. Missing credentials are allowed through only so
// initialize/tools/list can run; tool callbacks return the MCP OAuth challenge.
const authHandler = withSmartMenuAuth(handler as unknown as McpRouteHandler, createMcpTokenVerifier(adminClient), {
    resourceMetadataPath: '/.well-known/oauth-protected-resource',
    requiredScope: 'superadmin',
    required: false,
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
