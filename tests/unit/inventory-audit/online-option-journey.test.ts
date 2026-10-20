/**
 * Audit (2026-10-13): "multiple variations / add-ons on ONLINE ordering do not
 * deduct properly".
 *
 * These follow a diner's real selection through the web storefront's own code —
 * product-page selection → cart line → checkout payload → server boundary
 * schema → the follow-up that hands depletion its lines → recipe resolution —
 * and assert what the ledger is told to spend. They PASS today: they are the
 * evidence that the selection plumbing itself (suspicions 1, 2, 3, 6, 7) does
 * not lose or under-count picks once an option recipe exists.
 */
import { makeCartItem } from '@/lib/cart-utils'
import {
  getDefaultSelection,
  mapSelectionToCartFormat,
  setOptionQuantity,
  toggleOption,
} from '@/lib/modifier-groups-cart'
import { buildCartLineOrderItem, buildOrderItemsPayload } from '@/lib/checkout/order-items-payload'
import { parseOrderLines } from '@/lib/checkout/order-line-schema'
import { resolveOrderDepletions, type DepletionOrderItem } from '@/lib/inventory/order-depletion'
import { expandLinkedStockItems } from '@/lib/inventory/option-stock'
import type {
  CartBundleItem,
  MenuItem,
  ModifierGroup,
  Recipe,
  RecipeComponent,
} from '@/types/database'

const applyOrderStockBestEffort = jest.fn()
jest.mock('@/lib/inventory/order-stock-service', () => ({
  applyOrderStockBestEffort: (...args: unknown[]) => applyOrderStockBestEffort(...args),
}))

const TENANT = 'shop'

function menuItem(id: string, groups: ModifierGroup[]): MenuItem {
  return {
    id, tenant_id: TENANT, category_id: 'c', name: id, description: '', price: 100,
    image_url: '', is_available: true, order: 0, created_at: '', updated_at: '',
    variations: [], addons: [], modifier_groups: groups,
  }
}

function recipe(id: string, menuItemId: string, optionId?: string): Recipe {
  return optionId
    ? { id, tenant_id: TENANT, target_type: 'modifier_option', menu_item_id: menuItemId, modifier_option_id: optionId, created_at: '', updated_at: '' }
    : { id, tenant_id: TENANT, target_type: 'menu_item', menu_item_id: menuItemId, created_at: '', updated_at: '' }
}

function line(recipeId: string, ingredient: string, quantity: number, unit = 'g'): RecipeComponent {
  return { id: `${recipeId}-${ingredient}`, tenant_id: TENANT, recipe_id: recipeId, inventory_item_id: ingredient, quantity, unit_id: unit, sort_order: 0, created_at: '', updated_at: '' }
}

/** What `createOrderAction` hands `applyOrderStockBestEffort` for these cart lines. */
async function depletionItemsFor(payload: unknown[]): Promise<DepletionOrderItem[]> {
  const parsed = parseOrderLines(payload)
  if (!parsed.ok) throw new Error(parsed.error)
  applyOrderStockBestEffort.mockReset()
  const { runOrderFollowUps } = await import('@/lib/checkout/order-follow-ups')
  await runOrderFollowUps({
    tenantConfig: { inventory_enabled: true },
    tenantId: TENANT,
    orderId: 'order-1',
    platformOrderId: 'order-1',
    items: parsed.lines,
    outletId: null,
    loyverse: null,
    notice: { orderTypeName: null, deliveryFee: 0, serviceCharge: 0, paymentMethodName: null, customerData: undefined },
  }, (task) => { void task() })
  return applyOrderStockBestEffort.mock.calls[0][2] as DepletionOrderItem[]
}

describe('online order → depletion: selection plumbing (refuted suspicions)', () => {
  it('spends both single-select picks of a two-group latte (Iced + Regular Milk, live keto-lifestyle-cafe shape)', async () => {
    const temp: ModifierGroup = { id: 'temp', name: 'Choice of', min_select: 1, max_select: 1, display_order: 0,
      options: [{ id: 'hot', name: 'Hot', price_modifier: 0, display_order: 0 }, { id: 'iced', name: 'Iced', price_modifier: 0, display_order: 1 }] }
    const milk: ModifierGroup = { id: 'milk', name: 'Choice of Milk', min_select: 1, max_select: 1, display_order: 1,
      options: [{ id: 'regular', name: 'Regular Milk', price_modifier: 0, display_order: 0 }, { id: 'oat', name: 'OatMilk', price_modifier: 0, display_order: 1 }] }
    const latte = menuItem('latte', [temp, milk])
    let selection = getDefaultSelection([temp, milk])
    selection = toggleOption(selection, temp, 'iced')
    const cart = makeCartItem(latte, mapSelectionToCartFormat([temp, milk], selection).selectedVariations,
      mapSelectionToCartFormat([temp, milk], selection).selectedAddons, 2)

    const items = await depletionItemsFor([buildCartLineOrderItem(cart)])
    const recipes = [recipe('base', 'latte'), recipe('r-iced', 'latte', 'iced'), recipe('r-regular', 'latte', 'regular')]
    const components = [line('base', 'coffee', 16), line('r-iced', 'ice', 200), line('r-regular', 'fresh-milk', 240, 'ml')]

    expect(resolveOrderDepletions(expandLinkedStockItems(items, [], recipes), recipes, components)).toEqual(
      expect.arrayContaining([
        { inventoryItemId: 'coffee', quantity: 32, unitId: 'g' },
        { inventoryItemId: 'ice', quantity: 400, unitId: 'g' },
        { inventoryItemId: 'fresh-milk', quantity: 480, unitId: 'ml' },
      ]),
    )
  })

  it('spends every pick of a multi-select choice group (pick 3 of N)', async () => {
    const toppings: ModifierGroup = { id: 'tops', name: 'Toppings', min_select: 0, max_select: 3, display_order: 0,
      options: ['a', 'b', 'c', 'd'].map((id, i) => ({ id, name: id, price_modifier: 5, display_order: i })) }
    const sundae = menuItem('sundae', [toppings])
    let selection = getDefaultSelection([toppings])
    for (const id of ['a', 'b', 'c']) selection = toggleOption(selection, toppings, id)
    const fmt = mapSelectionToCartFormat([toppings], selection)
    const items = await depletionItemsFor([buildCartLineOrderItem(makeCartItem(sundae, fmt.selectedVariations, fmt.selectedAddons, 1))])
    const recipes = ['a', 'b', 'c', 'd'].map((id) => recipe(`r-${id}`, 'sundae', id))
    const components = ['a', 'b', 'c', 'd'].map((id) => line(`r-${id}`, `ing-${id}`, 10))

    expect(resolveOrderDepletions(items, recipes, components)).toEqual([
      { inventoryItemId: 'ing-a', quantity: 10, unitId: 'g' },
      { inventoryItemId: 'ing-b', quantity: 10, unitId: 'g' },
      { inventoryItemId: 'ing-c', quantity: 10, unitId: 'g' },
    ])
  })

  it('multiplies quantity-group portions by line quantity (×7 flavours, live gungjeon-unlimited shape)', async () => {
    const flavours: ModifierGroup = { id: 'flav', name: 'Flavours', selection_mode: 'quantity', min_select: 0, max_select: null, display_order: 0,
      options: [{ id: 'teriyaki', name: 'Pork Teriyaki', price_modifier: 0, display_order: 0 }, { id: 'bulgogi', name: 'Pork Bulgogi', price_modifier: 0, display_order: 1 }] }
    const pork = menuItem('pork', [flavours])
    let selection = setOptionQuantity({}, flavours, 'teriyaki', 7)
    selection = setOptionQuantity(selection, flavours, 'bulgogi', 1)
    const fmt = mapSelectionToCartFormat([flavours], selection)
    const items = await depletionItemsFor([buildCartLineOrderItem(makeCartItem(pork, fmt.selectedVariations, fmt.selectedAddons, 2))])
    const recipes = [recipe('base', 'pork'), recipe('r-t', 'pork', 'teriyaki'), recipe('r-b', 'pork', 'bulgogi')]
    const components = [line('base', 'tray', 1, 'pc'), line('r-t', 'pork-meat', 100), line('r-b', 'pork-meat', 100)]

    // base 1 tray × 2; pork (7 + 1) × 100 g × 2
    expect(resolveOrderDepletions(items, recipes, components)).toEqual([
      { inventoryItemId: 'tray', quantity: 2, unitId: 'pc' },
      { inventoryItemId: 'pork-meat', quantity: 1600, unitId: 'g' },
    ])
  })

  it('carries combo-slot options into depletion, × slot qty × combo qty', async () => {
    const bundle: CartBundleItem = {
      id: 'b1', bundleId: 'combo', bundleName: 'Combo', quantity: 2, pricingType: 'fixed', basePrice: 200, subtotal: 400,
      slots: [{ slotId: 's1', slotName: 'Drink', menuItemId: 'latte', menuItemName: 'Latte', menuItemImage: null, menuItemPrice: 100, quantity: 1,
        selectedVariations: { temp: { id: 'iced', name: 'Iced', price_modifier: 0, display_order: 0 } },
        selectedAddons: [{ id: 'shot', name: 'Extra shot', price: 20, quantity: 2 }], priceOverride: 100 }],
    }
    const items = await depletionItemsFor(buildOrderItemsPayload([], [bundle]))
    const recipes = [recipe('r-iced', 'latte', 'iced'), recipe('r-shot', 'latte', 'shot')]
    const components = [line('r-iced', 'ice', 200), line('r-shot', 'coffee', 9)]

    expect(resolveOrderDepletions(items, recipes, components)).toEqual([
      { inventoryItemId: 'ice', quantity: 400, unitId: 'g' },
      { inventoryItemId: 'coffee', quantity: 36, unitId: 'g' },
    ])
  })
})
