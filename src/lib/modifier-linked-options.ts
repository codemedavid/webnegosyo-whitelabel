/**
 * Menu-item-linked modifier options.
 *
 * An option may carry `menu_item_id` instead of a typed name and price. The link
 * is a **live reference**: only the id is stored, and the name, price and image
 * are read from the linked menu item at render time — so repricing a drink
 * updates every add-on group that offers it, with no re-attaching.
 *
 * Resolution is a pure step applied to already-normalized groups. The storefront
 * collects the linked ids (`collectLinkedItemIds`), fetches those items, then
 * resolves (`resolveLinkedOptions`). Keeping it pure means the pricing and
 * availability rules are testable without a database, and it composes with the
 * existing selection adapter unchanged: a resolved option is an ordinary
 * `ModifierOption`, so the cart still folds it into the parent line.
 */

import type { ModifierGroup, ModifierOption } from '@/types/database'

/** The fields a linked menu item contributes to an option. */
export interface LinkedItemSnapshot {
  id: string
  name: string
  price: number
  discounted_price?: number | null
  image_url?: string | null
  is_available: boolean
}

/**
 * Label shown when an option's linked item can no longer be read (deleted, or
 * outside the fetched set). Rendering the raw empty name would show a blank,
 * unexplained chip, so the option is labelled and disabled instead.
 */
export const MISSING_LINKED_ITEM_LABEL = 'Unavailable item'

/** Every distinct menu item id referenced by these groups, in first-seen order. */
export function collectLinkedItemIds(groups: readonly ModifierGroup[]): string[] {
  const ids: string[] = []
  const seen = new Set<string>()

  for (const group of groups) {
    for (const option of group.options) {
      const id = option.menu_item_id
      if (id && !seen.has(id)) {
        seen.add(id)
        ids.push(id)
      }
    }
  }

  return ids
}

/** The price a linked item contributes: its sale price when genuinely cheaper. */
function effectivePrice(item: LinkedItemSnapshot): number {
  const discounted = item.discounted_price
  return discounted != null && discounted < item.price ? discounted : item.price
}

function resolveOption(
  option: ModifierOption,
  linkedItems: ReadonlyMap<string, LinkedItemSnapshot>,
): ModifierOption {
  if (!option.menu_item_id) {
    return option
  }

  const item = linkedItems.get(option.menu_item_id)

  // Deleted, or not in the fetched set — keep the option visible but inert so a
  // stale link can never be ordered.
  if (!item) {
    return { ...option, name: MISSING_LINKED_ITEM_LABEL, is_available: false }
  }

  return {
    ...option,
    name: item.name,
    price_modifier: effectivePrice(item),
    image_url: item.image_url ?? undefined,
    // An unavailable linked item disables the option regardless of the
    // option's own toggle; `isOptionAvailable` then reads false.
    is_available: item.is_available === false ? false : option.is_available,
  }
}

/**
 * Return the groups with every linked option resolved against the fetched
 * catalog. Typed options and group-level selection rules pass through
 * untouched. Never mutates the input.
 */
export function resolveLinkedOptions(
  groups: readonly ModifierGroup[],
  linkedItems: ReadonlyMap<string, LinkedItemSnapshot>,
): ModifierGroup[] {
  return groups.map((group) => ({
    ...group,
    options: group.options.map((option) => resolveOption(option, linkedItems)),
  }))
}
