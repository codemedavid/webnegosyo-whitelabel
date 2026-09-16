import { makeCartItem } from '@/lib/cart-utils'
import { mapSelectionToCartFormat, setOptionQuantity } from '@/lib/modifier-groups-cart'
import { extractSelectionIds } from '@/lib/inventory/order-item-selection'
import { buildInventorySelectionSnapshot, readInventorySelectionSnapshot } from '@/lib/inventory-selection-snapshot'
import { resolveOrderDepletions } from '@/lib/inventory/order-depletion'
import type { MenuItem, ModifierGroup, Recipe, RecipeComponent } from '@/types/database'

it('charges and depletes six extra portions for two burgers with three extras each after saving the order', () => {
  const extras: ModifierGroup = { id: 'extras', name: 'Extras', selection_mode: 'quantity', min_select: 0, max_select: null, display_order: 0,
    options: [{ id: 'cheese', name: 'Cheese', price_modifier: 10, stock_mode: 'recipe', display_order: 0 }] }
  const item: MenuItem = { id: 'burger', tenant_id: 'shop', category_id: 'mains', name: 'Burger', description: 'Burger', price: 100,
    image_url: '', is_available: true, order: 0, created_at: '', updated_at: '', variations: [], addons: [], modifier_groups: [extras] }
  const selected = mapSelectionToCartFormat([extras], setOptionQuantity({}, extras, 'cheese', 3))
  const cart = makeCartItem(item, selected.selectedVariations, selected.selectedAddons, 2)
  expect(cart.subtotal).toBe(260)

  const ids = extractSelectionIds(cart)
  const saved = { _inventory_selections: buildInventorySelectionSnapshot([{ menu_item_id: item.id, quantity: cart.quantity,
    option_ids: ids.optionIds, addon_ids: ids.addonIds, addon_quantities: ids.addonQuantities }]) }
  const lines = readInventorySelectionSnapshot(saved, [{ menuItemId: item.id, quantity: 2 }])!
  const recipes: Recipe[] = [
    { id: 'base', tenant_id: 'shop', target_type: 'menu_item', menu_item_id: item.id, created_at: '', updated_at: '' },
    { id: 'extra', tenant_id: 'shop', target_type: 'modifier_option', menu_item_id: item.id, modifier_option_id: 'cheese', created_at: '', updated_at: '' },
  ]
  const components: RecipeComponent[] = [
    { id: 'bun-line', tenant_id: 'shop', recipe_id: 'base', inventory_item_id: 'bun', quantity: 1, unit_id: 'piece', sort_order: 0, created_at: '', updated_at: '' },
    { id: 'cheese-line', tenant_id: 'shop', recipe_id: 'extra', inventory_item_id: 'cheese-slice', quantity: 1, unit_id: 'piece', sort_order: 0, created_at: '', updated_at: '' },
  ]
  expect(resolveOrderDepletions(lines, recipes, components)).toEqual([
    { inventoryItemId: 'bun', quantity: 2, unitId: 'piece' },
    { inventoryItemId: 'cheese-slice', quantity: 6, unitId: 'piece' },
  ])
})
