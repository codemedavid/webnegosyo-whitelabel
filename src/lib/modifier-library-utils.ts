/**
 * Client-safe pure helpers + schema for the reusable modifier-group library.
 *
 * A library entry is a per-tenant modifier-group definition (name + min/max
 * selection rules + option list). Attaching one copies a fresh-id snapshot into
 * `menu_items.modifier_groups` (snapshot-on-attach), so the storefront / cart /
 * order runtime is unchanged and later edits to the library never retroactively
 * mutate items already using a group.
 *
 * No server-only imports live here so the module can be bundled into the client
 * item-editor picker. The server service re-exports these.
 */

import { z } from 'zod'
import type { ModifierGroup, ModifierGroupLibraryEntry, ModifierOption } from '@/types/database'

/** A library option carries the option definition only — never per-item stock. */
const modifierOptionInputSchema = z.object({
  name: z.string().min(1, 'Option name is required'),
  price_modifier: z.number().default(0),
  image_url: z.string().url('Must be a valid URL').nullable().optional(),
  is_default: z.boolean().optional(),
  display_order: z.number().int().min(0).default(0),
  manual_cost: z.number().min(0, 'Cost must be non-negative').optional(),
})

export const modifierGroupLibraryEntrySchema = z
  .object({
    name: z.string().min(1, 'Group name is required'),
    min_select: z.number().int().min(0).default(0),
    // null → unlimited multi-select; 1 → single-select; N → capped multi-select.
    max_select: z.number().int().min(1).nullable().default(null),
    options: z.array(modifierOptionInputSchema).min(1, 'Add at least one option'),
    source_menu_item_id: z.string().uuid('Must be a valid menu item').nullable().optional().default(null),
    is_active: z.boolean().default(true),
    display_order: z.number().int().min(0).default(0),
  })
  .refine((g) => g.max_select === null || g.max_select >= g.min_select, {
    message: 'max_select cannot be smaller than min_select',
    path: ['max_select'],
  })

export type ModifierGroupLibraryInput = z.input<typeof modifierGroupLibraryEntrySchema>

type IdFactory = () => string

const defaultMakeId: IdFactory = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `mg_${Math.round(Math.random() * 1e9)}`

/**
 * Copy one library option into a menu-item ModifierOption with a fresh id.
 * Per-item stock fields (`stock_mode`, `stock_qty`, `is_available`) are
 * intentionally NOT copied — stock is per-item runtime state, not a reusable
 * library property.
 */
function libraryOptionToModifierOption(
  option: ModifierOption,
  displayOrder: number,
  makeId: IdFactory,
): ModifierOption {
  const snapshot: ModifierOption = {
    id: makeId(),
    name: option.name,
    price_modifier: option.price_modifier,
    display_order: displayOrder,
  }
  if (option.image_url !== undefined) snapshot.image_url = option.image_url
  if (option.is_default !== undefined) snapshot.is_default = option.is_default
  if (option.manual_cost !== undefined) snapshot.manual_cost = option.manual_cost
  return snapshot
}

/**
 * Copy a library entry into a menu-item ModifierGroup with a fresh group id and
 * fresh option ids. Preserves name + selection rules + option definitions.
 */
export function libraryEntryToModifierGroup(
  entry: ModifierGroupLibraryEntry,
  makeId: IdFactory = defaultMakeId,
): ModifierGroup {
  return {
    id: makeId(),
    name: entry.name,
    display_order: entry.display_order,
    min_select: entry.min_select,
    max_select: entry.max_select,
    options: entry.options.map((o, index) => libraryOptionToModifierOption(o, index, makeId)),
  }
}

/**
 * Prefill a library draft (validation input) from an existing item group.
 * Runtime ids and per-item stock are stripped so the result is clean library
 * input.
 */
export function buildLibraryDraftFromGroup(
  group: ModifierGroup,
): Pick<ModifierGroupLibraryInput, 'name' | 'min_select' | 'max_select' | 'options'> {
  return {
    name: group.name,
    min_select: group.min_select,
    max_select: group.max_select,
    options: group.options.map((o) => ({
      name: o.name,
      price_modifier: o.price_modifier,
      image_url: o.image_url ?? null,
      is_default: o.is_default,
      display_order: o.display_order,
      manual_cost: o.manual_cost,
    })),
  }
}

/**
 * Append snapshots of library entries to an item's existing groups, skipping any
 * whose group name already exists (case-insensitive) on the item or earlier in
 * the batch. New groups are ordered after the current maximum `display_order` so
 * they sort last. Returns a new array (immutable).
 */
export function attachEntriesToGroups(
  existingGroups: readonly ModifierGroup[],
  entries: readonly ModifierGroupLibraryEntry[],
  makeId: IdFactory = defaultMakeId,
): ModifierGroup[] {
  const seen = new Set(existingGroups.map((g) => g.name.trim().toLowerCase()))
  const result: ModifierGroup[] = [...existingGroups]
  let nextOrder =
    existingGroups.reduce((max, g) => Math.max(max, g.display_order), -1) + 1

  for (const entry of entries) {
    const key = entry.name.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const group = libraryEntryToModifierGroup(entry, makeId)
    result.push({ ...group, display_order: nextOrder })
    nextOrder += 1
  }

  return result
}
