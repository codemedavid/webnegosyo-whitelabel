import { createMcpHandler } from 'mcp-handler'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import { registerProvisioningTools } from '@/lib/mcp/register-tools'
import { createSuperadminTokenVerifier } from '@/lib/mcp/superadmin-auth'
import { SUPERADMIN_INTERNAL_SCOPE } from '@/lib/mcp/supabase-oauth-config'
import { withCorsHeaders, corsPreflightResponse } from '@/lib/mcp/cors'
import { withSmartMenuAuth } from '@/lib/mcp/request-auth'
import { withSmartMenuToolSecurity } from '@/lib/mcp/tool-discovery'
import { withMcpAcceptCompatibility } from '@/lib/mcp/request-compatibility'

// SmartMenu MCP — remote Streamable-HTTP MCP server for superadmin tenant/menu/
// branding provisioning. One URL serves both Claude remote connectors and
// ChatGPT custom connectors.
//
// Every MCP request is authenticated by Supabase before it reaches the handler.
// Tool discovery advertises standards-based OAuth without a named public scope;
// tools still check the internal superadmin authorization scope before dispatch.

export const runtime = 'nodejs'
export const maxDuration = 60

// Service-role client is stable across requests; per-request authorization is
// enforced by withMcpAuth, not by this client.
const adminClient = createAdminClient()
const ctx: ProvisioningCtx = { client: adminClient }
const TOOL_SECURITY_SCHEMES = [{ type: 'oauth2' as const, scopes: [] }]

const handler = createMcpHandler(
    (server) => {
        registerProvisioningTools(server, ctx)
    },
    { serverInfo: { name: 'smartmenu-mcp', version: '0.1.0' } },
    { basePath: '/api/mcp', maxDuration: 60, disableSse: true },
)

// Supabase OAuth credentials are required uniformly for initialize, ping,
// tools/list, tools/call, and transport probes. The 401 challenge points clients
// to protected-resource metadata, which identifies Supabase as the issuer.
const authHandler = withSmartMenuAuth(handler as unknown as McpRouteHandler, createSuperadminTokenVerifier(adminClient), {
    resourceMetadataPath: '/.well-known/oauth-protected-resource',
    requiredScope: SUPERADMIN_INTERNAL_SCOPE,
    required: true,
    challengeScope: false,
    includeAuthorizationUri: false,
})
const compatibleAuthHandler = withMcpAcceptCompatibility(authHandler as unknown as McpRouteHandler)

// Browser-hosted MCP clients preflight before their first JSON-RPC message, and
// Next's implicit OPTIONS response carries no Access-Control-* headers — so the
// transport must answer preflight and echo CORS on every response itself. The
// 401's WWW-Authenticate header is exposed so the client can follow the
// resource_metadata discovery hint.
type McpRouteHandler = (req: Request, ctx: unknown) => Promise<Response>

const corsHandler: McpRouteHandler = async (req, ctx) => {
    // Clone before mcp-handler consumes the request body. Only tools/list needs
    // the SDK compatibility adapter; normal tool responses remain streamed.
    const isToolDiscovery = await isToolsListRequest(req)
    const response = await compatibleAuthHandler(req, ctx)
    const securedResponse = isToolDiscovery
        ? await withSmartMenuToolSecurity(response, TOOL_SECURITY_SCHEMES)
        : response
    return withCorsHeaders(securedResponse)
}

async function isToolsListRequest(req: Request): Promise<boolean> {
    if (req.method !== 'POST') return false
    try {
        const payload = await req.clone().json() as { method?: unknown }
        return payload.method === 'tools/list'
    } catch {
        return false
    }
}

export function OPTIONS(): Response {
    return corsPreflightResponse()
}

export { corsHandler as GET, corsHandler as POST, corsHandler as DELETE }
