import { describe, it, expect } from '@jest/globals'
import {
  RESERVED_OUTLET_SLUGS,
  slugifyOutletName,
  validateOutletSlug,
} from '@/lib/outlets/reserved-slugs'

/**
 * Outlet slugs become URL segments (`/b/{slug}`) and query values
 * (`?outlet={slug}`), so a slug that collides with a real route would shadow
 * part of the storefront. Rejection happens at creation time — these tests are
 * the contract for what a merchant is allowed to type.
 */

const ok = (raw: string) => {
  const result = validateOutletSlug(raw)
  if (!result.ok) throw new Error(`expected "${raw}" to be valid, got: ${result.error}`)
  return result.slug
}

const err = (raw: unknown) => {
  const result = validateOutletSlug(raw)
  if (result.ok) throw new Error(`expected "${String(raw)}" to be rejected`)
  return result.error
}

describe('validateOutletSlug — accepted forms', () => {
  it('accepts a simple lowercase slug', () => {
    expect(ok('bgc')).toBe('bgc')
  })

  it('accepts hyphenated slugs', () => {
    expect(ok('bgc-high-street')).toBe('bgc-high-street')
  })

  it('accepts digits inside a slug', () => {
    expect(ok('branch-2')).toBe('branch-2')
  })

  it('normalizes surrounding whitespace and casing', () => {
    expect(ok('  BGC-High-Street  ')).toBe('bgc-high-street')
  })
})

describe('validateOutletSlug — rejected forms', () => {
  it('rejects an empty slug', () => {
    expect(err('')).toMatch(/required/i)
  })

  it('rejects whitespace-only input', () => {
    expect(err('   ')).toMatch(/required/i)
  })

  it('rejects non-string input', () => {
    expect(err(null)).toMatch(/required/i)
    expect(err(42)).toMatch(/required/i)
  })

  it('rejects a single character as too short', () => {
    expect(err('a')).toMatch(/at least 2/i)
  })

  it('rejects slugs longer than 40 characters', () => {
    expect(err('a'.repeat(41))).toMatch(/40/)
  })

  it('rejects spaces inside the slug', () => {
    expect(err('bgc high street')).toMatch(/letters, numbers/i)
  })

  it('rejects punctuation and path separators', () => {
    expect(err('bgc/street')).toMatch(/letters, numbers/i)
    expect(err('bgc.street')).toMatch(/letters, numbers/i)
    expect(err('bgc_street')).toMatch(/letters, numbers/i)
    expect(err('bgc?x=1')).toMatch(/letters, numbers/i)
  })

  it('rejects leading and trailing hyphens', () => {
    expect(err('-bgc')).toMatch(/letters, numbers/i)
    expect(err('bgc-')).toMatch(/letters, numbers/i)
  })

  it('rejects doubled hyphens', () => {
    expect(err('bgc--street')).toMatch(/letters, numbers/i)
  })

  it('rejects non-ASCII characters', () => {
    expect(err('café')).toMatch(/letters, numbers/i)
  })
})

describe('validateOutletSlug — reserved words', () => {
  // Every one of these is a real route segment in this app today. If any stops
  // being reserved, a merchant can shadow it.
  const routeSegments = [
    'menu',
    'cart',
    'checkout',
    'order',
    'admin',
    'login',
    'about',
    'privacy',
    'terms',
    'refund',
    'api',
    'b',
    'download',
    'support',
    'superadmin',
    'www',
    'app',
  ]

  it.each(routeSegments)('rejects the reserved route segment "%s"', (segment) => {
    expect(err(segment)).toMatch(/reserved/i)
  })

  it('rejects reserved words regardless of casing or padding', () => {
    expect(err('  MENU ')).toMatch(/reserved/i)
  })

  it('rejects Next.js internals', () => {
    expect(err('_next')).toMatch(/letters, numbers|reserved/i)
    expect(err('favicon')).toMatch(/reserved/i)
  })

  it('allows a slug that merely contains a reserved word', () => {
    expect(ok('menu-park')).toBe('menu-park')
  })

  it('exposes the reserved set for reuse by route handlers', () => {
    expect(RESERVED_OUTLET_SLUGS.has('menu')).toBe(true)
    expect(RESERVED_OUTLET_SLUGS.has('bgc')).toBe(false)
  })
})

describe('slugifyOutletName', () => {
  it('derives a slug from a display name', () => {
    expect(slugifyOutletName('Lucky Joy — BGC')).toBe('lucky-joy-bgc')
  })

  it('collapses runs of separators', () => {
    expect(slugifyOutletName('Lucky   Joy  //  BGC')).toBe('lucky-joy-bgc')
  })

  it('strips leading and trailing separators', () => {
    expect(slugifyOutletName('  --Lucky Joy--  ')).toBe('lucky-joy')
  })

  it('truncates to the maximum slug length without a trailing hyphen', () => {
    const slug = slugifyOutletName('a'.repeat(30) + ' ' + 'b'.repeat(30))
    expect(slug.length).toBeLessThanOrEqual(40)
    expect(slug.endsWith('-')).toBe(false)
  })

  it('returns an empty string when nothing usable remains', () => {
    expect(slugifyOutletName('—— ——')).toBe('')
  })

  it('produces slugs that pass validation', () => {
    expect(validateOutletSlug(slugifyOutletName('Lucky Joy — BGC')).ok).toBe(true)
  })
})
