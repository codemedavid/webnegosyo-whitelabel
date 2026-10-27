/**
 * The Shifts table's rows: each shift with its sales figures (from
 * `report_shift_sales`) and its result. Pure, so "never a false ₱0" is
 * tested: a figure that is hidden, not loaded or failed stays a word.
 */

import type { CashResult } from '@/lib/cash/cash-rpc'
import { cashAndNonCash, type ShiftSalesReport } from '@/lib/cash/shift-sales'
import { judgeCashShift, type CashShift, type CashShiftVerdict } from '@/lib/cash/shifts-read'

export type ShiftSalesFigures =
  | { kind: 'ready'; netCents: number; cashCents: number; nonCashCents: number; receipts: number }
  /** Blind count still open: pesos after the count. */
  | { kind: 'hidden'; receipts: number }
  /** The store's orders are not in the platform database. */
  | { kind: 'unavailable' }
  | { kind: 'failed'; message: string }
  /** Not looked up (more shifts than the page reads at once). */
  | { kind: 'not_loaded' }

export interface ShiftTableRow {
  shift: CashShift
  periodName: string | null
  sales: ShiftSalesFigures
  verdict: CashShiftVerdict
}

export function salesFigures(result: CashResult<ShiftSalesReport> | null): ShiftSalesFigures {
  if (result === null) return { kind: 'not_loaded' }
  if (!result.ok) return { kind: 'failed', message: result.error.message }
  const report = result.data
  if (report.source === 'unavailable') return { kind: 'unavailable' }
  const split = cashAndNonCash(report)
  if (report.hidden || report.summary === null || split === null) return { kind: 'hidden', receipts: report.receipts.length }
  return {
    kind: 'ready',
    netCents: report.summary.netCents,
    cashCents: split.cashCents,
    nonCashCents: split.nonCashCents,
    receipts: report.summary.orders,
  }
}

export function buildShiftRows(
  shifts: readonly CashShift[],
  sales: ReadonlyMap<string, CashResult<ShiftSalesReport>>,
  periodNames: ReadonlyMap<string, string>,
): ShiftTableRow[] {
  return shifts.map((shift) => ({
    shift,
    periodName: shift.servicePeriodId ? (periodNames.get(shift.servicePeriodId) ?? null) : null,
    sales: salesFigures(sales.get(shift.id) ?? null),
    verdict: judgeCashShift(shift),
  }))
}

/** What a money cell says when the figure is not a number. */
export function salesCellText(sales: ShiftSalesFigures): string | null {
  switch (sales.kind) {
    case 'ready':
      return null
    case 'hidden':
      return 'After count'
    case 'unavailable':
      return 'Not loaded'
    case 'failed':
      return 'Couldn’t load'
    case 'not_loaded':
      return 'Open to see'
  }
}

/** Σ net sales over the shifts whose figures loaded, and whether that is every shift. */
export function shiftSalesTotal(rows: readonly ShiftTableRow[]): { netCents: number | null; isComplete: boolean } {
  const ready = rows.filter((row) => row.sales.kind === 'ready')
  if (ready.length === 0) return { netCents: null, isComplete: rows.length === 0 }
  const netCents = ready.reduce((sum, row) => sum + (row.sales.kind === 'ready' ? row.sales.netCents : 0), 0)
  return { netCents, isComplete: ready.length === rows.length }
}
