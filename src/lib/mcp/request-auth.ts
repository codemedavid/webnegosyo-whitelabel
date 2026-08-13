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
 */
export function withSmartMenuAuth(
  handler: McpRouteHandler,
  verifyToken: TokenVerifier,
  options: SmartMenuAuthOptions,
): McpRouteHandler {
  const requiredScope = options.requiredScope ?? 'superadmin'

  return async (req, ctx) => {
    const bearerToken = extractBearerToken(req.headers.get('authorization')) ?? undefined
    if (!bearerToken && options.required === false) {
      return handler(req, ctx)
    }

    const authInfo = await verifyToken(req, bearerToken)
    const resourceMetadata = `${getOrigin(req)}${options.resourceMetadataPath}`

    if (!authInfo) {
      return oauthErrorResponse(401, 'invalid_token', 'Missing or invalid access token', resourceMetadata)
    }
    if (!authInfo.scopes.includes(requiredScope)) {
      return oauthErrorResponse(403, 'insufficient_scope', `Required scope: ${requiredScope}`, resourceMetadata, requiredScope)
    }

    ;(req as Request & { auth?: AuthInfo }).auth = authInfo
    return handler(req, ctx)
  }
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
