import { describe, expect, it } from '@jest/globals'
import { buildAuthorizationServerMetadata } from '@/lib/mcp/oauth-metadata'
import { isSupportedMerchantScope } from '@/app/api/mcp/oauth/authorize/route'
import { resolveMerchantTokenAudience } from '@/app/api/mcp/oauth/token/route'

describe('remaining SmartMenu OAuth issuer', () => {
  it('advertises merchant authority only', () => {
    expect(buildAuthorizationServerMetadata('https://www.webnegosyo.com').scopes_supported)
      .toEqual(['tenant_admin', 'offline_access'])
  })

  it('rejects the retired superadmin scope', () => {
    expect(isSupportedMerchantScope('superadmin')).toBe(false)
    expect(isSupportedMerchantScope('tenant_admin offline_access')).toBe(true)
  })

  it('defaults a resource-less token exchange to the merchant resource', () => {
    expect(resolveMerchantTokenAudience('https://www.webnegosyo.com', undefined)).toBe(
      'https://www.webnegosyo.com/api/mcp/merchant/mcp',
    )
    expect(resolveMerchantTokenAudience(
      'https://www.webnegosyo.com',
      'https://www.webnegosyo.com/api/mcp/mcp',
    )).toBeNull()
  })
})
