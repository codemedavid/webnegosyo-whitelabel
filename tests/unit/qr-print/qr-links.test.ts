import { describe, it, expect } from '@jest/globals'
import { buildQrTargetUrl, listStoreAddresses } from '@/lib/qr-print/qr-links'

describe('listStoreAddresses', () => {
  it('offers the custom domain first, then the platform subdomain', () => {
    const addresses = listStoreAddresses({
      slug: 'cafe',
      domain: 'order.cafe.ph',
      rootDomain: 'webnegosyo.com',
      appUrl: 'https://www.webnegosyo.com',
    })
    expect(addresses.map((a) => a.baseUrl)).toEqual(['https://order.cafe.ph', 'https://cafe.webnegosyo.com'])
    expect(addresses[0].key).toBe('custom-domain')
  })

  it('strips a stored protocol and trailing slash from the custom domain', () => {
    const [first] = listStoreAddresses({ slug: 'cafe', domain: 'https://Order.Cafe.ph/', rootDomain: null, appUrl: null })
    expect(first.baseUrl).toBe('https://order.cafe.ph')
  })

  it('falls back to the path-based app URL when there is no root domain', () => {
    const addresses = listStoreAddresses({ slug: 'cafe', domain: null, rootDomain: null, appUrl: 'http://localhost:3000/' })
    expect(addresses).toEqual([{ key: 'platform', label: 'localhost:3000/cafe', baseUrl: 'http://localhost:3000/cafe' }])
  })

  it('returns nothing when no absolute address can be built', () => {
    expect(listStoreAddresses({ slug: 'cafe', domain: null, rootDomain: null, appUrl: null })).toEqual([])
  })

  it('ignores a malformed custom domain', () => {
    const addresses = listStoreAddresses({ slug: 'cafe', domain: 'not a domain', rootDomain: 'webnegosyo.com', appUrl: null })
    expect(addresses.map((a) => a.key)).toEqual(['platform'])
  })
})

describe('buildQrTargetUrl', () => {
  it('points the store code at the menu', () => {
    expect(buildQrTargetUrl('https://cafe.webnegosyo.com', {})).toBe('https://cafe.webnegosyo.com/menu')
  })

  it('carries the branch for a branch code', () => {
    expect(buildQrTargetUrl('https://cafe.webnegosyo.com', { outletSlug: 'north' })).toBe(
      'https://cafe.webnegosyo.com/menu?outlet=north'
    )
  })

  it('normalizes and encodes the table, table first like the merchant app', () => {
    expect(buildQrTargetUrl('https://x.ph', { tableLabel: ' patio 2 ', outletSlug: 'north' })).toBe(
      'https://x.ph/menu?table=PATIO%202&outlet=north'
    )
  })

  it('drops a table label that normalizes to nothing', () => {
    expect(buildQrTargetUrl('https://x.ph', { tableLabel: '   ' })).toBe('https://x.ph/menu')
  })
})
