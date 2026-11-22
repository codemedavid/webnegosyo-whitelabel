/**
 * "Copy recipe from another dish": menus repeat one recipe across a series
 * (every "MILKTEA SERIES" flavour uses the same cup, tea and pearls), and
 * typing it 16 times is where owners give up.
 *
 * The dish recipe copies as is. A choice copies from the source choice with
 * the same name, in a list of the same name when there is one, else by name
 * alone ("Large" → "Large"). Choices with no match start empty. Pure.
 */

import type { DishRecipeGroup, DishRecipes, RecipeLine } from '@/lib/inventory/dish-recipe/model'

export function foldName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const cloneLines = (lines: readonly RecipeLine[]): RecipeLine[] => lines.map((line) => ({ ...line }))

export interface CopyResult {
  recipes: DishRecipes
  /** Target choices that found a source choice to copy from. */
  matchedOptionIds: string[]
}

export function copyDishRecipes(
  source: { groups: readonly DishRecipeGroup[]; recipes: DishRecipes },
  targetGroups: readonly DishRecipeGroup[],
): CopyResult {
  const byGroupAndName = new Map<string, string>()
  const byName = new Map<string, string>()
  for (const group of source.groups) {
    for (const option of group.options) {
      byGroupAndName.set(`${foldName(group.name)}::${foldName(option.name)}`, option.id)
      if (!byName.has(foldName(option.name))) byName.set(foldName(option.name), option.id)
    }
  }

  const options: Record<string, RecipeLine[]> = {}
  const matchedOptionIds: string[] = []
  for (const group of targetGroups) {
    for (const option of group.options) {
      const sourceId =
        byGroupAndName.get(`${foldName(group.name)}::${foldName(option.name)}`) ?? byName.get(foldName(option.name))
      const lines = sourceId ? source.recipes.options[sourceId] ?? [] : []
      options[option.id] = cloneLines(lines)
      if (sourceId) matchedOptionIds.push(option.id)
    }
  }

  return { recipes: { base: cloneLines(source.recipes.base), options }, matchedOptionIds }
}
