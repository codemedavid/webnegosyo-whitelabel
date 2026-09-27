/**
 * Menu management lists dishes under their category, the way the owner's own
 * menu is laid out, instead of one long undifferentiated grid.
 */

import type { Category, MenuItem } from '@/types/database'

export interface MenuItemGroup {
  /** The category id, or `OTHER_GROUP_KEY` for dishes whose category is gone. */
  key: string
  name: string
  items: MenuItem[]
}

export const OTHER_GROUP_KEY = '__other__'

/**
 * Groups in category order (`order`, then as given); dishes keep their incoming
 * order within a group. A dish pointing at a missing category is listed under
 * "Other" at the end — never dropped, or the owner could not find it to fix it.
 */
export function groupMenuItemsByCategory(
  items: readonly MenuItem[],
  categories: readonly Category[],
): MenuItemGroup[] {
  const sortedCategories = [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const knownIds = new Set(sortedCategories.map((c) => c.id))

  const grouped = sortedCategories
    .map((c) => ({ key: c.id, name: c.name, items: items.filter((item) => item.category_id === c.id) }))
    .filter((group) => group.items.length > 0)

  const orphans = items.filter((item) => !knownIds.has(item.category_id))
  return orphans.length > 0 ? [...grouped, { key: OTHER_GROUP_KEY, name: 'Other', items: orphans }] : grouped
}
