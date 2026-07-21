import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { ProvisioningCtx } from '@/lib/provisioning/context'
import { listOps, executeOp } from '@/lib/mcp/provisioning-ops'

/** Builds an MCP tool result carrying a single text block. */
function textResult(text: string, isError = false): CallToolResult {
    return { content: [{ type: 'text', text }], isError }
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
            { description: op.description, inputSchema: op.input },
            async (args: unknown): Promise<CallToolResult> => {
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
