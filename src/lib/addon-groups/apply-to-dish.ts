/**
 * The write "Insert into dishes" makes on one dish.
 *
 * A dish may still carry only the legacy columns (a menu import writes
 * `variation_types` + `addons`), so its current groups are read through
 * `normalizeModifierGroups`, the library group is placed, and the result is
 * written the way the dish editor saves: `modifier_groups` canonical, legacy
 * columns mirrored from it, unchanged stock counters omitted so the database
 * keeps the live count (`omitUnchangedOptionStock`). Pure.
 */

import { normalizeModifierGroups, type ModifierSource } from '@/lib/modifier-groups'
import {
  omitUnchangedOptionStock,
  serializeGroups,
  splitGroupsToLegacyColumns,
  type LegacyColumns,
} from '@/lib/modifier-groups-form'
import { placeLibraryGroup, type GroupConflict, type PlaceOutcome } from '@/lib/addon-groups/place-group'
import type { ModifierGroup, ModifierGroupLibraryEntry } from '@/types/database'

export interface DishOptionsPatch extends LegacyColumns {
  modifier_groups: ModifierGroup[]
}

export interface ApplyToDishResult {
  outcome: PlaceOutcome
  /** Null when nothing is to be written. */
  patch: DishOptionsPatch | null
}

export function applyLibraryGroupToDish(
  dish: ModifierSource,
  entry: ModifierGroupLibraryEntry,
  onConflict: GroupConflict,
  makeId: () => string
): ApplyToDishResult {
  const current = normalizeModifierGroups(dish)
  const placed = placeLibraryGroup(current, entry, onConflict, makeId)
  if (placed.outcome === 'skipped') return { outcome: 'skipped', patch: null }

  const groups = serializeGroups(placed.groups)
  return {
    outcome: placed.outcome,
    patch: {
      ...splitGroupsToLegacyColumns(groups),
      modifier_groups: omitUnchangedOptionStock(groups, current),
    },
  }
}
