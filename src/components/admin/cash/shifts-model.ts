/**
 * The Shifts table's rows: each shift with its sales figures (from
 * `report_shift_sales`) and its result. Pure, so "never a false ₱0" is
 * tested: a figure that is hidden, not loaded or failed stays a word.
 */

import type { CashResult } from '@/lib/cash/cash-rpc'
import { cashAndNonCash, type ShiftSalesReport } from '@/lib/cash/shift-sales'
import { remittanceDifferenceCents, type Remittance } from '@/lib/cash/remittances'
import { judgeCashShift, type CashShift, type CashShiftVerdict } from '@/lib/cash/shifts-read'
import { formatMoney } from '@/lib/reports/format'

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
  /** The end-of-shift remittance, when there is one. */
  remittance: Remittance | null
  /** Counts submitted (1, or 2 after a recount); null = not known. */
  countAttempts: number | null
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

export interface ShiftRowInputs {
  sales: ReadonlyMap<string, CashResult<ShiftSalesReport>>
  periodNames: ReadonlyMap<string, string>
  /** Shift id → its `kind: 'shift'` remittance. */
  remittances?: ReadonlyMap<string, Remittance>
  /** Shift id → counts submitted; absent = not known (the read failed or is not there yet). */
  countAttempts?: ReadonlyMap<string, number> | null
}

export function buildShiftRows(shifts: readonly CashShift[], inputs: ShiftRowInputs): ShiftTableRow[] {
  return shifts.map((shift) => ({
    shift,
    periodName: shift.servicePeriodId ? (inputs.periodNames.get(shift.servicePeriodId) ?? null) : null,
    sales: salesFigures(inputs.sales.get(shift.id) ?? null),
    verdict: judgeCashShift(shift),
    remittance: inputs.remittances?.get(shift.id) ?? null,
    countAttempts: inputs.countAttempts ? (inputs.countAttempts.get(shift.id) ?? 0) : null,
  }))
}

export type RemitTone = 'ok' | 'bad' | 'warn' | 'muted'

/** The Remit column: who has it and whether it was accepted, in words (never colour alone). */
export function remitStatus(remittance: Remittance | null, isShiftOpen = false): { text: string; tone: RemitTone } {
  if (!remittance) return { text: isShiftOpen ? 'On shift' : 'Not remitted', tone: 'muted' }
  const receiver = remittance.toSafe ? 'Store safe' : (remittance.remittedToName ?? 'Anyone')
  switch (remittance.status) {
    case 'pending':
      return { text: `Waiting · ${receiver}`, tone: 'warn' }
    case 'disputed':
      return { text: 'Disputed', tone: 'bad' }
    case 'resolved':
      return { text: `Resolved${remittance.resolvedByName ? ` · ${remittance.resolvedByName}` : ''}`, tone: 'ok' }
    case 'accepted': {
      const who = remittance.acceptMethod === 'pin' ? 'PIN' : (remittance.receivedByName ?? 'Accepted')
      const difference = remittanceDifferenceCents(remittance) ?? 0
      if (difference === 0) return { text: `Accepted · ${who}`, tone: 'ok' }
      const amount = formatMoney(Math.abs(difference), { centavos: true })
      return { text: `Got ${amount} ${difference < 0 ? 'less' : 'more'} · ${who}`, tone: 'warn' }
    }
  }
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
