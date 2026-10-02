/**
 * Moves between the two stored shapes of a dish's choices without losing what
 * the owner typed.
 *
 * A flat size list (`menu_items.variations`) is kept as-is until the owner
 * asks for a second choice. The menu cards read that list for "from ₱" and
 * "3 sizes available", so it is never rewritten behind their back. Once a
 * second choice is needed the sizes become the first choice list, "Size".
 */

import type { Variation, VariationType } from '@/types/database'

export const SIZE_GROUP_NAME = 'Size'

export function sizesToChoiceGroup(sizes: readonly Variation[], id: string): VariationType {
  return {
    id,
    name: SIZE_GROUP_NAME,
    is_required: true,
    display_order: 0,
    options: sizes.map((size, index) => ({
      id: size.id,
      name: size.name,
      price_modifier: size.price_modifier,
      is_default: Boolean(size.is_default),
      display_order: index,
    })),
  }
}

/**
 * A customer picks ONE option from a list, so at most one can be pre-selected.
 * Tapping the current default again clears it.
 */
export function withExclusiveDefault<T extends { is_default?: boolean }>(options: readonly T[], index: number): T[] {
  const isClearing = Boolean(options[index]?.is_default)
  return options.map((option, i) => ({ ...option, is_default: !isClearing && i === index }))
}
