/**
 * View model for the inventory table.
 *
 * The inventory screen is a data table, and search, sort, pagination, selection
 * and export are all pure functions of the rows. Keeping them out of the
 * component means the table only renders, the rules can be tested without a
 * DOM, and the merchant app can grow the same table from the same answers.
 *
 * No dates are formatted here on purpose: a server render that formats a date
 * in the server's locale and re-renders it in the browser's is a hydration bug.
 * Rows carry raw ISO; the client formats.
 */

import { evaluateStockLevel, type StockLevel } from '@/lib/inventory/low-stock'
import type { InventoryItem } from '@/types/database'

/** Shown when the merchant never gave the ingredient a SKU. */
export const NO_CODE = '—'
/** Shown when the merchant never filed the ingredient under a category. */
export const UNGROUPED = 'Uncategorized'

export type InventorySortKey = 'code' | 'name' | 'group' | 'lastPurchase' | 'onHand'
export type SortDirection = 'asc' | 'desc'

export interface InventoryRow {
  id: string
  code: string
  imageUrl: string | null
  name: string
  group: string
  /** Raw ISO of the most recent `receive`, or null if never received. */
  lastPurchaseAt: string | null
  /** On-hand quantity with its stock unit, e.g. `4.5 kg`. */
  onHandLabel: string
  onHandQty: number
  stockLevel: StockLevel
  isPrep: boolean
  isActive: boolean
}

export interface InventoryRowContext {
  unitAbbreviation: (unitId: string) => string
  lastPurchaseAt: ReadonlyMap<string, string>
}

/** Trims the trailing zeros a NUMERIC(16,4) round-trip leaves behind. */
function formatQuantity(quantity: number): string {
  return Number(quantity.toFixed(4)).toString()
}

export function buildInventoryRows(
  items: readonly InventoryItem[],
  context: InventoryRowContext,
): InventoryRow[] {
  return items.map((item) => {
    const unit = context.unitAbbreviation(item.stock_unit_id)
    return {
      id: item.id,
      code: item.sku?.trim() || NO_CODE,
      imageUrl: item.image_url ?? null,
      name: item.name,
      group: item.category?.trim() || UNGROUPED,
      lastPurchaseAt: context.lastPurchaseAt.get(item.id) ?? null,
      onHandLabel: unit ? `${formatQuantity(item.current_qty)} ${unit}` : formatQuantity(item.current_qty),
      onHandQty: item.current_qty,
      stockLevel: evaluateStockLevel(item),
      isPrep: item.is_prep,
      isActive: item.is_active,
    }
  })
}

/** The columns of `stock_movements` a last-purchase lookup depends on. */
export interface ReceiveMovementRow {
  inventory_item_id: string
  created_at: string
}

/**
 * The most recent receive per ingredient.
 *
 * Order-independent by design — the caller reads the ledger with whatever
 * ordering is cheapest, and a later row never loses to an earlier one.
 */
export function toLastPurchaseMap(
  movements: readonly ReceiveMovementRow[],
): ReadonlyMap<string, string> {
  const latest = new Map<string, string>()

  for (const movement of movements) {
    const current = latest.get(movement.inventory_item_id)
    if (current === undefined || movement.created_at > current) {
      latest.set(movement.inventory_item_id, movement.created_at)
    }
  }

  return latest
}

/** Free-text search across the three columns a merchant would search by. */
export function filterInventoryRows(rows: readonly InventoryRow[], query: string): InventoryRow[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...rows]

  return rows.filter((row) =>
    [row.name, row.code, row.group].some((field) => field.toLowerCase().includes(needle)),
  )
}

/**
 * Compares two rows on one column, always ascending.
 *
 * Never-purchased rows are handled by the caller rather than here: they sort
 * last in *both* directions, which no direction-flipped comparator can express.
 */
function compareOn(a: InventoryRow, b: InventoryRow, key: InventorySortKey): number {
  if (key === 'onHand') return a.onHandQty - b.onHandQty
  if (key === 'lastPurchase') return (a.lastPurchaseAt ?? '').localeCompare(b.lastPurchaseAt ?? '')
  if (key === 'code') return a.code.localeCompare(b.code)
  if (key === 'group') return a.group.localeCompare(b.group)
  return a.name.localeCompare(b.name)
}

export function sortInventoryRows(
  rows: readonly InventoryRow[],
  key: InventorySortKey,
  direction: SortDirection,
): InventoryRow[] {
  const factor = direction === 'asc' ? 1 : -1

  return [...rows].sort((a, b) => {
    // "Never purchased" is an absence, not an early date — it belongs at the
    // bottom whichever way the column is pointing.
    if (key === 'lastPurchase') {
      const aMissing = a.lastPurchaseAt === null
      const bMissing = b.lastPurchaseAt === null
      if (aMissing !== bMissing) return aMissing ? 1 : -1
    }
    return compareOn(a, b, key) * factor
  })
}

export interface PaginatedRows<T> {
  rows: T[]
  /** Clamped into the pages that actually exist. */
  page: number
  pageCount: number
  /** 1-based index of the first row shown, or 0 when there are none. */
  from: number
  to: number
  total: number
}

export function paginateRows<T>(
  rows: readonly T[],
  page: number,
  pageSize: number,
): PaginatedRows<T> {
  const total = rows.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(Math.max(Math.trunc(page), 1), pageCount)
  const start = (current - 1) * pageSize
  const slice = rows.slice(start, start + pageSize)

  return {
    rows: slice,
    page: current,
    pageCount,
    from: slice.length === 0 ? 0 : start + 1,
    to: start + slice.length,
    total,
  }
}

// ── Selection ────────────────────────────────────────────────────────────────

export function toggleSelected(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]
}

/**
 * The header checkbox: clears the visible rows when they are all selected,
 * otherwise completes the selection. Ids selected on other pages are never
 * touched — a page change must not silently drop them.
 */
export function toggleAllSelected(
  selected: readonly string[],
  visibleIds: readonly string[],
): string[] {
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id))

  if (allVisibleSelected) return selected.filter((id) => !visibleIds.includes(id))

  const missing = visibleIds.filter((id) => !selected.includes(id))
  return [...selected, ...missing]
}

// ── Export ───────────────────────────────────────────────────────────────────

const CSV_HEADER = ['SKU', 'Name', 'Category', 'Last Purchase', 'On Hand']

/** RFC 4180 quoting — a stray comma in an item name must not shift a column. */
function csvCell(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

export function buildInventoryCsv(rows: readonly InventoryRow[]): string {
  const lines = rows.map((row) =>
    [
      row.code === NO_CODE ? '' : row.code,
      row.name,
      row.group,
      // Date only: the time a delivery was keyed in is noise in a spreadsheet.
      row.lastPurchaseAt ? row.lastPurchaseAt.slice(0, 10) : '',
      row.onHandLabel,
    ]
      .map(csvCell)
      .join(','),
  )

  return [CSV_HEADER.join(','), ...lines].join('\n')
}
