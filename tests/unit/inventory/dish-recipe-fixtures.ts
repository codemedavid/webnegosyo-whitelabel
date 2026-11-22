import type { InventoryUnit } from '@/lib/inventory/unit-conversion'
import type { DishRecipeGroup } from '@/lib/inventory/dish-recipe/model'

export const UNITS: InventoryUnit[] = [
  { id: 'g', name: 'gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1 },
  { id: 'kg', name: 'kilogram', abbreviation: 'kg', dimension: 'weight', to_base_factor: 1000 },
  { id: 'ml', name: 'millilitre', abbreviation: 'ml', dimension: 'volume', to_base_factor: 1 },
  { id: 'l', name: 'litre', abbreviation: 'l', dimension: 'volume', to_base_factor: 1000 },
  { id: 'pc', name: 'piece', abbreviation: 'pc', dimension: 'count', to_base_factor: 1 },
]

export const SIZE: DishRecipeGroup = {
  id: 'size',
  name: 'Size',
  isPickOne: true,
  isRequired: true,
  options: [
    { id: 'small', name: 'Small', targetType: 'modifier_option' },
    { id: 'medium', name: 'Medium', targetType: 'modifier_option' },
    { id: 'large', name: 'Large', targetType: 'modifier_option' },
  ],
}

export const SUGAR: DishRecipeGroup = {
  id: 'sugar',
  name: 'Sugar level',
  isPickOne: true,
  isRequired: false,
  options: [
    { id: 's25', name: '25%', targetType: 'modifier_option' },
    { id: 's100', name: '100%', targetType: 'modifier_option' },
  ],
}

export const ADDONS: DishRecipeGroup = {
  id: 'addons',
  name: 'Add-ons',
  isPickOne: false,
  isRequired: false,
  options: [
    { id: 'pearl', name: 'Pearl', targetType: 'modifier_option' },
    { id: 'shot', name: 'Extra shot', targetType: 'modifier_option' },
  ],
}

export const GROUPS: DishRecipeGroup[] = [SIZE, SUGAR, ADDONS]

export const INGREDIENTS = new Map(
  [
    ['milk', 'Fresh milk', 'ml'],
    ['beans', 'Espresso beans', 'g'],
    ['cup', 'Cup', 'pc'],
    ['cone', 'Cone', 'pc'],
    ['pearl', 'Pearl', 'g'],
    ['syrup', 'Fructose', 'ml'],
  ].map(([id, name, stock]) => [id, { name, stock_unit_id: stock }]),
)
