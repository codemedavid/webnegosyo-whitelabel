type McpRouteHandler = (req: Request, ctx: unknown) => Promise<Response>

const JSON_MEDIA_TYPE = 'application/json'
const SSE_MEDIA_TYPE = 'text/event-stream'

/**
 * Adds transport headers required by the current MCP Streamable HTTP SDK when
 * a client omits them. ChatGPT has sent JSON-only Accept headers and JSON-RPC
 * POST bodies without an application/json Content-Type; the SDK otherwise
 * rejects those requests with 406 and 415 respectively.
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
  const contentType = req.headers.get('content-type') ?? ''
  const needsJsonContentType = req.method === 'POST' && !contentType.includes(JSON_MEDIA_TYPE)
  if (normalizedAccept === accept && !needsJsonContentType) return req

  const headers = new Headers(req.headers)
  headers.set('accept', normalizedAccept)
  if (needsJsonContentType) headers.set('content-type', JSON_MEDIA_TYPE)
  return new Request(req, { headers })
}

/** Normalizes transport negotiation before delegating to auth and the SDK. */
export function withMcpAcceptCompatibility(handler: McpRouteHandler): McpRouteHandler {
  return (req, ctx) => handler(normalizeMcpRequestHeaders(req), ctx)
}
