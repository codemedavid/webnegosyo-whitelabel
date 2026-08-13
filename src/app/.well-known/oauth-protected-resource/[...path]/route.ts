// RFC 9728 §3.1: clients build the metadata URL by inserting the well-known
// segment between host and resource path, e.g.
// `/.well-known/oauth-protected-resource/api/mcp/mcp`. Serve the same document
// there as at the root URL — the path segments carry no extra meaning because
// this deployment exposes exactly one protected resource.
export { GET, OPTIONS } from '../route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
