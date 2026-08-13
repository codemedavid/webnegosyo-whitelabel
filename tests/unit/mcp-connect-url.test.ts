import { resolveMcpConnectUrl } from '@/lib/mcp/connect-url'

describe('resolveMcpConnectUrl', () => {
  it('returns the canonical non-redirecting SmartMenu MCP endpoint for the apex production URL', () => {
    expect(
      resolveMcpConnectUrl({
        NEXT_PUBLIC_APP_URL: 'https://webnegosyo.com',
      }),
    ).toBe('https://www.webnegosyo.com/api/mcp/mcp')
  })
})
