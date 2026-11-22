/**
 * Mistakes a dish's recipes are likely to hold, said in the owner's words.
 * Nothing here changes data: each issue offers a fix the owner taps.
 *
 * Both checks come from live stores (2026-11-21):
 *   - counted twice: a store typed the whole recipe into every flavour AND the
 *     dish, so each sale would take two cones;
 *   - same for every size: 85% of dishes with sizes and a recipe deduct the
 *     same for a Large as for a Small.
 */

import {
  convertBetween,
  roundQuantity,
  tableGroups,
  toTicks,
  unitLookup,
  type DishRecipeDraft,
  type DishRecipeGroup,
  type DishRecipes,
  type RecipeLine,
} from '@/lib/inventory/dish-recipe/model'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'

export interface CountedTwiceIssue {
  kind: 'counted_twice'
  /** Stable while the stored recipe is the same. */
  id: string
  groupId: string
  groupName: string
  inventoryItemId: string
  /** What the dish recipe holds, in `unitId`. */
  baseQuantity: number
  unitId: string
}

export interface SameForEverySizeIssue {
  kind: 'same_for_every_size'
  id: string
  groupId: string
  groupName: string
}

export type DishRecipeIssue = CountedTwiceIssue | SameForEverySizeIssue

/**
 * Words that make a list (or its choices) a size: what a bigger version uses
 * more of. English + Filipino menus.
 */
const SIZE_WORDS =
  /\b(size|sizes|small|medium|large|regular|grande|venti|tall|solo|sharing|pax|family|barkada|half|whole|jumbo|mini|petite|xl|xs)\b|\d+\s?(oz|ml|l|ltr|liter|litre|inch|in|"|pcs|pc)\b/i

export function isSizeGroup(group: DishRecipeGroup): boolean {
  if (SIZE_WORDS.test(group.name)) return true
  return group.options.filter((option) => SIZE_WORDS.test(option.name)).length >= 2
}

function sameAmount(line: RecipeLine, quantity: number, unitId: string, units: ReturnType<typeof unitLookup>): boolean {
  const converted = convertBetween(line.quantity, line.unitId, unitId, units)
  return converted !== null && toTicks(converted) === toTicks(quantity)
}

/**
 * The dish recipe holds an ingredient AND every choice of a pick-one list
 * holds the same amount of it again, so every sale takes it twice. Only an
 * exact repeat is flagged: a choice adding a different amount is how "a Large
 * uses more" was stored before the table existed.
 */
export function findCountedTwice(
  stored: DishRecipes,
  groups: readonly DishRecipeGroup[],
  units: readonly InventoryUnit[],
): CountedTwiceIssue[] {
  const lookup = unitLookup(units)
  const issues: CountedTwiceIssue[] = []
  for (const group of tableGroups(groups)) {
    for (const baseLine of stored.base) {
      const repeatedEverywhere = group.options.every((option) =>
        (stored.options[option.id] ?? []).some(
          (line) => line.inventoryItemId === baseLine.inventoryItemId && sameAmount(line, baseLine.quantity, baseLine.unitId, lookup),
        ),
      )
      if (!repeatedEverywhere) continue
      issues.push({
        kind: 'counted_twice',
        id: `twice:${group.id}:${baseLine.inventoryItemId}`,
        groupId: group.id,
        groupName: group.name,
        inventoryItemId: baseLine.inventoryItemId,
        baseQuantity: baseLine.quantity,
        unitId: baseLine.unitId,
      })
    }
  }
  // One issue per ingredient and list, even if the dish held it on two lines.
  return issues.filter((issue, index) => issues.findIndex((other) => other.id === issue.id) === index)
}

/** A size list on a dish with a recipe, and no size changes anything. */
export function findSameForEverySize(stored: DishRecipes, groups: readonly DishRecipeGroup[]): SameForEverySizeIssue[] {
  if (stored.base.length === 0) return []
  return tableGroups(groups)
    .filter((group) => isSizeGroup(group))
    .filter((group) => group.options.every((option) => (stored.options[option.id] ?? []).length === 0))
    .map((group) => ({ kind: 'same_for_every_size' as const, id: `same:${group.id}`, groupId: group.id, groupName: group.name }))
}

export function findDishRecipeIssues(
  stored: DishRecipes,
  groups: readonly DishRecipeGroup[],
  units: readonly InventoryUnit[],
): DishRecipeIssue[] {
  return [...findCountedTwice(stored, groups, units), ...findSameForEverySize(stored, groups)]
}

/**
 * "Count it once": keep the ingredient in the dish recipe and take the repeat
 * out of the list's choices. Works on the draft wherever the repeat is shown:
 * in the table (each version drops by the dish's amount) or in the choices'
 * "each pick adds" lines.
 */
export function countOnce(
  draft: DishRecipeDraft,
  groups: readonly DishRecipeGroup[],
  issue: CountedTwiceIssue,
  units: readonly InventoryUnit[],
): DishRecipeDraft {
  const group = groups.find((candidate) => candidate.id === issue.groupId)
  if (!group) return draft
  const lookup = unitLookup(units)

  if (draft.byGroupId === issue.groupId) {
    return {
      ...draft,
      rows: draft.rows.map((row) => {
        if (row.inventoryItemId !== issue.inventoryItemId) return row
        const repeat = convertBetween(issue.baseQuantity, issue.unitId, row.unitId, lookup)
        if (repeat === null) return row
        // Only a version still holding the repeat on top of the dish's own
        // amount drops; one the owner already fixed by hand stays as typed.
        const amounts = Object.fromEntries(
          Object.entries(row.amounts).map(([column, amount]) => {
            const left = roundQuantity((amount ?? 0) - repeat)
            return [column, toTicks(left) >= toTicks(repeat) ? left : amount]
          }),
        )
        return { ...row, amounts }
      }),
    }
  }

  const picks = { ...draft.picks }
  for (const option of group.options) {
    picks[option.id] = (picks[option.id] ?? []).filter((line) => {
      if (line.inventoryItemId !== issue.inventoryItemId || line.quantity === null) return true
      return !sameAmount(
        { inventoryItemId: line.inventoryItemId, quantity: line.quantity, unitId: line.unitId },
        issue.baseQuantity,
        issue.unitId,
        lookup,
      )
    })
  }
  return { ...draft, picks }
}
