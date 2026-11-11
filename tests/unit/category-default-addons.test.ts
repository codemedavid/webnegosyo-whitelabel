import { describe, it, expect } from '@jest/globals'
import { withCategoryAddons } from '@/lib/category-default-addons'
import type { ModifierGroup } from '@/types/database'

/**
 * A category's default add-ons ("every silog can add Fried Rice") were merged
 * into the dish only on the legacy add-on path. Every store now runs option
 * groups, so on any dish with groups they vanished from the storefront, and the
 * server never priced them at all. One merge, used by the item page and by
 * checkout pricing.
 */

const rice = { id: 'c-rice', name: 'Fried Rice', price: 15 }
const egg = { id: 'c-egg', name: 'Egg', price: 20 }

const sizeGroup: ModifierGroup = {
  id: 'g-size', name: 'Size', display_order: 0, min_select: 1, max_select: 1,
  options: [{ id: 'o-solo', name: 'Solo', price_modifier: 0, display_order: 0 }],
}

describe('withCategoryAddons', () => {
  it('returns the same item when the category has no defaults', () => {
    const item = { modifier_groups: [sizeGroup], addons: [] }
    expect(withCategoryAddons(item, undefined)).toBe(item)
    expect(withCategoryAddons(item, [])).toBe(item)
  })

  it('adds an optional add-ons group to a dish that has groups but none for add-ons', () => {
    const result = withCategoryAddons({ modifier_groups: [sizeGroup] }, [rice])

    expect(result.modifier_groups).toEqual([
      sizeGroup,
      {
        id: 'category-addons',
        name: 'Add-ons',
        selection_mode: 'quantity',
        display_order: 1000,
        min_select: 0,
        max_select: null,
        options: [{ id: 'c-rice', name: 'Fried Rice', price_modifier: 15, display_order: 0 }],
      },
    ])
  })

  it('appends to the dish’s own add-ons group, the dish winning on a shared name', () => {
    const addons: ModifierGroup = {
      id: 'g-addons', name: 'Extras', selection_mode: 'quantity', display_order: 1, min_select: 0, max_select: null,
      options: [{ id: 'a-rice', name: 'fried rice', price_modifier: 12, display_order: 0 }],
    }

    const result = withCategoryAddons({ modifier_groups: [sizeGroup, addons] }, [rice, egg])

    expect(result.modifier_groups?.[1].options).toEqual([
      { id: 'a-rice', name: 'fried rice', price_modifier: 12, display_order: 0 },
      { id: 'c-egg', name: 'Egg', price_modifier: 20, display_order: 1 },
    ])
  })

  it('merges into the legacy add-on list for a dish without groups', () => {
    const result = withCategoryAddons({ addons: [{ id: 'a-egg', name: 'EGG', price: 25 }] }, [rice, egg])

    expect(result.addons).toEqual([{ id: 'a-egg', name: 'EGG', price: 25 }, rice])
  })

  it('ignores malformed category entries', () => {
    const result = withCategoryAddons({ addons: [] }, [{ id: '', name: 'x', price: 1 }, { id: 'n', name: '', price: 1 }, null] as never)

    expect(result.addons).toEqual([])
  })
})
