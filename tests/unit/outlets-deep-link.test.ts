import { describe, it, expect } from '@jest/globals'
import {
  buildOutletDeepLinkPath,
  buildOutletShareUrl,
  resolveOutletDeepLink,
} from '@/lib/outlets/deep-link'

/**
 * `/b/{slug}` is the printed-on-signage form of `?outlet={slug}`. It resolves to
 * a redirect and nothing else — the menu, the picker, and every "is this branch
 * real" decision already live on the storefront, and duplicating them here
 * would be a second place to get them wrong.
 *
 * The two things that must never happen: the path existing for a tenant that
 * never opted in, and a bad slug producing anything other than the ordinary
 * storefront.
 */

const TENANT = 'lucky-joy'

const resolve = (rawSlug: string, extra: { isEnabled?: boolean; search?: string } = {}) =>
  resolveOutletDeepLink({
    isEnabled: extra.isEnabled ?? true,
    tenantSlug: TENANT,
    rawSlug,
    search: extra.search,
  })

describe('buildOutletDeepLinkPath', () => {
  // The merchant copies this out of the admin and prints it. If it disagrees
  // with what the router serves, the signage is wrong and nobody finds out
  // until a customer is standing in front of it.
  it('is the path the deep-link route actually serves', () => {
    expect(buildOutletDeepLinkPath('bgc')).toBe('/b/bgc')
  })

  it('round-trips through the resolver to the branch it names', () => {
    const path = buildOutletDeepLinkPath('bgc-high-street')
    const slugFromPath = path.replace('/b/', '')
    expect(resolve(slugFromPath)).toEqual({
      kind: 'redirect',
      location: '/lucky-joy/menu?outlet=bgc-high-street',
    })
  })
})

describe('buildOutletShareUrl', () => {
  /**
   * A tenant reaches its own storefront by subdomain, by custom domain, or by
   * `/{tenant}/...` path — and the admin can be sitting on any of the three.
   * The link the merchant copies has to match the one they are browsing from,
   * because they are about to print it onto something physical.
   */
  it('drops the tenant segment on a custom domain', () => {
    expect(
      buildOutletShareUrl({
        origin: 'https://luckyjoy.com',
        pathname: '/admin/outlets',
        tenantSlug: TENANT,
        slug: 'bgc',
      })
    ).toBe('https://luckyjoy.com/b/bgc')
  })

  it('drops the tenant segment on a subdomain', () => {
    expect(
      buildOutletShareUrl({
        origin: 'https://lucky-joy.webnegosyo.com',
        pathname: '/admin/outlets',
        tenantSlug: TENANT,
        slug: 'bgc',
      })
    ).toBe('https://lucky-joy.webnegosyo.com/b/bgc')
  })

  it('keeps the tenant segment when the admin is on a path-based URL', () => {
    expect(
      buildOutletShareUrl({
        origin: 'https://www.webnegosyo.com',
        pathname: '/lucky-joy/admin/outlets',
        tenantSlug: TENANT,
        slug: 'bgc',
      })
    ).toBe('https://www.webnegosyo.com/lucky-joy/b/bgc')
  })

  it('keeps the tenant segment in local path-based development', () => {
    expect(
      buildOutletShareUrl({
        origin: 'http://localhost:3000',
        pathname: '/lucky-joy/admin/outlets',
        tenantSlug: TENANT,
        slug: 'bgc',
      })
    ).toBe('http://localhost:3000/lucky-joy/b/bgc')
  })

  it('does not mistake a tenant-named prefix for the tenant segment', () => {
    // `/lucky-joy-cafe/admin` is a different tenant, not this one.
    expect(
      buildOutletShareUrl({
        origin: 'https://www.webnegosyo.com',
        pathname: '/lucky-joy-cafe/admin/outlets',
        tenantSlug: TENANT,
        slug: 'bgc',
      })
    ).toBe('https://www.webnegosyo.com/b/bgc')
  })
})

describe('resolveOutletDeepLink', () => {
  describe('when the tenant has not enabled branches', () => {
    it('reports the path as not found, exactly as it 404s today', () => {
      expect(resolve('bgc', { isEnabled: false })).toEqual({ kind: 'not-found' })
    })

    it('stays not found even for a slug that would otherwise be valid', () => {
      expect(resolve('makati-ave', { isEnabled: false })).toEqual({ kind: 'not-found' })
    })
  })

  describe('with a usable slug', () => {
    it('sends the customer to the menu carrying the branch', () => {
      expect(resolve('bgc')).toEqual({
        kind: 'redirect',
        location: '/lucky-joy/menu?outlet=bgc',
      })
    })

    it('normalizes case so a slug printed in caps still works', () => {
      expect(resolve('BGC-High-Street')).toEqual({
        kind: 'redirect',
        location: '/lucky-joy/menu?outlet=bgc-high-street',
      })
    })

    it('ignores surrounding whitespace from a hand-typed link', () => {
      expect(resolve('  bgc  ')).toEqual({
        kind: 'redirect',
        location: '/lucky-joy/menu?outlet=bgc',
      })
    })

    it('escapes the tenant segment rather than pasting it into the path', () => {
      const result = resolveOutletDeepLink({
        isEnabled: true,
        tenantSlug: 'lucky joy',
        rawSlug: 'bgc',
      })
      expect(result).toEqual({
        kind: 'redirect',
        location: '/lucky%20joy/menu?outlet=bgc',
      })
    })
  })

  describe('with a slug that cannot name a branch', () => {
    // All of these land on the ordinary storefront: the customer sees the menu
    // or the branch picker, never an error page for a link a merchant printed.
    it('falls back to the plain menu for a reserved word', () => {
      expect(resolve('menu')).toEqual({ kind: 'redirect', location: '/lucky-joy/menu' })
    })

    it('falls back to the plain menu for a malformed slug', () => {
      expect(resolve('bgc branch!')).toEqual({ kind: 'redirect', location: '/lucky-joy/menu' })
    })

    it('falls back to the plain menu for an empty slug', () => {
      expect(resolve('')).toEqual({ kind: 'redirect', location: '/lucky-joy/menu' })
    })

    it('refuses to carry a path traversal attempt into the redirect', () => {
      const result = resolve('../../superadmin')
      expect(result).toEqual({ kind: 'redirect', location: '/lucky-joy/menu' })
    })

    it('refuses to carry an absolute URL into the redirect', () => {
      const result = resolve('https://evil.example.com')
      expect(result).toEqual({ kind: 'redirect', location: '/lucky-joy/menu' })
    })
  })

  describe('campaign links', () => {
    it('keeps the tracking params a QR or ad link arrived with', () => {
      expect(resolve('bgc', { search: '?utm_source=facebook&utm_campaign=launch' })).toEqual({
        kind: 'redirect',
        location: '/lucky-joy/menu?utm_source=facebook&utm_campaign=launch&outlet=bgc',
      })
    })

    it('keeps tracking params even when the slug is unusable', () => {
      expect(resolve('menu', { search: '?utm_source=facebook' })).toEqual({
        kind: 'redirect',
        location: '/lucky-joy/menu?utm_source=facebook',
      })
    })

    it('lets the path win over an outlet param already in the query', () => {
      expect(resolve('bgc', { search: '?outlet=makati' })).toEqual({
        kind: 'redirect',
        location: '/lucky-joy/menu?outlet=bgc',
      })
    })

    it('accepts a search string without the leading question mark', () => {
      expect(resolve('bgc', { search: 'utm_source=qr' })).toEqual({
        kind: 'redirect',
        location: '/lucky-joy/menu?utm_source=qr&outlet=bgc',
      })
    })

    it('produces no stray question mark for an empty search string', () => {
      expect(resolve('bgc', { search: '' })).toEqual({
        kind: 'redirect',
        location: '/lucky-joy/menu?outlet=bgc',
      })
    })
  })
})
