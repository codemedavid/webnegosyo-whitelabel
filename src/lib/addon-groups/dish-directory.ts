/**
 * The dish list behind "Insert into dishes". Pure: the page reads the rows.
 *
 * Group names come through `normalizeModifierGroups`, so a dish that still
 * carries only legacy add-ons reports "Add-ons" — the name the insert will
 * collide with.
 */

import { normalizeModifierGroups, type ModifierSource } from '@/lib/modifier-groups'
import { groupNameKey } from '@/lib/addon-groups/place-group'

export interface DishRef {
  id: string
  name: string
  categoryName: string
  groupNames: string[]
}

export type DirectoryDishRow = ModifierSource & { id: string; name: string; category_id?: string | null }

export interface DirectoryCategoryRow {
  id: string
  name: string
  order?: number | null
}

const UNCATEGORISED = 'Other'

export function buildDishDirectory(
  dishes: readonly DirectoryDishRow[],
  categories: readonly DirectoryCategoryRow[]
): DishRef[] {
  const rank = new Map(
    [...categories]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((category, index) => [category.id, { index, name: category.name }] as const)
  )
  const placed = dishes.map((dish, index) => ({
    dish,
    index,
    category: dish.category_id ? rank.get(dish.category_id) : undefined,
  }))

  return placed
    .sort((a, b) => (a.category?.index ?? Infinity) - (b.category?.index ?? Infinity) || a.index - b.index)
    .map(({ dish, category }) => ({
      id: dish.id,
      name: dish.name,
      categoryName: category?.name ?? UNCATEGORISED,
      groupNames: normalizeModifierGroups(dish).map((group) => group.name),
    }))
}

/** How many of the chosen dishes already have a group named like `groupName`. */
export function countSameNameGroups(dishes: readonly DishRef[], chosen: ReadonlySet<string>, groupName: string): number {
  const key = groupNameKey(groupName)
  return dishes.filter((dish) => chosen.has(dish.id) && dish.groupNames.some((name) => groupNameKey(name) === key)).length
}
