import { normalizeModifierGroups } from '@/lib/modifier-groups'
import { withCategoryAddons } from '@/lib/category-default-addons'
import { collectLinkedItemIds, resolveLinkedOptions, type LinkedItemSnapshot } from '@/lib/modifier-linked-options'
import { resolveMenuForOutlet, type OutletMenuIndex } from '@/lib/outlets/outlet-menu-overrides'
import type { Addon, Category, MenuItem, ModifierGroup } from '@/lib/app-api/store-types'

/**
 * How the customer app reads a dish's modifier groups — ONE path shared by the
 * catalog it is shown (`project-catalog.ts`) and the order it sends back
 * (`orders/draft-to-lines.ts`). A group or option id the app saw is therefore
 * exactly the id the server resolves, with the same name, price, limits and
 * availability. Change it here, never in one of the two callers.
 */

/** The columns of a `menu_items` row the groups are read from. */
export type ModifierItemRow = Pick<MenuItem, 'modifier_groups' | 'variation_types' | 'variations' | 'addons'>

/** The add-on's name as the clash rule compares it; null for a nameless (malformed) entry. */
function addonNameKey(addon: unknown): string | null {
  const name = typeof addon === 'object' && addon !== null ? (addon as { name?: unknown }).name : undefined
  return typeof name === 'string' ? name.toLowerCase() : null
}

/**
 * The dish's add-ons plus its category's default add-ons. Item add-ons win over
 * the category's defaults on a (case-insensitive) name clash, as on the web
 * (`useVariationState`) and in server pricing (`withCategoryAddons`), so the
 * add-ons a dish is priced with are the ones it was shown with. Takes
 * untrusted row JSON: a non-array reads as none.
 */
export function mergeCategoryAddons(
  item: { addons?: unknown },
  category: { default_addons?: unknown } | undefined,
): Addon[] {
  const defaults = Array.isArray(category?.default_addons) ? (category.default_addons as Addon[]) : []
  const own = Array.isArray(item.addons) ? (item.addons as Addon[]) : []
  if (defaults.length === 0) return own
  const names = new Set(own.map(addonNameKey))
  return [...own, ...defaults.filter((addon) => {
    const key = addonNameKey(addon)
    return key === null || !names.has(key)
  })]
}

/**
 * Whether the dish is read from `modifier_groups` (the store has the feature on
 * AND the dish was authored with it). Otherwise the legacy columns plus the
 * category's default add-ons are shown.
 */
export function usesUnifiedModifierGroups(item: { modifier_groups?: unknown }, tenant: Record<string, unknown>): boolean {
  return tenant.modifier_groups_enabled === true && Array.isArray(item.modifier_groups) && item.modifier_groups.length > 0
}

/**
 * The dish's groups, normalised but with linked options still unresolved. The
 * web only reads `modifier_groups` when the store has the feature on; otherwise
 * the legacy columns. Either way the category's default add-ons are offered:
 * joined to the groups (`withCategoryAddons`, as the item page and checkout
 * pricing do) or to the legacy add-ons.
 */
export function modifierGroupsFor(
  item: ModifierItemRow,
  category: Pick<Category, 'default_addons'> | undefined,
  tenant: Record<string, unknown>,
): ModifierGroup[] {
  return normalizeModifierGroups(
    usesUnifiedModifierGroups(item, tenant)
      ? { modifier_groups: withCategoryAddons({ modifier_groups: item.modifier_groups }, category?.default_addons).modifier_groups }
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
