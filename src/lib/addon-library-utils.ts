/**
 * Client-safe pure helpers + schema for the reusable add-on library.
 *
 * No server-only imports live here so this module can be bundled into client
 * components (the item-editor library picker). The server service
 * (`addon-library-service.ts`) re-exports these.
 */

import { z } from 'zod'
import type { Addon, AddonLibraryEntry, MenuItem } from '@/types/database'

export const addonLibraryEntrySchema = z.object({
  name: z.string().min(1, 'Add-on name is required'),
  price: z.number().min(0, 'Price must be non-negative'),
  source_menu_item_id: z.string().uuid('Must be a valid menu item').nullable().optional().default(null),
  image_url: z.string().url('Must be a valid URL').nullable().optional().default(null),
  is_active: z.boolean().default(true),
  display_order: z.number().int().min(0).default(0),
})

export type AddonLibraryInput = z.input<typeof addonLibraryEntrySchema>

type IdFactory = () => string

const defaultMakeId: IdFactory = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `addon_${Math.round(Math.random() * 1e9)}`

/**
 * Copy a library entry into an Addon snapshot with a fresh, independent id.
 * Library-only fields (tenant_id, source_menu_item_id, ...) are intentionally
 * dropped so the snapshot matches the existing MenuItem.addons shape exactly.
 */
export function libraryEntryToAddon(entry: AddonLibraryEntry, makeId: IdFactory = defaultMakeId): Addon {
  return { id: makeId(), name: entry.name, price: entry.price }
}

/** Prefill a library draft from an existing menu item (name + effective price). */
export function buildLibraryDraftFromMenuItem(
  item: Pick<MenuItem, 'id' | 'name' | 'price'> & { discounted_price?: number | null },
): Pick<AddonLibraryInput, 'name' | 'price' | 'source_menu_item_id'> {
  return {
    name: item.name,
    price: item.discounted_price ?? item.price,
    source_menu_item_id: item.id,
  }
}

/**
 * Append snapshots of library entries to an item's existing add-ons, skipping
 * any whose name already exists (case-insensitive) either on the item or
 * earlier in the incoming batch. Returns a new array (immutable).
 */
export function attachEntriesToAddons(
  existingAddons: readonly Addon[],
  entries: readonly AddonLibraryEntry[],
  makeId: IdFactory = defaultMakeId,
): Addon[] {
  const seen = new Set(existingAddons.map((a) => a.name.trim().toLowerCase()))
  const result: Addon[] = [...existingAddons]

  for (const entry of entries) {
    const key = entry.name.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(libraryEntryToAddon(entry, makeId))
  }

  return result
}
