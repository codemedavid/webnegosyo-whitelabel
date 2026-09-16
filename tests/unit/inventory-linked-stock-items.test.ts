import { expandLinkedStockItems, simpleOptionDemands } from '@/lib/inventory/option-stock'
import type { ModifierGroup, Recipe } from '@/types/database'

const groups: ModifierGroup[] = [{ id: 'g', name: 'Extras', display_order: 0, min_select: 0, max_select: null, options: [
  { id: 'coke', name: 'Coke', display_order: 0, price_modifier: 10, menu_item_id: 'drink' },
  { id: 'cheese', name: 'Cheese', display_order: 1, price_modifier: 5, stock_mode: 'simple', stock_qty: 5 },
] }]
const catalog = [{ id: 'burger', modifier_groups: groups }]
const line = { menuItemId: 'burger', quantity: 2, addonIds: ['coke'], addonQuantities: { coke: 3 } }

it('uses six linked item base recipes when no option-specific recipe exists', () => {
  expect(expandLinkedStockItems([line], catalog, [])).toContainEqual({ menuItemId: 'drink', quantity: 6 })
})
it('does not spend both a linked base recipe and an explicit option recipe', () => {
  const recipe = { menu_item_id: 'burger', target_type: 'modifier_option', modifier_option_id: 'coke' } as Recipe
  expect(expandLinkedStockItems([line], catalog, [recipe])).toEqual([line])
})
it('aggregates simple stock demand across configurations and parent units', () => {
  const items = [
    { menuItemId: 'burger', quantity: 2, addonIds: ['cheese'], addonQuantities: { cheese: 3 } },
    { menuItemId: 'burger', quantity: 1, addonIds: ['cheese'] },
  ]
  expect(simpleOptionDemands(items, catalog)).toEqual([{ menuItemId: 'burger', optionId: 'cheese', quantity: 7, available: 5, name: 'Cheese' }])
})
