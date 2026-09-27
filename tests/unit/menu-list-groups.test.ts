import { groupMenuItemsByCategory } from '@/lib/menu-list-groups'
import type { Category, MenuItem } from '@/types/database'

const category = (id: string, name: string, order: number) => ({ id, name, order }) as Category
const dish = (id: string, categoryId: string) => ({ id, category_id: categoryId, name: id }) as MenuItem

const CATEGORIES = [category('drinks', 'Drinks', 2), category('rice', 'Rice Meals', 1)]

describe('groupMenuItemsByCategory', () => {
  it('groups dishes under their category, in the category order', () => {
    const groups = groupMenuItemsByCategory([dish('coke', 'drinks'), dish('adobo', 'rice')], CATEGORIES)

    expect(groups.map((g) => g.name)).toEqual(['Rice Meals', 'Drinks'])
    expect(groups[0].items.map((i) => i.id)).toEqual(['adobo'])
  })

  it('keeps the dishes in the order they arrived within a category', () => {
    const groups = groupMenuItemsByCategory([dish('b', 'rice'), dish('a', 'rice')], CATEGORIES)

    expect(groups[0].items.map((i) => i.id)).toEqual(['b', 'a'])
  })

  it('leaves out categories with no dishes', () => {
    const groups = groupMenuItemsByCategory([dish('adobo', 'rice')], CATEGORIES)

    expect(groups).toHaveLength(1)
  })

  it('puts dishes whose category is gone in a last "Other" group rather than dropping them', () => {
    const groups = groupMenuItemsByCategory([dish('ghost', 'deleted'), dish('adobo', 'rice')], CATEGORIES)

    expect(groups.map((g) => g.name)).toEqual(['Rice Meals', 'Other'])
    expect(groups[1].items.map((i) => i.id)).toEqual(['ghost'])
  })

  it('returns nothing for no dishes', () => {
    expect(groupMenuItemsByCategory([], CATEGORIES)).toEqual([])
  })
})
