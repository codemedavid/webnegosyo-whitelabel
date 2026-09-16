import { buildInventorySelectionSnapshot, readInventorySelectionSnapshot } from '@/lib/inventory-selection-snapshot'

it('persists per-item extras independently of display names and backend item schemas', () => {
  const snapshot = buildInventorySelectionSnapshot([{ menu_item_id: 'burger', quantity: 2, option_ids: ['large'], addon_ids: ['cheese'], addon_quantities: { cheese: 3 } }])
  expect(readInventorySelectionSnapshot({ _inventory_selections: snapshot })).toEqual([
    { menuItemId: 'burger', quantity: 2, optionIds: ['large'], addonIds: ['cheese'], modifierOptionIds: ['large', 'cheese'], addonQuantities: { cheese: 3 } },
  ])
})

it('rejects corrupt saved quantities instead of treating them as one portion', () => {
  expect(readInventorySelectionSnapshot({ _inventory_selections: { version: 1, items: [{ menuItemId: 'burger', quantity: 2, optionIds: [], addonIds: ['cheese'], addonQuantities: { cheese: -1 } }] } })).toBeNull()
  expect(readInventorySelectionSnapshot({})).toBeNull()
})

it('binds the snapshot to persisted parent lines even when database row order changes', () => {
  const data = { _inventory_selections: buildInventorySelectionSnapshot([
    { menu_item_id: 'burger', quantity: 2, addon_ids: ['cheese'], addon_quantities: { cheese: 3 } },
    { menu_item_id: 'drink', quantity: 1 },
  ]) }
  expect(readInventorySelectionSnapshot(data, [{ menuItemId: 'drink', quantity: 1 }, { menuItemId: 'burger', quantity: 2 }])).toHaveLength(2)
  expect(readInventorySelectionSnapshot(data, [{ menuItemId: 'burger', quantity: 1 }, { menuItemId: 'drink', quantity: 1 }])).toBeNull()
})
