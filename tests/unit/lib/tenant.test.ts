import { describe, test, expect } from '@jest/globals'
import {
  normalizeDomain,
  extractSubdomain,
  clearDomainCache,
  getRootDomain,
  isPlatformHost,
} from '@/lib/tenant'

describe('tenant resolution', () => {
  describe('normalizeDomain', () => {
    test('removes http:// protocol', () => {
      expect(normalizeDomain('http://example.com')).toBe('example.com')
    })

    test('removes https:// protocol', () => {
      expect(normalizeDomain('https://example.com')).toBe('example.com')
    })

    test('removes www prefix', () => {
      expect(normalizeDomain('www.example.com')).toBe('example.com')
    })

    test('removes trailing slashes', () => {
      expect(normalizeDomain('example.com/')).toBe('example.com')
      expect(normalizeDomain('example.com///')).toBe('example.com')
    })

    test('converts to lowercase', () => {
      expect(normalizeDomain('Example.COM')).toBe('example.com')
    })

    test('handles null input', () => {
      expect(normalizeDomain(null)).toBeNull()
    })

    test('handles undefined input', () => {
      expect(normalizeDomain(undefined)).toBeNull()
    })

    test('handles empty string', () => {
      expect(normalizeDomain('')).toBeNull()
    })

    test('handles whitespace', () => {
      expect(normalizeDomain('  example.com  ')).toBe('example.com')
    })

    test('handles complex URLs', () => {
      // normalizeDomain strips protocol, www prefix, and trailing slashes, but retains path segments
      expect(normalizeDomain('https://WWW.Example.COM/path/with/slashes/')).toBe('example.com/path/with/slashes')
    })

    test('returns null for invalid domain (no dots)', () => {
      expect(normalizeDomain('-example')).toBeNull()
      expect(normalizeDomain('localhost')).toBeNull()
    })
  })

  describe('extractSubdomain', () => {
    beforeEach(() => {
      // Mock getRootDomain to return a test domain
      jest.doMock('@/lib/tenant', () => {
        const originalModule = jest.requireActual('@/lib/tenant') as Record<string, unknown>
        return {
          ...originalModule,
          getRootDomain: () => 'example.com',
        }
      })
    })

    test('extracts subdomain from production domain', () => {
      expect(extractSubdomain('tenant.example.com', 'example.com')).toBe('tenant')
    })

    test('extracts from multi-level subdomain', () => {
      expect(extractSubdomain('a.b.tenant.example.com', 'example.com')).toBe('tenant')
    })

    test('extracts from localhost', () => {
      expect(extractSubdomain('tenant.localhost', null)).toBe('tenant')
    })

    test('returns null for reserved subdomain - www', () => {
      expect(extractSubdomain('www.example.com', 'example.com')).toBeNull()
    })

    test('returns null for reserved subdomain - admin', () => {
      expect(extractSubdomain('admin.example.com', 'example.com')).toBeNull()
    })

    test('returns null for reserved subdomain - superadmin', () => {
      expect(extractSubdomain('superadmin.example.com', 'example.com')).toBeNull()
    })

    test('returns null for reserved subdomain - app', () => {
      expect(extractSubdomain('app.example.com', 'example.com')).toBeNull()
    })

    test('returns null for root domain without subdomain', () => {
      expect(extractSubdomain('example.com', 'example.com')).toBeNull()
    })

    test('returns null when no root domain configured', () => {
      expect(extractSubdomain('tenant.something.else', null)).toBeNull()
    })

    test('still extracts a production tenant slug when the env root is missing', () => {
      expect(extractSubdomain('gungjeon-unlimited.webnegosyo.com', null)).toBe('gungjeon-unlimited')
      expect(extractSubdomain('www.webnegosyo.com', null)).toBeNull()
    })

    test('handles port numbers correctly', () => {
      // extractSubdomain does not strip ports — port stripping happens in getHost()
      // When passed raw host with port, the suffix match fails
      expect(extractSubdomain('tenant.example.com:3000', 'example.com')).toBeNull()
    })

    test('handles empty host', () => {
      expect(extractSubdomain('', 'example.com')).toBeNull()
    })
  })

  describe('isPlatformHost', () => {
    test('treats the production platform hosts as platform even without an env root', () => {
      expect(isPlatformHost('gungjeon-unlimited.webnegosyo.com', null)).toBe(true)
      expect(isPlatformHost('www.webnegosyo.com', null)).toBe(true)
      expect(isPlatformHost('webnegosyo.com', null)).toBe(true)
      expect(isPlatformHost('ligna.cafe', null)).toBe(false)
    })
  })

  describe('cache functions', () => {
    test('clearDomainCache can be called', () => {
      expect(() => clearDomainCache('example.com')).not.toThrow()
    })


    test('clearDomainCache handles null input', () => {
      expect(() => clearDomainCache(null)).not.toThrow()
    })

  })

  describe('getRootDomain', () => {
    test('returns configured root domain from env', () => {
      process.env.PLATFORM_ROOT_DOMAIN = 'example.com'
      const root = getRootDomain()
      expect(root).toBe('example.com')
      delete process.env.PLATFORM_ROOT_DOMAIN
    })

    test('returns null when not configured', () => {
      delete process.env.PLATFORM_ROOT_DOMAIN
      const root = getRootDomain()
      expect(root).toBeNull()
    })
  })

})
