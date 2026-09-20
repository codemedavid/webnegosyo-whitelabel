import { describe, it, expect } from '@jest/globals'
import { appendBanner, newBannerId, normalizeBannerList, patchBanner, withoutBanner, type StoredBanner } from '@/lib/banner-list'

describe('normalizeBannerList', () => {
  it('drops entries without an id or image and coerces unknown formats to landscape', () => {
    const list = normalizeBannerList([
      { id: 'a', imageUrl: 'https://x/a.png', title: 'A', format: 'portrait' },
      { id: 'b', imageUrl: '' },
      { imageUrl: 'https://x/c.png' },
      { id: 'd', imageUrl: 'https://x/d.png', format: 'wide' },
      'junk',
    ])
    expect(list).toEqual([
      { id: 'a', imageUrl: 'https://x/a.png', title: 'A', format: 'portrait' },
      { id: 'd', imageUrl: 'https://x/d.png', format: 'landscape' },
    ])
  })

  it('returns an empty list for anything that is not an array', () => {
    expect(normalizeBannerList(null)).toEqual([])
    expect(normalizeBannerList('')).toEqual([])
    expect(normalizeBannerList({})).toEqual([])
  })
})

describe('appendBanner', () => {
  const existing: StoredBanner[] = [{ id: 'keep', imageUrl: 'https://x/keep.png' }]

  it('keeps the existing banners and appends the new one', () => {
    const next = appendBanner(existing, 'menu', { imageUrl: 'https://x/new.png', title: 'New' }, 'banner-2')
    expect(next).toEqual([...existing, { id: 'banner-2', imageUrl: 'https://x/new.png', title: 'New' }])
    expect(existing).toHaveLength(1)
  })

  it('always stamps a format on welcome banners, defaulting to landscape', () => {
    expect(appendBanner([], 'welcome', { imageUrl: 'https://x/w.png' }, 'b').at(0)?.format).toBe('landscape')
    expect(appendBanner([], 'welcome', { imageUrl: 'https://x/w.png', format: 'square' }, 'b').at(0)?.format).toBe('square')
    expect(appendBanner([], 'menu', { imageUrl: 'https://x/w.png', format: 'square' }, 'b').at(0)?.format).toBeUndefined()
  })
})

describe('patchBanner / withoutBanner', () => {
  const list: StoredBanner[] = [
    { id: 'a', imageUrl: 'https://x/a.png', title: 'A', description: 'desc', format: 'landscape' },
    { id: 'b', imageUrl: 'https://x/b.png' },
  ]

  it('patches one banner immutably; null clears text, undefined leaves it', () => {
    const next = patchBanner(list, 'a', { title: null, imageUrl: 'https://x/a2.png', format: 'portrait' })
    expect(next[0]).toEqual({ id: 'a', imageUrl: 'https://x/a2.png', description: 'desc', format: 'portrait' })
    expect(next[1]).toBe(list[1])
    expect(list[0].title).toBe('A')
  })

  it('does not invent a format on a menu banner', () => {
    expect(patchBanner(list, 'b', { format: 'square' })[1].format).toBeUndefined()
  })

  it('throws on an unknown id so a typo never reads as success', () => {
    expect(() => patchBanner(list, 'zzz', { title: 'x' })).toThrow(/list_banners/)
    expect(() => withoutBanner(list, 'zzz')).toThrow(/list_banners/)
  })

  it('removes exactly one banner', () => {
    expect(withoutBanner(list, 'a').map((b) => b.id)).toEqual(['b'])
  })
})

describe('newBannerId', () => {
  it('matches the Studio id shape', () => {
    expect(newBannerId(() => 1700000000000, () => 0.5)).toMatch(/^banner-1700000000000-[a-z0-9]+$/)
  })
})
