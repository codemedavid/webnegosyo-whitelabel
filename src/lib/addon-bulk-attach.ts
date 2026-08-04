/**
 * Attach reusable library add-ons to many menu items in one call.
 *
 * Attaching is SNAPSHOT-ON-ATTACH (see `addon-library-service`): a
 * `{id, name, price}` copy of the entry is written into `menu_items.addons`, so
 * the cart, checkout and order runtime keep working against plain data with no
 * reference to resolve.
 *
 * The dangerous part is that `menu_items.addons` is REPLACED on write, not
 * merged. Sending just the new entries would delete whatever per-item extras
 * the merchant had already set up — across every item in the batch, from one
 * tool call. So each item's current add-ons are read first and the merge runs
 * through `attachEntriesToAddons`, which is already name-deduped and tested.
 *
 * Everything is validated before anything is written: an unknown entry or item
 * aborts the whole batch rather than leaving it half-applied.
 */

import type { ProvisioningCtx } from '@/lib/provisioning/context'
import type { Addon, AddonLibraryEntry } from '@/types/database'
import { attachEntriesToAddons } from '@/lib/addon-library-utils'

interface MenuItemAddonsRow {
  id: string
  addons: Addon[] | null
}

export interface AttachAddonsResult {
  itemsUpdated: number
  addonsAttached: number
}

/** Throws listing the ids that were asked for but do not exist. */
function assertAllFound(requested: readonly string[], found: readonly string[], label: string): void {
  const have = new Set(found)
  const missing = requested.filter((id) => !have.has(id))
  if (missing.length > 0) {
    throw new Error(`Refusing to attach: ${missing.join(', ')} not found in this tenant's ${label}.`)
  }
}

/**
 * Attach every library entry in `entryIds` to every menu item in `itemIds`,
 * preserving each item's existing add-ons and skipping any already present by
 * name (so repeating the call is a no-op, not a duplicate).
 */
export async function attachAddonEntriesToItems(
  tenantId: string,
  itemIds: readonly string[],
  entryIds: readonly string[],
  ctx: ProvisioningCtx,
): Promise<AttachAddonsResult> {
  if (itemIds.length === 0) {
    throw new Error('Refusing to attach: no menu item ids were given.')
  }
  if (entryIds.length === 0) {
    throw new Error('Refusing to attach: no add-on library entry ids were given.')
  }

  const { data: entryData, error: entryError } = await ctx.client
    .from('addon_library')
    .select('id, name, price')
    .eq('tenant_id', tenantId)
    .in('id', entryIds as string[])

  if (entryError) {
    throw new Error(`Could not read the add-on library: ${entryError.message}`)
  }

  const entries = (entryData ?? []) as unknown as AddonLibraryEntry[]
  assertAllFound(entryIds, entries.map((e) => e.id), 'add-on library')

  const { data: itemData, error: itemError } = await ctx.client
    .from('menu_items')
    .select('id, addons')
    .eq('tenant_id', tenantId)
    .in('id', itemIds as string[])

  if (itemError) {
    throw new Error(`Could not read the menu items: ${itemError.message}`)
  }

  const items = (itemData ?? []) as unknown as MenuItemAddonsRow[]
  assertAllFound(itemIds, items.map((i) => i.id), 'menu items')

  // Merge first, write second: every item's new array is computed before any of
  // them is persisted, so a validation failure cannot leave a half-applied batch.
  const merged = items.map((item) => ({
    id: item.id,
    addons: attachEntriesToAddons(item.addons ?? [], entries),
  }))

  const results = await Promise.all(
    merged.map((m) =>
      ctx.client
        .from('menu_items')
        .update({ addons: m.addons } as never)
        .eq('id', m.id)
        .eq('tenant_id', tenantId),
    ),
  )

  const failure = results.find((r) => r?.error)
  if (failure?.error) {
    throw new Error(`Failed to attach add-ons: ${failure.error.message}`)
  }

  return { itemsUpdated: merged.length, addonsAttached: entries.length }
}
