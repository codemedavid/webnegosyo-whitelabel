import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import {
  normalizeDomain,
  extractSubdomain,
  clearDomainCache,
  clearTenantExistenceCache,
  getRootDomain,
  validateTenantExists,
} from '@/lib/tenant'

// Use the global mockFrom from jest.setup.js
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFrom = (global as any).mockFrom

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
        const originalModule = jest.requireActual('@/lib/tenant')
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

    test('handles port numbers correctly', () => {
      // extractSubdomain does not strip ports — port stripping happens in getHost()
      // When passed raw host with port, the suffix match fails
      expect(extractSubdomain('tenant.example.com:3000', 'example.com')).toBeNull()
    })

    test('handles empty host', () => {
      expect(extractSubdomain('', 'example.com')).toBeNull()
    })
  })

  describe('cache functions', () => {
    test('clearDomainCache can be called', () => {
      expect(() => clearDomainCache('example.com')).not.toThrow()
    })

    test('clearTenantExistenceCache can be called', () => {
      expect(() => clearTenantExistenceCache('tenant-slug')).not.toThrow()
    })

    test('clearDomainCache handles null input', () => {
      expect(() => clearDomainCache(null)).not.toThrow()
    })

    test('clearTenantExistenceCache handles null input', () => {
      expect(() => clearTenantExistenceCache(null)).not.toThrow()
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

  describe('validateTenantExists', () => {
    beforeEach(() => {
      // Clear tenant existence cache to prevent cross-test cache hits
      clearTenantExistenceCache('test-tenant')
      clearTenantExistenceCache('nonexistent')
    })

    test('returns true for active tenant', async () => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'tenant-1', slug: 'test-tenant', is_active: true },
          error: null,
        }),
      }
      mockFrom.mockReturnValue(chain)

      const result = await validateTenantExists('test-tenant')
      expect(result).toBe(true)
    })

    test('returns false for inactive tenant', async () => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'tenant-1', slug: 'inactive-tenant', is_active: false },
          error: null,
        }),
      }
      mockFrom.mockReturnValue(chain)

      // Use a unique slug to avoid cache from previous test
      clearTenantExistenceCache('inactive-tenant')
      const result = await validateTenantExists('inactive-tenant')
      expect(result).toBe(false)
    })

    test('returns false when tenant not found', async () => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      }
      mockFrom.mockReturnValue(chain)

      const result = await validateTenantExists('nonexistent')
      expect(result).toBe(false)
    })

    test('handles database errors gracefully', async () => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      }
      mockFrom.mockReturnValue(chain)

      clearTenantExistenceCache('error-tenant')
      const result = await validateTenantExists('error-tenant')
      expect(result).toBe(false)
    })
  })
})
