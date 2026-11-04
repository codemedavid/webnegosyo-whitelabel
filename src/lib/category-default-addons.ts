/**
 * A category's default add-ons, merged into one dish.
 *
 * They used to be merged only on the storefront's legacy add-on path, so on any
 * dish with option groups (every store now runs groups) they disappeared, and
 * checkout never priced them because the server only reads the dish's own JSON.
 * The item page and `load-line-pricing` both merge through here, so what the
 * diner can pick is exactly what the server can price.
 *
 * The dish wins on a shared name (case-insensitive), as before. Pure; returns
 * the SAME item when there is nothing to add.
 */

import type { Addon, ModifierGroup, ModifierOption } from '@/types/database'

/** Any dish shape: the server's rows carry untrusted JSON, the storefront typed groups. */
interface CategoryMergeSource {
  modifier_groups?: unknown
  addons?: unknown
}

/** Id of the group synthesised for a dish whose groups have no add-ons group. */
export const CATEGORY_ADDON_GROUP_ID = 'category-addons'

function isUsableAddon(value: unknown): value is Addon {
  const addon = value as Partial<Addon> | null
  return Boolean(
    addon &&
      typeof addon.id === 'string' && addon.id !== '' &&
      typeof addon.name === 'string' && addon.name.trim() !== '' &&
      typeof addon.price === 'number' && Number.isFinite(addon.price)
  )
}

const nameKey = (name: string): string => name.trim().toLowerCase()

function asOption(addon: Addon, displayOrder: number): ModifierOption {
  return { id: addon.id, name: addon.name, price_modifier: addon.price, display_order: displayOrder }
}

const optionsOf = (group: ModifierGroup): ModifierOption[] => (Array.isArray(group.options) ? group.options : [])

function mergeIntoGroups(groups: readonly ModifierGroup[], extras: readonly Addon[]): ModifierGroup[] {
  const taken = new Set(
    groups.flatMap((group) => optionsOf(group).map((option) => nameKey(typeof option.name === 'string' ? option.name : '')))
  )
  const fresh = extras.filter((addon) => !taken.has(nameKey(addon.name)))
  if (fresh.length === 0) return [...groups]

  const target = groups.findIndex((group) => group.selection_mode === 'quantity')
  if (target === -1) {
    return [
      ...groups,
      {
        id: CATEGORY_ADDON_GROUP_ID,
        name: 'Add-ons',
        selection_mode: 'quantity',
        display_order: 1000,
        min_select: 0,
        max_select: null,
        options: fresh.map((addon, index) => asOption(addon, index)),
      },
    ]
  }

  return groups.map((group, index) => {
    if (index !== target) return group
    const options = optionsOf(group)
    const start = options.reduce((max, option) => Math.max(max, Number(option.display_order) || 0), -1) + 1
    return { ...group, options: [...options, ...fresh.map((addon, i) => asOption(addon, start + i))] }
  })
}

export function withCategoryAddons<T extends CategoryMergeSource>(
  item: T,
  categoryAddons: readonly unknown[] | null | undefined
): T {
  const extras = (Array.isArray(categoryAddons) ? categoryAddons : []).filter(isUsableAddon)
  if (extras.length === 0) return item

  const groups = Array.isArray(item.modifier_groups) ? (item.modifier_groups as ModifierGroup[]) : []
  if (groups.length > 0) {
    return { ...item, modifier_groups: mergeIntoGroups(groups, extras) }
  }

  const own = Array.isArray(item.addons) ? (item.addons as Addon[]) : []
  const ownNames = new Set(own.map((addon) => nameKey(typeof addon?.name === 'string' ? addon.name : '')))
  return { ...item, addons: [...own, ...extras.filter((addon) => !ownNames.has(nameKey(addon.name)))] }
}
