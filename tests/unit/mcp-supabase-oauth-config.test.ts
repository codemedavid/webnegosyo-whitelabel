/**
 * @jest-environment node
 */
import { afterEach, describe, expect, it } from '@jest/globals'
import {
  SUPERADMIN_MCP_PATH,
  getSupabaseOAuthIssuer,
  getSuperadminMcpResource,
  isSuperadminMcpAudience,
} from '@/lib/mcp/supabase-oauth-config'
import { buildProtectedResourceMetadata } from '@/lib/mcp/oauth-metadata'

const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

afterEach(() => {
  if (originalSupabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl
})

describe('Supabase superadmin MCP OAuth configuration', () => {
  it('builds the Supabase Auth issuer from the public project URL', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co/'

    expect(getSupabaseOAuthIssuer()).toBe('https://project.supabase.co/auth/v1')
  })

  it('removes all trailing slashes from the public project URL', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co///'

    expect(getSupabaseOAuthIssuer()).toBe('https://project.supabase.co/auth/v1')
  })

  it('builds the fixed superadmin MCP resource from an origin', () => {
    expect(getSuperadminMcpResource('https://www.webnegosyo.com')).toBe(
      'https://www.webnegosyo.com/api/mcp/mcp',
    )
    expect(SUPERADMIN_MCP_PATH).toBe('/api/mcp/mcp')
  })

  it('advertises Supabase as the sole authorization server without named scopes', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co/'

    expect(buildProtectedResourceMetadata('https://www.webnegosyo.com')).toEqual({
      resource: 'https://www.webnegosyo.com/api/mcp/mcp',
      authorization_servers: ['https://project.supabase.co/auth/v1'],
      bearer_methods_supported: ['header'],
    })
  })

  it('accepts only the exact MCP resource as a string or array audience', () => {
    const resource = 'https://www.webnegosyo.com/api/mcp/mcp'

    expect(isSuperadminMcpAudience(resource, resource)).toBe(true)
    expect(isSuperadminMcpAudience(['authenticated', resource], resource)).toBe(true)
    expect(isSuperadminMcpAudience('authenticated', resource)).toBe(false)
  })

  it('throws a clear error when the Supabase URL is missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL

    expect(() => getSupabaseOAuthIssuer()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })
})
