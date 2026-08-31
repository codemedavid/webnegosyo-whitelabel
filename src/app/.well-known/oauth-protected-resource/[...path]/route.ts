// RFC 9728 §3.1: clients build the metadata URL by inserting the well-known
// segment between host and resource path, e.g.
// `/.well-known/oauth-protected-resource/api/mcp/mcp`. This deployment now
// exposes TWO protected resources on one origin, so the path suffix selects
// which document is served: `/api/mcp/merchant/...` gets the merchant
// (tenant_admin) document, anything else gets the superadmin document.
import { getOrigin, OAUTH_CORS_HEADERS } from '@/lib/mcp/oauth-config'
import {
  buildProtectedResourceMetadata,
  buildMerchantProtectedResourceMetadata,
} from '@/lib/mcp/oauth-metadata'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const WELL_KNOWN_PREFIX = '/.well-known/oauth-protected-resource'

function isMerchantResourcePath(url: string): boolean {
  try {
    const pathname = new URL(url).pathname
    // Match both RFC 9728 suffixes and ChatGPT's MCP-path probes. After a
    // rewrite, `req.url` may still be the original `/api/mcp/merchant/mcp/...`
    // path instead of the destination well-known URL.
    return (
      pathname.includes('/api/mcp/merchant') ||
      pathname.includes(`${WELL_KNOWN_PREFIX}/merchant`) ||
      pathname.includes(`${WELL_KNOWN_PREFIX}/api/mcp/merchant`)
    )
  } catch {
    return false
  }
}

export function GET(req: Request): Response {
  const origin = getOrigin(req)
  const metadata = isMerchantResourcePath(req.url)
    ? buildMerchantProtectedResourceMetadata(origin)
    : buildProtectedResourceMetadata(origin)
  return Response.json(metadata, { headers: OAUTH_CORS_HEADERS })
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS })
}
