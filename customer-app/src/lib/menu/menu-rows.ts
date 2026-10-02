import type { AppCategory, AppMenuItem } from '@/lib/contract'

export type MenuRow = { type: 'header'; key: string; category: AppCategory } | { type: 'item'; key: string; item: AppMenuItem }

export interface MenuRows {
  rows: MenuRow[]
  /** Row positions of each header, ascending — feeds the scroll spy. */
  headerIndices: number[]
  /** Categories actually shown, in order — one chip each. */
  sections: AppCategory[]
}

const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Categories in menu order, each preceded by a header row; empty categories never render. */
export function buildMenuRows(categories: readonly AppCategory[], items: readonly AppMenuItem[], query: string): MenuRows {
  const needle = fold(query.trim())
  const matches = (item: AppMenuItem) => needle === '' || fold(`${item.name} ${item.description}`).includes(needle)

  return categories.reduce<MenuRows>(
    (acc, category) => {
      const categoryItems = items.filter((item) => item.categoryId === category.id && matches(item))
      if (categoryItems.length === 0) return acc
      return {
        rows: [
          ...acc.rows,
          { type: 'header', key: `h-${category.id}`, category },
          ...categoryItems.map((item): MenuRow => ({ type: 'item', key: item.id, item })),
        ],
        headerIndices: [...acc.headerIndices, acc.rows.length],
        sections: [...acc.sections, category],
      }
    },
    { rows: [], headerIndices: [], sections: [] },
  )
}
