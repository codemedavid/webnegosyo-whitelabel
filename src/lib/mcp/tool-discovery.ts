import { OAUTH_SCOPE } from '@/lib/mcp/oauth-config'

const OAUTH_SECURITY_SCHEMES = [{ type: 'oauth2', scopes: [OAUTH_SCOPE] }] as const

/**
 * Adds the top-level tool auth metadata required by OpenAI clients.
 *
 * The MCP TypeScript SDK currently preserves `_meta.securitySchemes` but omits
 * the equivalent top-level field from `tools/list`. This adapter runs only for
 * that discovery response and keeps both representations in sync.
 */
export async function withSmartMenuToolSecurity(response: Response): Promise<Response> {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const payload = await response.json() as unknown
    addSecuritySchemes(payload)
    return copyResponse(response, JSON.stringify(payload))
  }
  if (!contentType.includes('text/event-stream')) return response

  const body = await response.text()
  const securedBody = body
    .split('\n')
    .map((line) => secureSseDataLine(line))
    .join('\n')

  return copyResponse(response, securedBody)
}

function secureSseDataLine(line: string): string {
  if (!line.startsWith('data: ')) return line

  try {
    const payload = JSON.parse(line.slice('data: '.length)) as unknown
    addSecuritySchemes(payload)
    return `data: ${JSON.stringify(payload)}`
  } catch {
    return line
  }
}

function addSecuritySchemes(payload: unknown): void {
  if (!isRecord(payload) || !isRecord(payload.result) || !Array.isArray(payload.result.tools)) return

  for (const tool of payload.result.tools) {
    if (isRecord(tool)) tool.securitySchemes = OAUTH_SECURITY_SCHEMES
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function copyResponse(response: Response, body: string): Response {
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
