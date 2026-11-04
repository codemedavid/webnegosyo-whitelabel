import { normalizeModifierGroups } from '@/lib/modifier-groups'
import { collectLinkedItemIds, resolveLinkedOptions, type LinkedItemSnapshot } from '@/lib/modifier-linked-options'
import { resolveMenuForOutlet, type OutletMenuIndex } from '@/lib/outlets/outlet-menu-overrides'
import type { Addon, Category, MenuItem, ModifierGroup } from '@/types/database'

/**
 * How the customer app reads a dish's modifier groups — ONE path shared by the
 * catalog it is shown (`project-catalog.ts`) and the order it sends back
 * (`orders/draft-to-lines.ts`). A group or option id the app saw is therefore
 * exactly the id the server resolves, with the same name, price, limits and
 * availability. Change it here, never in one of the two callers.
 */

/** The columns of a `menu_items` row the groups are read from. */
export type ModifierItemRow = Pick<MenuItem, 'modifier_groups' | 'variation_types' | 'variations' | 'addons'>

/** Item add-ons win over the category's defaults on a (case-insensitive) name clash, as on the web. */
function mergeCategoryAddons(item: ModifierItemRow, category: Pick<Category, 'default_addons'> | undefined): Addon[] {
  const defaults = category?.default_addons ?? []
  const own = item.addons ?? []
  if (defaults.length === 0) return own
  const names = new Set(own.map((addon) => addon.name.toLowerCase()))
  return [...own, ...defaults.filter((addon) => !names.has(addon.name.toLowerCase()))]
}

/**
 * The dish's groups, normalised but with linked options still unresolved. The
 * web only reads `modifier_groups` when the store has the feature on; otherwise
 * the legacy columns (plus the category's default add-ons).
 */
export function modifierGroupsFor(
  item: ModifierItemRow,
  category: Pick<Category, 'default_addons'> | undefined,
  tenant: Record<string, unknown>,
): ModifierGroup[] {
  const useUnified = tenant.modifier_groups_enabled === true && (item.modifier_groups?.length ?? 0) > 0
  return normalizeModifierGroups(
    useUnified
      ? { modifier_groups: item.modifier_groups }
      : { variation_types: item.variation_types, variations: item.variations, addons: mergeCategoryAddons(item, category) },
  )
}

/**
 * The dishes linked options point at, priced and listed for the branch (an
 * unlisted dish is absent, so its option resolves as unavailable).
 */
export function linkedItemsAtBranch<T extends MenuItem>(
  groupsByItem: ReadonlyArray<readonly ModifierGroup[]>,
  menuItems: readonly T[],
  branchIndex: OutletMenuIndex,
  outletId: string | null,
): Map<string, LinkedItemSnapshot> {
  const linkedIds = new Set(groupsByItem.flatMap((groups) => collectLinkedItemIds(groups)))
  const atBranch = resolveMenuForOutlet(menuItems.filter((item) => linkedIds.has(item.id)), branchIndex, outletId)
  return new Map(atBranch.map((item) => [item.id, item]))
}

/** The groups exactly as the app is shown them: normalised, linked options resolved. */
export function appModifierGroups(
  item: ModifierItemRow,
  category: Pick<Category, 'default_addons'> | undefined,
  tenant: Record<string, unknown>,
  linked: ReadonlyMap<string, LinkedItemSnapshot>,
): ModifierGroup[] {
  return resolveLinkedOptions(modifierGroupsFor(item, category, tenant), linked)
}

export interface GroupSelectLimits {
  minSelect: number
  /** null = no cap. */
  maxSelect: number | null
}

/** The min/max the app enforces (and the server re-checks); a cap of 0 or less means none. */
export function groupSelectLimits(group: ModifierGroup): GroupSelectLimits {
  const minSelect = Math.max(0, group.min_select ?? 0)
  const max = group.max_select ?? null
  return { minSelect, maxSelect: max !== null && max > 0 ? Math.max(max, minSelect) : null }
}
