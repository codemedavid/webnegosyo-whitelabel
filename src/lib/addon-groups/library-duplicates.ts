/**
 * Identical copies in the add-on group library.
 *
 * "Save to library" from the dish editor files a new row every tap, so a store
 * trying to reuse a group ended up with 27 rows of one "Add-ons" group (half at
 * ₱0, half priced) that the picker showed under one name. Two rows are copies
 * only when everything a diner would meet is the same: name (loosely), mode,
 * rules, and each option's name and price in order. Pure.
 */

import type { ModifierGroupLibraryEntry } from '@/types/database'

type GroupShape = Pick<ModifierGroupLibraryEntry, 'name' | 'selection_mode' | 'min_select' | 'max_select'> & {
  options: ReadonlyArray<
    Pick<ModifierGroupLibraryEntry['options'][number], 'name' | 'price_modifier' | 'display_order'> &
      Partial<Pick<ModifierGroupLibraryEntry['options'][number], 'menu_item_id' | 'is_default'>>
  >
}

function signature(entry: GroupShape): string {
  const options = [...entry.options]
    .sort((a, b) => a.display_order - b.display_order)
    .map((option) => [
      option.name.trim().toLowerCase(),
      option.price_modifier,
      option.menu_item_id ?? null,
      option.is_default === true,
    ])
  return JSON.stringify([
    entry.name.trim().toLowerCase(),
    entry.selection_mode ?? 'choice',
    entry.min_select,
    entry.max_select,
    options,
  ])
}

/** True when a diner could not tell the two groups apart. */
export function isSameLibraryGroup(a: GroupShape, b: GroupShape): boolean {
  return signature(a) === signature(b)
}

/** Survivor order: an active row before a hidden one, then the oldest. */
const byAge = (a: ModifierGroupLibraryEntry, b: ModifierGroupLibraryEntry): number =>
  Number(b.is_active) - Number(a.is_active) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)

/** Each distinct group once (its oldest active row), with how many rows share it. */
export function uniqueLibraryGroups(
  entries: readonly ModifierGroupLibraryEntry[]
): Array<{ entry: ModifierGroupLibraryEntry; copies: number }> {
  const sets = [...entries].sort(byAge).reduce((acc, entry) => {
    const key = signature(entry)
    const found = acc.get(key)
    return new Map(acc).set(key, found ? { ...found, copies: found.copies + 1 } : { entry, copies: 1 })
  }, new Map<string, { entry: ModifierGroupLibraryEntry; copies: number }>())
  return [...sets.values()]
}

/** Ids of every row that repeats an older identical row. */
export function duplicateCopyIds(entries: readonly ModifierGroupLibraryEntry[]): string[] {
  const kept = new Set(uniqueLibraryGroups(entries).map(({ entry }) => entry.id))
  return entries.filter((entry) => !kept.has(entry.id)).map((entry) => entry.id)
}
