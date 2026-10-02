import {
  categoriesToCreate,
  createAdopter,
  findRetiredMenuItemIds,
  isMenuItemInSync,
  isVariantMapInSync,
  stableStringify,
  type MenuItemSyncFields,
} from '@/lib/loyverse/catalog-import-plan'
import type { MappedLoyverseItem } from '@/lib/loyverse/catalog-mapper'

const fields: MenuItemSyncFields = {
  name: 'Latte',
  description: '',
  price: 150,
  category_id: 'cat-1',
  modifier_groups: [
    { id: 'g', name: 'Size', display_order: 0, min_select: 1, max_select: 1, options: [] },
  ],
  is_available: true,
}

describe('stableStringify', () => {
  it('ignores object key order (jsonb does not keep it)', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }))
  })

  it('keeps array order', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]))
  })
})

describe('isMenuItemInSync', () => {
  const stored = {
    id: 'mi-1',
    name: 'Latte',
    description: null,
    price: '150.00',
    category_id: 'cat-1',
    // Stored jsonb comes back with its keys in a different order.
    modifier_groups: [
      { options: [], max_select: 1, min_select: 1, display_order: 0, name: 'Size', id: 'g' },
    ],
    is_available: true,
    image_url: 'https://cdn/latte.png',
  }

  it('treats a stored row equal to the sync fields as in sync', () => {
    expect(isMenuItemInSync(stored, fields)).toBe(true)
  })

  it('detects a changed price, availability or image', () => {
    expect(isMenuItemInSync(stored, { ...fields, price: 160 })).toBe(false)
    expect(isMenuItemInSync(stored, { ...fields, is_available: false })).toBe(false)
    expect(isMenuItemInSync(stored, { ...fields, image_url: 'https://api.loyverse.com/x.png' })).toBe(false)
  })
})

describe('isVariantMapInSync', () => {
  const row = { menu_item_id: 'mi-1', loyverse_item_id: 'i1', loyverse_variant_id: 'v1', local_key: '', loyverse_sku: null, in_stock: '3' }
  const desired = {
    tenant_id: 't',
    kind: 'variant' as const,
    menu_item_id: 'mi-1',
    local_key: '',
    loyverse_item_id: 'i1',
    loyverse_variant_id: 'v1',
    loyverse_modifier_id: null,
    loyverse_modifier_option_id: null,
    loyverse_sku: null,
    in_stock: 3,
  }

  it('matches regardless of numeric string vs number stock', () => {
    expect(isVariantMapInSync([row], [desired])).toBe(true)
  })

  it('detects a changed level or a missing row', () => {
    expect(isVariantMapInSync([row], [{ ...desired, in_stock: 0 }])).toBe(false)
    expect(isVariantMapInSync([], [desired])).toBe(false)
  })
})

describe('createAdopter', () => {
  const unclaimed = [
    { id: 'a', name: 'Latte ', category_id: 'cat-2', image_url: null },
    { id: 'b', name: 'latte', category_id: 'cat-1', image_url: null },
  ]

  it('prefers a same-category match, case- and whitespace-insensitively', () => {
    expect(createAdopter(unclaimed)('LATTE', 'cat-1')?.id).toBe('b')
  })

  it('hands each dish out at most once', () => {
    const adopt = createAdopter(unclaimed)
    expect(adopt('Latte', 'cat-1')?.id).toBe('b')
    expect(adopt('Latte', 'cat-1')?.id).toBe('a')
    expect(adopt('Latte', 'cat-1')).toBeNull()
  })
})

describe('categoriesToCreate', () => {
  const item = (categoryLoyverseId: string) => ({ categoryLoyverseId }) as MappedLoyverseItem

  it('dedupes case-insensitively and skips existing names', () => {
    const names = categoriesToCreate(
      [item('c1'), item('c2'), item('c3')],
      { c1: 'Drinks', c2: 'drinks', c3: 'Food' },
      new Set(['food'])
    )
    expect(names).toEqual(['Drinks'])
  })
})

describe('findRetiredMenuItemIds', () => {
  const identified = [
    { id: 'mi-1', loyverse_item_id: 'i1' },
    { id: 'mi-2', loyverse_item_id: 'i2' },
  ]

  it('returns dishes whose Loyverse item is no longer live', () => {
    expect(findRetiredMenuItemIds(identified, new Set(['i1']))).toEqual(['mi-2'])
  })

  it('retires nothing when the live catalog is empty', () => {
    expect(findRetiredMenuItemIds(identified, new Set())).toEqual([])
  })
})
