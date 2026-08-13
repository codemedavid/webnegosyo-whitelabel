type McpRouteHandler = (req: Request, ctx: unknown) => Promise<Response>

const JSON_MEDIA_TYPE = 'application/json'
const SSE_MEDIA_TYPE = 'text/event-stream'

/**
 * Adds response types required by the current MCP Streamable HTTP SDK when a
 * client omits them. ChatGPT has sent JSON-only POST Accept headers, which the
 * SDK rejects with 406 even though the connector can consume MCP streams.
 */
export function normalizeMcpRequestHeaders(req: Request): Request {
  if (req.method !== 'POST' && req.method !== 'GET') return req

  const accept = req.headers.get('accept') ?? ''
  const mediaTypes = accept
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  if (req.method === 'POST' && !mediaTypes.some((value) => value.includes(JSON_MEDIA_TYPE))) {
    mediaTypes.push(JSON_MEDIA_TYPE)
  }
  if (!mediaTypes.some((value) => value.includes(SSE_MEDIA_TYPE))) {
    mediaTypes.push(SSE_MEDIA_TYPE)
  }

  const normalizedAccept = mediaTypes.join(', ')
  if (normalizedAccept === accept) return req

  const headers = new Headers(req.headers)
  headers.set('accept', normalizedAccept)
  return new Request(req, { headers })
}

/** Normalizes transport negotiation before delegating to auth and the SDK. */
export function withMcpAcceptCompatibility(handler: McpRouteHandler): McpRouteHandler {
  return (req, ctx) => handler(normalizeMcpRequestHeaders(req), ctx)
}
