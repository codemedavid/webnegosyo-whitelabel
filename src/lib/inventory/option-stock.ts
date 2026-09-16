import type { ModifierGroup, Recipe } from '@/types/database'
import type { DepletionOrderItem } from './order-depletion'

export interface StockOptionCatalogItem {
  id: string
  modifier_groups?: ModifierGroup[] | null
}

export function selectedStockOptionIds(item: DepletionOrderItem): string[] {
  return [...new Set([...(item.optionIds ?? []), ...(item.modifierOptionIds ?? []), ...(item.addonIds ?? [])])]
}

/** Links come only from the tenant's stored catalog, never from order metadata. */
export function linkedStockMenuItemIds(catalog: readonly StockOptionCatalogItem[]): string[] {
  return [...new Set(catalog.flatMap((item) => (item.modifier_groups ?? []).flatMap((group) =>
    group.options.flatMap((option) => option.menu_item_id ? [option.menu_item_id] : []),
  ))) ]
}

/** An explicit option recipe wins; otherwise a linked option uses the linked base recipe. */
export function expandLinkedStockItems(
  items: readonly DepletionOrderItem[],
  catalog: readonly StockOptionCatalogItem[],
  recipes: readonly Recipe[],
): DepletionOrderItem[] {
  return items.flatMap((item) => {
    const options = catalog.find((row) => row.id === item.menuItemId)?.modifier_groups?.flatMap((group) => group.options) ?? []
    const selected = new Set(selectedStockOptionIds(item))
    const linked = options.flatMap((option) => {
      if (!selected.has(option.id) || !option.menu_item_id || option.stock_mode === 'simple') return []
      const ownRecipe = recipes.some((recipe) => recipe.menu_item_id === item.menuItemId &&
        (recipe.modifier_option_id === option.id || recipe.addon_id === option.id || recipe.variation_option_id === option.id))
      if (ownRecipe) return []
      return [{ menuItemId: option.menu_item_id, quantity: item.quantity * (item.addonQuantities?.[option.id] ?? 1) }]
    })
    const simple = new Set(options.filter((option) => option.stock_mode === 'simple').map((option) => option.id))
    if (simple.size === 0) return [item, ...linked]
    // A leftover recipe on an option using simple stock must not also consume ingredients.
    return [{ ...item,
      optionIds: item.optionIds?.filter((id) => !simple.has(id)),
      modifierOptionIds: item.modifierOptionIds?.filter((id) => !simple.has(id)),
      addonIds: item.addonIds?.filter((id) => !simple.has(id)),
    }, ...linked]
  })
}

export function simpleOptionDemands(items: readonly DepletionOrderItem[], catalog: readonly StockOptionCatalogItem[]) {
  const totals = new Map<string, { menuItemId: string; optionId: string; quantity: number; available: number; name: string }>()
  for (const item of items) {
    const options = catalog.find((row) => row.id === item.menuItemId)?.modifier_groups?.flatMap((group) => group.options) ?? []
    for (const id of selectedStockOptionIds(item)) {
      const option = options.find((option) => option.id === id && option.stock_mode === 'simple')
      if (!option) continue
      const quantity = item.quantity * (item.addonQuantities?.[id] ?? 1)
      const key = JSON.stringify([item.menuItemId, id])
      const previous = totals.get(key)
      totals.set(key, { menuItemId: item.menuItemId, optionId: id, quantity: (previous?.quantity ?? 0) + quantity,
        available: option.is_available === false ? 0 : option.stock_qty ?? 0, name: option.name })
    }
  }
  return [...totals.values()]
}
