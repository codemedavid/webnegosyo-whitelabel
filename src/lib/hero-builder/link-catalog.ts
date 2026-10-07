// ---------------------------------------------------------------------------
// The categories and products a hero link can point at, as the Hero Builder's
// link picker lists them: the store-wide menu customers see, in menu order.
// ---------------------------------------------------------------------------

export interface LinkCatalogCategory {
  id: string
  name: string
}

export interface LinkCatalogProduct {
  id: string
  name: string
  categoryName: string
}

export interface LinkCatalog {
  categories: LinkCatalogCategory[]
  products: LinkCatalogProduct[]
}

export const EMPTY_LINK_CATALOG: LinkCatalog = { categories: [], products: [] }

interface CategoryRow {
  id: string
  name: string
  order: number
}

interface ItemRow {
  id: string
  name: string
  category_id: string
  order: number
}

const byOrder = <T extends { order: number; name: string }>(a: T, b: T): number =>
  a.order - b.order || a.name.localeCompare(b.name)

export function buildLinkCatalog(categories: readonly CategoryRow[], items: readonly ItemRow[]): LinkCatalog {
  const sortedCategories = [...categories].sort(byOrder)
  const categoryRank = new Map(sortedCategories.map((category, index) => [category.id, index]))
  const categoryName = new Map(sortedCategories.map((category) => [category.id, category.name]))
  const rank = (item: ItemRow) => categoryRank.get(item.category_id) ?? Number.MAX_SAFE_INTEGER

  return {
    categories: sortedCategories.map(({ id, name }) => ({ id, name })),
    products: [...items]
      .sort((a, b) => rank(a) - rank(b) || byOrder(a, b))
      .map((item) => ({ id: item.id, name: item.name, categoryName: categoryName.get(item.category_id) ?? '' })),
  }
}
