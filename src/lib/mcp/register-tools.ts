import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import { listOps, executeOp } from '@/lib/mcp/provisioning-ops'
import { buildBearerChallenge, OAUTH_PATHS } from '@/lib/mcp/oauth-config'
import { SUPERADMIN_INTERNAL_SCOPE } from '@/lib/mcp/supabase-oauth-config'

const SMARTMENU_ORIGIN = 'https://www.webnegosyo.com'
const OAUTH_SECURITY_SCHEMES = [{ type: 'oauth2' as const, scopes: [] }]

interface ToolRequestExtra {
    authInfo?: AuthInfo
}

/** Builds an MCP tool result carrying a single text block. */
function textResult(text: string, isError = false): CallToolResult {
    return { content: [{ type: 'text', text }], isError }
}

/** Returns the MCP-standard OAuth challenge used by ChatGPT to start login. */
function authenticationRequired(): CallToolResult {
    return {
        content: [{ type: 'text', text: 'Authentication required.' }],
        isError: true,
        _meta: {
            'mcp/www_authenticate': [
                buildBearerChallenge({
                    origin: SMARTMENU_ORIGIN,
                    resourceMetadataPath: OAUTH_PATHS.protectedResourceMetadata,
                    error: 'invalid_token',
                    description: 'Authentication required',
                    includeAuthorizationUri: false,
                }),
            ],
        },
    }
}

/**
 * Registers every provisioning op as an MCP tool on the given server. Each tool
 * advertises the op's Zod input schema and, on call, dispatches through
 * executeOp against the injected service-role context. Errors are returned as
 * MCP `isError` results (message only, no stack) rather than thrown, so the
 * calling AI receives a clean failure it can act on.
 */
export function registerProvisioningTools(server: McpServer, ctx: ProvisioningCtx): void {
    for (const op of listOps()) {
        server.registerTool(
            op.name,
            {
                description: op.description,
                inputSchema: op.input,
                annotations: op.readOnly
                    ? { readOnlyHint: true, destructiveHint: false }
                    : undefined,
                _meta: { securitySchemes: OAUTH_SECURITY_SCHEMES },
            },
            async (args: unknown, extra: ToolRequestExtra): Promise<CallToolResult> => {
                if (!extra.authInfo?.scopes.includes(SUPERADMIN_INTERNAL_SCOPE)) {
                    return authenticationRequired()
                }

                try {
                    const result = await executeOp(op.name, ctx, args)
                    return textResult(JSON.stringify(result ?? null))
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unexpected error'
                    return textResult(message, true)
                }
            },
        )
    }
}
