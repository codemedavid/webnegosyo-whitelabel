import { describe, test, expect, beforeEach } from '@jest/globals'
import {
  normalizeDomain,
  extractSubdomain,
  clearDomainCache,
  clearTenantExistenceCache,
  getRootDomain,
} from '@/lib/tenant'

describe('tenant resolution extended', () => {
  describe('normalizeDomain additional cases', () => {
    test('handles domain with only protocol', () => {
      expect(normalizeDomain('http://')).toBeNull()
    })

    test('handles domain with protocol and www only', () => {
      // After stripping protocol and www, nothing is left with a dot
      expect(normalizeDomain('https://www.')).toBeNull()
    })

    test('preserves subdomains', () => {
      expect(normalizeDomain('sub.example.com')).toBe('sub.example.com')
    })

    test('preserves deep subdomains', () => {
      expect(normalizeDomain('a.b.c.example.com')).toBe('a.b.c.example.com')
    })

    test('handles mixed case with protocol', () => {
      expect(normalizeDomain('HTTP://Example.COM')).toBe('example.com')
    })

    test('handles tab/newline whitespace', () => {
      expect(normalizeDomain('\t example.com \n')).toBe('example.com')
    })

    test('handles single dot', () => {
      // "." after cleaning is just "." which contains a dot
      const result = normalizeDomain('.')
      // After stripping trailing slashes and trimming: "." -> has a dot -> returns "."
      expect(result).toBe('.')
    })
  })

  describe('extractSubdomain additional cases', () => {
    test('returns null for exact match of root domain', () => {
      expect(extractSubdomain('example.com', 'example.com')).toBeNull()
    })

    test('extracts deepest subdomain from multi-level', () => {
      // a.b.tenant.example.com -> tenant (the part closest to root domain)
      expect(extractSubdomain('a.b.tenant.example.com', 'example.com')).toBe('tenant')
    })

    test('is case-insensitive', () => {
      expect(extractSubdomain('Tenant.Example.COM', 'example.com')).toBe('tenant')
    })

    test('returns null for localhost without subdomain', () => {
      expect(extractSubdomain('localhost', null)).toBeNull()
    })

    test('returns null for reserved subdomain on localhost', () => {
      expect(extractSubdomain('www.localhost', null)).toBeNull()
      expect(extractSubdomain('superadmin.localhost', null)).toBeNull()
      expect(extractSubdomain('admin.localhost', null)).toBeNull()
      expect(extractSubdomain('app.localhost', null)).toBeNull()
    })

    test('extracts tenant from localhost even without rootDomain', () => {
      expect(extractSubdomain('mytenant.localhost', null)).toBe('mytenant')
    })

    test('returns null for completely unrelated domain', () => {
      expect(extractSubdomain('other-site.io', 'example.com')).toBeNull()
    })

    test('returns null when host equals root domain exactly', () => {
      expect(extractSubdomain('example.com', 'example.com')).toBeNull()
    })
  })

  describe('clearDomainCache', () => {
    test('does not throw for any string input', () => {
      expect(() => clearDomainCache('anything.com')).not.toThrow()
    })

    test('handles empty string', () => {
      // normalizeDomain('') returns null, so clearDomainCache skips
      expect(() => clearDomainCache('')).not.toThrow()
    })
  })

  describe('clearTenantExistenceCache', () => {
    test('does not throw for arbitrary slugs', () => {
      expect(() => clearTenantExistenceCache('any-slug')).not.toThrow()
    })

    test('handles empty string', () => {
      expect(() => clearTenantExistenceCache('')).not.toThrow()
    })
  })

  describe('getRootDomain', () => {
    const originalEnv = process.env.PLATFORM_ROOT_DOMAIN

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.PLATFORM_ROOT_DOMAIN = originalEnv
      } else {
        delete process.env.PLATFORM_ROOT_DOMAIN
      }
    })

    test('returns env var value', () => {
      process.env.PLATFORM_ROOT_DOMAIN = 'myapp.com'
      expect(getRootDomain()).toBe('myapp.com')
    })

    test('returns null for empty string env var', () => {
      process.env.PLATFORM_ROOT_DOMAIN = ''
      expect(getRootDomain()).toBeNull()
    })
  })
})
