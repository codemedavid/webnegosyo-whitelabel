/**
 * Stock position for the assistant: what is out, what is low, what the shelf
 * is worth. Pure, over the ingredient rows the inventory page already reads.
 */

import { evaluateStockLevel, type StockLevel } from '@/lib/inventory/low-stock'

export interface StockRow {
  id: string
  name: string
  current_qty: number
  reorder_level: number
  unit_cost: number
  stock_unit_id: string
  is_active: boolean
}

export interface StockStatusRow {
  id: string
  name: string
  level: StockLevel
  quantity: number
  reorderLevel: number
  unit: string
}

export interface StockStatus {
  activeCount: number
  outCount: number
  lowCount: number
  stockValue: number
  /** Out first, then low; lowest cover (qty / reorder level) first within each. */
  attention: StockStatusRow[]
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function summarizeStock(rows: readonly StockRow[], unitById: ReadonlyMap<string, string>): StockStatus {
  const active = rows.filter((row) => row.is_active !== false)
  const graded = active.map((row) => ({
    id: row.id,
    name: row.name,
    level: evaluateStockLevel(row),
    quantity: round2(Number(row.current_qty) || 0),
    reorderLevel: round2(Number(row.reorder_level) || 0),
    unit: unitById.get(row.stock_unit_id) ?? '',
  }))
  const cover = (row: StockStatusRow) => (row.reorderLevel > 0 ? row.quantity / row.reorderLevel : row.quantity)
  const attention = graded
    .filter((row) => row.level !== 'ok')
    .sort((a, b) => Number(b.level === 'out') - Number(a.level === 'out') || cover(a) - cover(b))

  return {
    activeCount: active.length,
    outCount: graded.filter((row) => row.level === 'out').length,
    lowCount: graded.filter((row) => row.level === 'low').length,
    stockValue: round2(active.reduce((total, row) => total + Math.max(0, Number(row.current_qty) || 0) * (Number(row.unit_cost) || 0), 0)),
    attention,
  }
}
