import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { extractBearerToken } from '@/lib/mcp-auth'
import { getOrigin } from '@/lib/mcp/oauth-config'

type McpRouteHandler = (req: Request, ctx: unknown) => Promise<Response>
type TokenVerifier = (req: Request, bearerToken?: string) => Promise<AuthInfo | undefined>

interface SmartMenuAuthOptions {
  resourceMetadataPath: string
  requiredScope?: string
  required?: boolean
}

/**
 * Bearer-auth boundary for the MCP transport.
 *
 * This intentionally uses the shared RFC-style parser instead of mcp-handler's
 * literal `header.split(' ')`, which rejects otherwise valid headers containing
 * tabs or repeated whitespace.
 *
 * When `required` is false, the MCP handshake (`initialize`, `tools/list`,
 * `ping`, notifications) stays anonymous so clients can discover tools. Every
 * other request — including `tools/call` and GET probes — returns HTTP 401 with
 * `WWW-Authenticate`. Claude and ChatGPT only start OAuth from a transport-level
 * 401; a 200 tool error with `_meta.mcp/www_authenticate` is treated as chat
 * text and never shows a Connect / login link.
 */
export function withSmartMenuAuth(
  handler: McpRouteHandler,
  verifyToken: TokenVerifier,
  options: SmartMenuAuthOptions,
): McpRouteHandler {
  const requiredScope = options.requiredScope ?? 'superadmin'

  return async (req, ctx) => {
    const bearerToken = extractBearerToken(req.headers.get('authorization')) ?? undefined
    const resourceMetadata = `${getOrigin(req)}${options.resourceMetadataPath}`

    if (!bearerToken && options.required === false) {
      if (await isPublicMcpHandshake(req)) {
        return handler(req, ctx)
      }
      return oauthErrorResponse(
        401,
        'invalid_token',
        'Missing or invalid access token',
        resourceMetadata,
        requiredScope,
      )
    }

    const authInfo = await verifyToken(req, bearerToken)

    if (!authInfo) {
      return oauthErrorResponse(
        401,
        'invalid_token',
        'Missing or invalid access token',
        resourceMetadata,
        requiredScope,
      )
    }
    if (!authInfo.scopes.includes(requiredScope)) {
      return oauthErrorResponse(403, 'insufficient_scope', `Required scope: ${requiredScope}`, resourceMetadata, requiredScope)
    }

    ;(req as Request & { auth?: AuthInfo }).auth = authInfo
    return handler(req, ctx)
  }
}

const PUBLIC_MCP_METHODS = new Set([
  'initialize',
  'notifications/initialized',
  'notifications/cancelled',
  'ping',
  'tools/list',
])

/**
 * Handshake methods that OAuth MCP clients send before they have a token.
 * Anything else, including `tools/call`, is protected.
 */
async function isPublicMcpHandshake(req: Request): Promise<boolean> {
  if (req.method !== 'POST') return false
  try {
    const payload = await req.clone().json() as unknown
    const messages = Array.isArray(payload) ? payload : [payload]
    return messages.length > 0 && messages.every(isPublicMcpMessage)
  } catch {
    return false
  }
}

function isPublicMcpMessage(message: unknown): boolean {
  if (typeof message !== 'object' || message === null) return false
  const method = (message as { method?: unknown }).method
  return typeof method === 'string' && PUBLIC_MCP_METHODS.has(method)
}

function oauthErrorResponse(
  status: 401 | 403,
  error: 'invalid_token' | 'insufficient_scope',
  description: string,
  resourceMetadata: string,
  scope?: string,
): Response {
  const challenge = [
    `Bearer error="${error}"`,
    `error_description="${description}"`,
    `resource_metadata="${resourceMetadata}"`,
    ...(scope ? [`scope="${scope}"`] : []),
  ].join(', ')

  return Response.json(
    { error, error_description: description },
    { status, headers: { 'WWW-Authenticate': challenge, 'Cache-Control': 'no-store' } },
  )
}
