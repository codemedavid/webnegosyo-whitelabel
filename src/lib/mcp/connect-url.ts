const MCP_TRANSPORT_PATH = '/api/mcp/mcp'

interface McpConnectUrlEnv {
  NEXT_PUBLIC_APP_URL?: string
  NEXT_PUBLIC_SITE_URL?: string
  PLATFORM_ROOT_DOMAIN?: string
}

/**
 * Returns the public SmartMenu MCP endpoint shown to connector operators.
 *
 * The production apex redirects to `www`, but MCP clients may not follow a
 * redirect for authenticated POST requests. Always hand clients the terminal
 * transport URL so discovery and JSON-RPC use the same origin.
 */
export function resolveMcpConnectUrl(env: McpConnectUrlEnv): string {
  const configuredBase =
    env.NEXT_PUBLIC_APP_URL ??
    env.NEXT_PUBLIC_SITE_URL ??
    (env.PLATFORM_ROOT_DOMAIN ? `https://${env.PLATFORM_ROOT_DOMAIN}` : '')

  if (!configuredBase) return MCP_TRANSPORT_PATH

  const url = new URL(configuredBase)
  if (url.hostname === 'webnegosyo.com') {
    url.hostname = 'www.webnegosyo.com'
  }
  url.pathname = MCP_TRANSPORT_PATH
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}
