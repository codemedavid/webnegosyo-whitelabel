/**
 * Pulls the selected option and addon ids out of a cart line.
 *
 * The ids were never missing from the cart — `selected_variations` holds whole
 * option objects — they were simply dropped on the way to the order, which
 * carries `variation` as a comma-joined display string. Extracting them here,
 * before that flattening happens, is what lets depletion account for the
 * ingredients an option actually adds.
 */

import type { CartItem } from '@/types/database'

export interface OrderSelectionIds {
  /**
   * Selected variation options AND unified modifier options. Both arrive
   * through `selected_variations` and the cart cannot tell which recipe target
   * a given option belongs to, so callers pass this one set to both buckets:
   * ids are unique per option, so whichever target exists matches and the other
   * finds nothing.
   */
  optionIds: string[]
  addonIds: string[]
}

/** Keeps only real string ids — a legacy option saved before ids existed is skipped. */
function collectIds(values: ReadonlyArray<{ id?: string } | undefined>): string[] {
  return values.flatMap((value) =>
    value && typeof value.id === 'string' && value.id !== '' ? [value.id] : [],
  )
}

export function extractSelectionIds(item: CartItem): OrderSelectionIds {
  // The grouped map is the current format; a cart mid-migration can carry both,
  // and the grouped selections are what the item was actually configured with.
  const optionSources = item.selected_variations
    ? Object.values(item.selected_variations)
    : item.selected_variation
      ? [item.selected_variation]
      : []

  return {
    optionIds: collectIds(optionSources),
    addonIds: collectIds(item.selected_addons ?? []),
  }
}
