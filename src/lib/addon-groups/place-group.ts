/**
 * Putting saved add-on groups and single add-ons onto one dish's groups.
 *
 * Pure and client-safe: the dish editor's "Add from library" and the server's
 * "Insert into dishes" both go through here, so they agree on what happens when
 * a dish already has a group of the same name. The old attach always skipped
 * it, which is how a ₱0 "Add-ons" group from a menu import could never be
 * fixed from the library.
 */

import { libraryEntryToModifierGroup } from '@/lib/modifier-library-utils'
import type { AddonLibraryEntry, ModifierGroup, ModifierGroupLibraryEntry } from '@/types/database'

/** What to do when the dish already has a group with the library group's name. */
export type GroupConflict = 'replace' | 'skip'
export type PlaceOutcome = 'added' | 'replaced' | 'skipped'

type IdFactory = () => string

export const DEFAULT_ADDON_GROUP_NAME = 'Add-ons'

export const groupNameKey = (name: string): string => name.trim().toLowerCase()

const nextDisplayOrder = (groups: readonly ModifierGroup[]): number =>
  groups.reduce((max, group) => Math.max(max, group.display_order), -1) + 1

/** The index of the dish's group named like `name`, or -1. */
export function findGroupByName(groups: readonly ModifierGroup[], name: string): number {
  const key = groupNameKey(name)
  return groups.findIndex((group) => groupNameKey(group.name) === key)
}

/**
 * Add a fresh-id copy of the library group, or replace the dish's same-name
 * group with it (keeping that group's place), or leave the dish as it is.
 */
export function placeLibraryGroup(
  groups: readonly ModifierGroup[],
  entry: ModifierGroupLibraryEntry,
  onConflict: GroupConflict,
  makeId: IdFactory
): { groups: ModifierGroup[]; outcome: PlaceOutcome } {
  const existing = findGroupByName(groups, entry.name)
  if (existing !== -1 && onConflict === 'skip') return { groups: [...groups], outcome: 'skipped' }

  const snapshot = libraryEntryToModifierGroup(entry, makeId)
  if (existing === -1) {
    return { groups: [...groups, { ...snapshot, display_order: nextDisplayOrder(groups) }], outcome: 'added' }
  }
  return {
    groups: groups.map((group, index) =>
      index === existing ? keepOptionIdentity(group, { ...snapshot, display_order: group.display_order }) : group
    ),
    outcome: 'replaced',
  }
}

/**
 * A replaced group keeps, per option name, the old option's id and its stock
 * state. The id is what saved carts and stock ceilings point at, and an
 * unchanged counter is then omitted on save so the database keeps the live
 * count (`omitUnchangedOptionStock`). New names get the fresh snapshot ids.
 */
function keepOptionIdentity(previous: ModifierGroup, replacement: ModifierGroup): ModifierGroup {
  const byName = new Map(previous.options.map((option) => [groupNameKey(option.name), option] as const))
  return {
    ...replacement,
    options: replacement.options.map((option) => {
      const old = byName.get(groupNameKey(option.name))
      if (!old) return option
      return {
        ...option,
        id: old.id,
        ...(old.stock_mode !== undefined ? { stock_mode: old.stock_mode } : {}),
        ...(old.stock_qty !== undefined ? { stock_qty: old.stock_qty } : {}),
        ...(old.is_available !== undefined ? { is_available: old.is_available } : {}),
      }
    }),
  }
}

/** The dish's add-ons group: one named "Add-ons" first, else its first quantity group. */
function addonGroupIndex(groups: readonly ModifierGroup[]): number {
  const named = groups.findIndex(
    (group) => group.selection_mode === 'quantity' && groupNameKey(group.name) === groupNameKey(DEFAULT_ADDON_GROUP_NAME)
  )
  return named !== -1 ? named : groups.findIndex((group) => group.selection_mode === 'quantity')
}

/**
 * Add single library add-ons as options of the dish's add-ons group (created,
 * optional, when it has none). A name the group already has is skipped.
 */
export function addSingleAddons(
  groups: readonly ModifierGroup[],
  addons: readonly AddonLibraryEntry[],
  makeId: IdFactory
): { groups: ModifierGroup[]; added: number } {
  const target = addonGroupIndex(groups)
  const base: ModifierGroup =
    target === -1
      ? {
          id: makeId(),
          name: DEFAULT_ADDON_GROUP_NAME,
          selection_mode: 'quantity',
          display_order: nextDisplayOrder(groups),
          min_select: 0,
          max_select: null,
          options: [],
        }
      : groups[target]

  const taken = new Set(base.options.map((option) => groupNameKey(option.name)))
  const fresh = addons.filter((addon) => {
    const key = groupNameKey(addon.name)
    if (key === '' || taken.has(key)) return false
    taken.add(key)
    return true
  })
  if (fresh.length === 0) return { groups: [...groups], added: 0 }

  const start = base.options.reduce((max, option) => Math.max(max, option.display_order), -1) + 1
  const merged: ModifierGroup = {
    ...base,
    options: [
      ...base.options,
      ...fresh.map((addon, index) => ({
        id: makeId(),
        name: addon.name,
        price_modifier: addon.price,
        display_order: start + index,
      })),
    ],
  }

  return {
    groups: target === -1 ? [...groups, merged] : groups.map((group, index) => (index === target ? merged : group)),
    added: fresh.length,
  }
}
