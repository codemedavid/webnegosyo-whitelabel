import { describe, expect, it } from '@jest/globals'
import { isMcpProtocolRoute } from '@/lib/mcp/route-isolation'

describe('isMcpProtocolRoute', () => {
  it.each([
    '/api/mcp/mcp',
    '/api/mcp/oauth/authorize',
    '/api/mcp/oauth/token',
    '/.well-known/oauth-protected-resource',
    '/.well-known/oauth-authorization-server/api/mcp/mcp',
    '/.well-known/openid-configuration',
  ])('isolates %s from application session middleware', (pathname) => {
    expect(isMcpProtocolRoute(pathname)).toBe(true)
  })

  it.each(['/api/orders/track', '/superadmin/mcp-keys', '/tenant/admin'])(
    'keeps %s in application middleware',
    (pathname) => {
      expect(isMcpProtocolRoute(pathname)).toBe(false)
    },
  )
})
