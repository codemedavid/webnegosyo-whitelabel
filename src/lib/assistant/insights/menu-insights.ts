/**
 * Which dishes to show for "what sells / what doesn't / hidden gems".
 *
 * Pure. Silence is not a zero: when the sales read was incomplete, no dish is
 * called "not selling" — the merchant would pull a dish that sold fine in the
 * part of history we could not see.
 */

import type { MenuPerformance } from '@/lib/queries/menu-performance-merge'
import type { MenuClassification } from '@/lib/menu-engineering-classify'
import type { AssistantMenuItem } from '@/lib/assistant/data/menu'

export const MENU_FOCUSES = ['top', 'slow', 'not_selling', 'hidden_gems'] as const
export type MenuFocus = (typeof MENU_FOCUSES)[number]

export interface MenuInsightRow {
  itemId: string | null
  name: string
  units: number
  revenue: number
  price: number | null
  /** Added within the window, so a quiet start is expected. */
  isNew: boolean
}

export interface MenuInsight {
  rows: MenuInsightRow[]
  /** How many dishes matched before the list was cut to size. */
  matched: number
  note: string | null
}

const LIST_LIMIT = 8
const DAY_MS = 86_400_000

interface SelectParams {
  focus: MenuFocus
  days: number
  menu: readonly AssistantMenuItem[]
  performance: MenuPerformance
  classification: MenuClassification | null
  now: number
}

function isNewItem(item: AssistantMenuItem, days: number, now: number): boolean {
  const created = item.createdAt ? Date.parse(item.createdAt) : Number.NaN
  return Number.isFinite(created) && now - created < days * DAY_MS
}

function cut(rows: MenuInsightRow[], note: string | null = null): MenuInsight {
  return { rows: rows.slice(0, LIST_LIMIT), matched: rows.length, note }
}

export function selectMenuInsight({ focus, days, menu, performance, classification, now }: SelectParams): MenuInsight {
  const menuById = new Map(menu.map((item) => [item.id, item]))
  const salesById = new Map(performance.items.flatMap((row) => (row.itemId ? [[row.itemId, row] as const] : [])))
  const incomplete = performance.coverage.complete ? null : (performance.coverage.note ?? 'Sales history is incomplete.')

  const fromMenu = (item: AssistantMenuItem): MenuInsightRow => {
    const sales = salesById.get(item.id)
    return {
      itemId: item.id,
      name: item.name,
      units: sales?.units ?? 0,
      revenue: sales?.revenue ?? 0,
      price: item.price,
      isNew: isNewItem(item, days, now),
    }
  }
  const onSale = menu.filter((item) => item.isAvailable)

  if (focus === 'top') {
    const rows = [...performance.items]
      .sort((a, b) => b.revenue - a.revenue)
      .map((row) => ({
        itemId: row.itemId,
        name: row.itemId ? (menuById.get(row.itemId)?.name ?? row.name) : row.name,
        units: row.units,
        revenue: row.revenue,
        price: row.itemId ? (menuById.get(row.itemId)?.price ?? null) : null,
        isNew: false,
      }))
    return cut(rows, incomplete)
  }

  if (focus === 'slow') {
    const rows = onSale
      .map(fromMenu)
      .filter((row) => row.units > 0)
      .sort((a, b) => a.units - b.units || a.revenue - b.revenue)
    return cut(rows, incomplete)
  }

  if (focus === 'not_selling') {
    if (incomplete) {
      return { rows: [], matched: 0, note: `Can't tell which dishes aren't selling: ${incomplete}` }
    }
    const rows = onSale
      .map(fromMenu)
      .filter((row) => row.units === 0)
      // Established dishes first: a dish added last week is expected to be quiet.
      .sort((a, b) => Number(a.isNew) - Number(b.isNew) || a.name.localeCompare(b.name))
    return cut(rows)
  }

  // hidden_gems: earns well per sale but is under-ordered (BCG "puzzle").
  if (!classification?.canApply) {
    return { rows: [], matched: 0, note: classification?.warnings[0] ?? incomplete ?? 'Not enough sales to judge yet.' }
  }
  const rows = classification.items
    .filter((item) => item.classification === 'puzzle' && menuById.get(item.itemId)?.isAvailable !== false)
    .sort((a, b) => b.contributionMargin - a.contributionMargin)
    .map((item) => fromMenu(menuById.get(item.itemId) ?? { id: item.itemId, name: item.name, price: 0, isAvailable: true, categoryId: null, categoryName: null, createdAt: null }))
  return cut(rows)
}
