const MCP_TRANSPORT_PATH = '/api/mcp/mcp'
const MERCHANT_MCP_TRANSPORT_PATH = '/api/mcp/merchant/mcp'
const SMARTMENU_PRODUCTION_ORIGIN = 'https://www.webnegosyo.com'

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
  return resolveTransportUrl(env, MCP_TRANSPORT_PATH)
}

/** The public MERCHANT (tenant admin) MCP endpoint shown on the admin page. */
export function resolveMerchantMcpConnectUrl(env: McpConnectUrlEnv): string {
  return resolveTransportUrl(env, MERCHANT_MCP_TRANSPORT_PATH)
}

/** Exact trusted site origin for browser-to-server superadmin MCP requests. */
export function resolveSmartMenuSiteOrigin(env: McpConnectUrlEnv): string {
  const connectUrl = resolveMcpConnectUrl(env)
  return connectUrl.startsWith('/')
    ? SMARTMENU_PRODUCTION_ORIGIN
    : new URL(connectUrl).origin
}

function resolveTransportUrl(env: McpConnectUrlEnv, transportPath: string): string {
  const configuredBase =
    env.NEXT_PUBLIC_APP_URL ??
    env.NEXT_PUBLIC_SITE_URL ??
    (env.PLATFORM_ROOT_DOMAIN ? `https://${env.PLATFORM_ROOT_DOMAIN}` : '')

  if (!configuredBase) return transportPath

  const url = new URL(configuredBase)
  if (url.hostname === 'webnegosyo.com') {
    url.hostname = 'www.webnegosyo.com'
  }
  url.pathname = transportPath
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}
