import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import { registerProvisioningTools } from '@/lib/mcp/register-tools'
import { createMcpTokenVerifier } from '@/lib/mcp/auth-adapter'

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

const authHandler = withMcpAuth(handler, createMcpTokenVerifier(adminClient), { required: true })

export { authHandler as GET, authHandler as POST, authHandler as DELETE }
