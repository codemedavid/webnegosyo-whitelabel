/**
 * "Best Sellers" on a storefront home: the merchant's own signals, in order of
 * how deliberately they were set — featured first, then menu-engineering stars
 * (only when that feature is on), then badged items, then menu order. Items a
 * customer cannot order never appear.
 */
import { selectBestSellers } from '@/storefront/catalog/best-sellers'
import { createTestMenuItem } from '../../fixtures/menu-item.fixture'

const item = (id: string, overrides = {}) => createTestMenuItem({ id, name: id, ...overrides })

describe('selectBestSellers', () => {
  it('ranks featured, then stars, then badged items, then menu order', () => {
    const items = [
      item('plain-late', { order: 9 }),
      item('badged', { order: 5, badge_text: 'New' }),
      item('star', { order: 4, bcg_classification: 'star' }),
      item('featured', { order: 7, is_featured: true }),
      item('plain-early', { order: 1 }),
    ]
    const ids = selectBestSellers(items, { menuEngineeringEnabled: true }).map((i) => i.id)
    expect(ids).toEqual(['featured', 'star', 'badged', 'plain-early', 'plain-late'])
  })

  it('ignores star classification while menu engineering is off', () => {
    const items = [item('star', { order: 4, bcg_classification: 'star' }), item('first', { order: 1 })]
    expect(selectBestSellers(items, { menuEngineeringEnabled: false }).map((i) => i.id)).toEqual(['first', 'star'])
  })

  it('leaves out items that cannot be ordered', () => {
    const items = [item('sold-out', { is_featured: true, is_available: false }), item('ok')]
    expect(selectBestSellers(items).map((i) => i.id)).toEqual(['ok'])
  })

  it('returns at most the requested number of items', () => {
    const items = Array.from({ length: 12 }, (_, n) => item(`i${n}`, { order: n }))
    expect(selectBestSellers(items, { limit: 3 })).toHaveLength(3)
    expect(selectBestSellers(items)).toHaveLength(8)
  })

  it('does not reorder the caller array', () => {
    const items = [item('b', { order: 2 }), item('a', { order: 1 })]
    selectBestSellers(items)
    expect(items.map((i) => i.id)).toEqual(['b', 'a'])
  })
})
