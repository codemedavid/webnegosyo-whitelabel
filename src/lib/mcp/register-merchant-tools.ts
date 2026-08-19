import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import { listMerchantOps, executeMerchantOp } from '@/lib/mcp/merchant-ops'
import { MERCHANT_OAUTH_PATHS, MERCHANT_OAUTH_SCOPE } from '@/lib/mcp/merchant-config'

const SMARTMENU_ORIGIN = 'https://www.webnegosyo.com'
const OAUTH_SECURITY_SCHEMES = [{ type: 'oauth2' as const, scopes: [MERCHANT_OAUTH_SCOPE] }]

interface ToolRequestExtra {
    authInfo?: AuthInfo
}

/** Builds an MCP tool result carrying a single text block. */
function textResult(text: string, isError = false): CallToolResult {
    return { content: [{ type: 'text', text }], isError }
}

/** Returns the MCP-standard OAuth challenge pointing at the MERCHANT resource. */
function authenticationRequired(): CallToolResult {
    const resourceMetadata = `${SMARTMENU_ORIGIN}${MERCHANT_OAUTH_PATHS.protectedResourceMetadata}`
    return {
        content: [{ type: 'text', text: 'Authentication required.' }],
        isError: true,
        _meta: {
            'mcp/www_authenticate': [
                `Bearer resource_metadata="${resourceMetadata}", scope="${MERCHANT_OAUTH_SCOPE}", error="invalid_token", error_description="Authentication required"`,
            ],
        },
    }
}

/**
 * Resolves the tenant a verified credential is pinned to. Only `tenant_admin`
 * credentials with a concrete tenant binding may dispatch — a merchant-scoped
 * key without a tenant is a provisioning bug and fails closed, and superadmin
 * credentials are deliberately rejected here (they have their own surface).
 */
function resolveBoundTenantId(authInfo: AuthInfo | undefined): string | null {
    if (!authInfo?.scopes.includes(MERCHANT_OAUTH_SCOPE)) return null
    const tenantId = (authInfo.extra as { tenantId?: unknown } | undefined)?.tenantId
    return typeof tenantId === 'string' && tenantId.length > 0 ? tenantId : null
}

/**
 * Registers every merchant op as an MCP tool. Each tool advertises the
 * tenant-stripped Zod input schema and, on call, dispatches through
 * executeMerchantOp with the credential-bound tenant injected server-side.
 * Errors are returned as MCP `isError` results (message only, no stack).
 */
export function registerMerchantTools(server: McpServer, ctx: ProvisioningCtx): void {
    for (const op of listMerchantOps()) {
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
                const tenantId = resolveBoundTenantId(extra.authInfo)
                if (!tenantId) {
                    return authenticationRequired()
                }

                try {
                    const result = await executeMerchantOp(op.name, ctx, tenantId, args)
                    return textResult(JSON.stringify(result ?? null))
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unexpected error'
                    return textResult(message, true)
                }
            },
        )
    }
}
