import type { Category, MenuItem } from '@/types/database'

interface GroupMenuItemsOptions {
  items: MenuItem[]
  categories: Category[]
  uncategorizedCategory?: {
    id: string
    name: string
    icon?: string
  }
}

export interface GroupedMenuItems {
  category: Category
  items: MenuItem[]
}

/**
 * Group menu items by category in a single pass.
 * Preserves the incoming item order inside each category bucket.
 */
export function groupMenuItemsByCategory({
  items,
  categories,
  uncategorizedCategory,
}: GroupMenuItemsOptions): GroupedMenuItems[] {
  const itemsByCategory = new Map<string, MenuItem[]>()
  const uncategorizedItems: MenuItem[] = []

  for (const item of items) {
    if (!item.category_id) {
      uncategorizedItems.push(item)
      continue
    }

    const existing = itemsByCategory.get(item.category_id)
    if (existing) {
      existing.push(item)
    } else {
      itemsByCategory.set(item.category_id, [item])
    }
  }

  const grouped: GroupedMenuItems[] = []

  for (const category of categories) {
    const categoryItems = itemsByCategory.get(category.id)
    if (categoryItems && categoryItems.length > 0) {
      grouped.push({ category, items: categoryItems })
    }
  }

  if (uncategorizedCategory && uncategorizedItems.length > 0) {
    grouped.push({
      category: {
        id: uncategorizedCategory.id,
        name: uncategorizedCategory.name,
        icon: uncategorizedCategory.icon,
      } as Category,
      items: uncategorizedItems,
    })
  }

  return grouped
}
