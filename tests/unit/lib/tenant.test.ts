import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import {
  normalizeDomain,
  extractSubdomain,
  clearDomainCache,
  clearTenantExistenceCache,
  getRootDomain,
  validateTenantExists,
} from '@/lib/tenant'
import { createServerClient } from '@supabase/ssr'

// Mock Supabase SSR
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

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
      expect(normalizeDomain('https://WWW.Example.COM/path/with/slashes/')).toBe('example.com')
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
      expect(extractSubdomain('tenant.example.com:3000', 'example.com')).toBe('tenant')
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
    test('returns true for active tenant', async () => {
      const mockSelect = jest.fn().mockReturnThis()
      const mockEq = jest.fn().mockReturnThis()
      const mockMaybeSingle = jest.fn().mockResolvedValue({
        data: { id: 'tenant-1', slug: 'test-tenant', is_active: true },
        error: null,
      })
      ;(createServerClient as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: mockSelect,
          eq: mockEq,
          maybeSingle: mockMaybeSingle,
        }),
      })

      const result = await validateTenantExists('test-tenant')
      expect(result).toBe(true)
    })

    test('returns false for inactive tenant', async () => {
      const mockSelect = jest.fn().mockReturnThis()
      const mockEq = jest.fn().mockReturnThis()
      const mockMaybeSingle = jest.fn().mockResolvedValue({
        data: { id: 'tenant-1', slug: 'test-tenant', is_active: false },
        error: null,
      })
      ;(createServerClient as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: mockSelect,
          eq: mockEq,
          maybeSingle: mockMaybeSingle,
        }),
      })

      const result = await validateTenantExists('test-tenant')
      expect(result).toBe(false)
    })

    test('returns false when tenant not found', async () => {
      const mockSelect = jest.fn().mockReturnThis()
      const mockEq = jest.fn().mockReturnThis()
      const mockMaybeSingle = jest.fn().mockResolvedValue({
        data: null,
        error: null,
      })
      ;(createServerClient as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: mockSelect,
          eq: mockEq,
          maybeSingle: mockMaybeSingle,
        }),
      })

      const result = await validateTenantExists('nonexistent')
      expect(result).toBe(false)
    })

    test('handles database errors gracefully', async () => {
      const mockSelect = jest.fn().mockReturnThis()
      const mockEq = jest.fn().mockReturnThis()
      const mockMaybeSingle = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      })
      ;(createServerClient as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: mockSelect,
          eq: mockEq,
          maybeSingle: mockMaybeSingle,
        }),
      })

      const result = await validateTenantExists('test-tenant')
      expect(result).toBe(false)
    })
  })
})
