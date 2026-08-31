import { OAUTH_CORS_HEADERS } from '@/lib/mcp/oauth-config'
import { GET as getRootMetadata, OPTIONS } from '../../oauth-authorization-server/route'

const MERCHANT_SUFFIXES = new Set([
  '/api/mcp/merchant',
  '/api/mcp/merchant/mcp',
])

export function GET(req: Request): Response {
  const prefix = '/.well-known/openid-configuration'
  const pathname = new URL(req.url).pathname
  const suffix = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : ''
  if (!MERCHANT_SUFFIXES.has(suffix)) {
    return new Response(null, { status: 404, headers: OAUTH_CORS_HEADERS })
  }
  return getRootMetadata(req)
}

export { OPTIONS }

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
