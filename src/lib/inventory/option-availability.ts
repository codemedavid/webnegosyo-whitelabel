/**
 * Recipe-tracked option availability on the storefront.
 *
 * `isOptionAvailable` (modifier-groups.ts) answers from the option's own JSON:
 * the merchant's toggle and a simple-stock count. An option whose stock lives in
 * its RECIPE needs the shelf, which only the server knows — `/api/inventory/
 * ceilings` returns, per dish, how many can be made with each such option
 * (`resolveOptionCeilings`, the same arithmetic checkout refuses with). These
 * pure helpers fold that answer into the groups the product page already
 * renders, so a sold-out choice is shown as sold out everywhere downstream
 * (chips, default picks, validation) without a second availability rule.
 *
 * Absent from the ceilings means no opinion (inventory off, untracked, a
 * branch with no row for the ingredient): the option stays as it was.
 */

import type { ModifierGroup } from '@/types/database'

/** Option id → whole units of the dish producible with it. */
export type OptionCeilings = ReadonlyMap<string, number>

/** The options of one dish that cannot be made even once. */
export function soldOutOptionIds(ceilings: OptionCeilings | undefined): Set<string> {
  if (!ceilings) return new Set()
  return new Set([...ceilings].flatMap(([optionId, units]) => (units <= 0 ? [optionId] : [])))
}

/**
 * The groups with every sold-out recipe option marked unavailable. A
 * simple-stock option keeps its own counter as the truth. Never mutates; hands
 * back the same array when nothing changes so memoised consumers stay put.
 */
export function withRecipeStockAvailability(
  groups: ModifierGroup[],
  soldOut: ReadonlySet<string>,
): ModifierGroup[] {
  if (soldOut.size === 0) return groups
  const affects = (id: string, mode: string | undefined) => soldOut.has(id) && mode !== 'simple'
  if (!groups.some((group) => group.options.some((option) => affects(option.id, option.stock_mode)))) {
    return groups
  }
  return groups.map((group) => ({
    ...group,
    options: group.options.map((option) =>
      affects(option.id, option.stock_mode) ? { ...option, is_available: false } : option,
    ),
  }))
}

/**
 * How many of a dish can be made in the configuration being picked: the
 * tightest of the dish's own ceiling and each picked option's. `null` (no
 * ceiling) only when none of them is tracked.
 */
export function configurationCeiling(
  dishCeiling: number | null,
  optionCeilings: OptionCeilings | undefined,
  selectedOptionIds: readonly string[],
): number | null {
  const ceilings = [
    ...(dishCeiling === null ? [] : [dishCeiling]),
    ...[...new Set(selectedOptionIds)].flatMap((id) => {
      const units = optionCeilings?.get(id)
      return units === undefined ? [] : [units]
    }),
  ]
  return ceilings.length === 0 ? null : Math.min(...ceilings)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/**
 * `optionCeilings` from the ceilings route, as maps. It crossed the network, so
 * anything malformed is dropped rather than trusted: a bad entry means "no
 * opinion", never "sold out".
 */
export function parseOptionCeilings(raw: unknown): Map<string, Map<string, number>> {
  if (!isRecord(raw)) return new Map()
  const dishes = new Map<string, Map<string, number>>()
  for (const [menuItemId, byOption] of Object.entries(raw)) {
    if (!isRecord(byOption)) continue
    const options = new Map<string, number>()
    for (const [optionId, units] of Object.entries(byOption)) {
      if (typeof units === 'number' && Number.isFinite(units)) options.set(optionId, units)
    }
    dishes.set(menuItemId, options)
  }
  return dishes
}
