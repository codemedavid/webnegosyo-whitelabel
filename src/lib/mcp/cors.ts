/**
 * CORS for the MCP transport endpoint.
 *
 * Discovery metadata already sent CORS headers, but the transport route did
 * not, so browser-hosted MCP clients failed preflight before sending their
 * first JSON-RPC message. Streamable HTTP also needs `mcp-session-id` and
 * `WWW-Authenticate` exposed: the former carries the assigned session, the
 * latter carries the `resource_metadata` hint a client follows after a 401.
 */

const ALLOWED_REQUEST_HEADERS = [
  'Content-Type',
  'Authorization',
  'mcp-protocol-version',
  'mcp-session-id',
  'Last-Event-ID',
] as const

const EXPOSED_RESPONSE_HEADERS = ['mcp-session-id', 'WWW-Authenticate'] as const

export const MCP_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': ALLOWED_REQUEST_HEADERS.join(', '),
  'Access-Control-Expose-Headers': EXPOSED_RESPONSE_HEADERS.join(', '),
  'Access-Control-Max-Age': '86400',
}

/**
 * Returns a copy of `response` with the CORS headers added. Status, statusText,
 * and every existing header (notably `WWW-Authenticate` on a 401) are preserved,
 * and the body is passed through unbuffered so streamed responses keep working.
 */
export function withCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(MCP_CORS_HEADERS)) {
    headers.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/** Answers a CORS preflight request. */
export function corsPreflightResponse(): Response {
  return new Response(null, { status: 204, headers: MCP_CORS_HEADERS })
}
