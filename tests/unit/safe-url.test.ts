/**
 * Merchant-supplied URLs end up in `href`, `src` and inline CSS `url()` on the
 * public storefront. A value only has to be a syntactically valid URL to pass
 * `z.string().url()`, so `javascript:`, `data:` and a `")` CSS breakout all got
 * through. These helpers are the one definition of "a URL we will render".
 */
import { describe, it, expect } from '@jest/globals'
import { cssUrl, isSafeHttpUrl, isSafeSiteLink, normalizeExternalLink } from '@/lib/safe-url'

describe('isSafeHttpUrl', () => {
  it.each([
    'https://ik.imagekit.io/x/logo.png',
    'http://example.com/a.jpg?w=100&h=50',
    'https://example.com/path%20with%20encoded',
  ])('accepts %s', (url) => {
    expect(isSafeHttpUrl(url)).toBe(true)
  })

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:image/png;base64,AAAA',
    'vbscript:msgbox',
    'ftp://example.com/x.png',
    '//evil.com/x.png',
    '/relative/path.png',
    'https://example.com/a.png");background:url(https://evil.com/x',
    "https://example.com/a'.png",
    'https://example.com/a(b).png',
    'https://example.com/a\\b.png',
    'https://example.com/a b.png',
    'https://example.com/a\n.png',
    'https://example.com/a\t.png',
    'not a url',
    '',
  ])('rejects %j', (url) => {
    expect(isSafeHttpUrl(url)).toBe(false)
  })
})

describe('isSafeSiteLink', () => {
  it('accepts an http(s) URL or a single-slash site path', () => {
    expect(isSafeSiteLink('https://shop.example.com/promo')).toBe(true)
    expect(isSafeSiteLink('/menu/item/abc')).toBe(true)
  })

  it.each(['//evil.com', '/\\evil.com', 'javascript:alert(1)', 'data:text/html,x', '/a b'])(
    'rejects %j',
    (url) => {
      expect(isSafeSiteLink(url)).toBe(false)
    },
  )
})

describe('normalizeExternalLink', () => {
  it('prefixes https:// onto a bare host a merchant typed without a scheme', () => {
    expect(normalizeExternalLink('www.facebook.com/cafe')).toBe('https://www.facebook.com/cafe')
    expect(normalizeExternalLink('  instagram.com/cafe ')).toBe('https://instagram.com/cafe')
  })

  it('leaves full URLs, blanks and non-host text untouched', () => {
    expect(normalizeExternalLink('https://facebook.com/cafe')).toBe('https://facebook.com/cafe')
    expect(normalizeExternalLink('')).toBe('')
    expect(normalizeExternalLink('javascript:alert(1)')).toBe('javascript:alert(1)')
    expect(normalizeExternalLink('@cafe')).toBe('@cafe')
  })
})

describe('cssUrl', () => {
  it('quotes a safe URL', () => {
    expect(cssUrl('https://cdn.example.com/bg.jpg')).toBe('url("https://cdn.example.com/bg.jpg")')
  })

  it('allows a site-relative path', () => {
    expect(cssUrl('/uploads/bg.png')).toBe('url("/uploads/bg.png")')
  })

  it.each([
    'https://example.com/a.png");color:red;background:url("https://evil.com/x',
    'https://example.com/a.png)',
    'javascript:alert(1)',
    'data:image/svg+xml,<svg onload=alert(1)>',
    'https://example.com/a\n.png',
    '//evil.com/x.png',
  ])('refuses %j instead of emitting it into CSS', (url) => {
    expect(cssUrl(url)).toBeNull()
  })
})
