/**
 * Sheets built from the report engine's sections (`runReportQuery`). Pure.
 *
 * Nothing here computes a sales figure: every number is a registry metric the
 * engine already produced, so a sheet, the Reports page and the app agree to
 * the centavo. A section that failed fails the export with its own message —
 * an empty sheet would read as "no sales".
 */

import type { ReportResult } from '@/lib/reports/read/report-rpc'
import type { ReportRow, ReportSections } from '@/lib/reports/api/run-report-query'
import type { MetricValues } from '@/lib/reports/metrics/compute'
import { pesos, typed, weekdayOf } from '../cells'
import { ExportError } from '../errors'
import type { ExportRow } from '../types'

function need<T>(result: ReportResult<T> | undefined, what: string): T {
  if (!result) throw new ExportError(`The ${what} could not be read. Try again in a moment.`, 502)
  if (!result.ok) throw new ExportError(result.error.message, result.error.kind === 'forbidden' ? 403 : 502)
  return result.data
}

const count = (value: number | null | undefined): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

function sum(rows: readonly ReportRow[], metric: keyof MetricValues): number {
  return rows.reduce((total, row) => total + (row.values[metric] ?? 0), 0)
}

function checkLine(label: string, addedUpCents: number, expectedCents: number): ExportRow {
  const gap = addedUpCents - expectedCents
  return {
    line: label,
    value: pesos(addedUpCents),
    note: gap === 0 ? 'Matches' : `Differs by ${pesos(Math.abs(gap))?.toFixed(2)} — tell support`,
  }
}

/**
 * The period on one tab, top to bottom the way a bookkeeper reads it, then a
 * Checks block: the same sales added up day by day and dish by dish, so the
 * file proves it agrees with itself.
 */
export function summaryRows(sections: ReportSections): ExportRow[] {
  const summary = need(sections.summary, 'summary')
  const days = need(sections.periods, 'daily sales').rows
  const items = need(sections.items, 'items').rows
  const payments = need(sections.payments, 'payments').rows
  const v = summary.values
  const money = (label: string, cents: number | null | undefined, note: string | null = null): ExportRow => ({ line: label, value: pesos(cents), note })
  const tally = (label: string, value: number | null | undefined, note: string | null = null): ExportRow => ({ line: label, value: typed(count(value), 'count'), note })
  const net = v.net_sales ?? 0

  return [
    tally('Orders', v.orders, 'Cancelled orders are not counted'),
    money('Sales before discounts', v.gross_sales),
    money('Less: discounts', v.discounts),
    money('Sales', v.net_sales, 'Food and drinks after discounts; no service charge or delivery fee'),
    money('Service charge', v.service_charge),
    money('Delivery fees', v.delivery_fees),
    money('Average order', v.aov),
    tally('Items sold', v.items_sold),
    money('Money received', v.money_received),
    money('Still to collect', v.still_to_collect),
    tally('Cancelled orders', v.cancelled_orders),
    { line: null, value: null, note: null },
    { line: 'Checks', value: null, note: 'The same figures added up another way' },
    checkLine('Sales, added up day by day', sum(days, 'net_sales'), net),
    checkLine('Sales, added up item by item', sum(items, 'net_sales'), net),
    checkLine('Money received, added up by payment method', sum(payments, 'money_received'), v.money_received ?? 0),
  ]
}

export function salesByDayRows(sections: ReportSections): ExportRow[] {
  const periods = need(sections.periods, 'daily sales')
  if (periods.grain !== 'day') throw new ExportError('The daily sales could not be read by day. Try again in a moment.', 502)
  return periods.rows.map((row) => ({
    day: row.key,
    weekday: weekdayOf(row.key),
    orders: count(row.values.orders),
    gross: pesos(row.values.gross_sales),
    discounts: pesos(row.values.discounts),
    net: pesos(row.values.net_sales),
    aov: pesos(row.values.aov),
    collected: pesos(row.values.money_received),
  }))
}

function breakdownRow(row: ReportRow): ExportRow {
  return {
    name: row.label,
    orders: count(row.values.orders),
    quantity: count(row.values.items_sold),
    gross: pesos(row.values.gross_sales),
    discounts: pesos(row.values.discounts),
    net: pesos(row.values.net_sales),
    share: row.values.share_of_sales ?? null,
  }
}

export function itemRows(sections: ReportSections): ExportRow[] {
  return need(sections.items, 'items').rows.map((row) => ({
    ...breakdownRow(row),
    category: row.categoryLabel ?? null,
    avg_price: pesos(row.values.avg_item_price),
  }))
}

type BreakdownSection = 'categories' | 'order_types' | 'channels' | 'branches'

export function breakdownRows(sections: ReportSections, section: BreakdownSection, what: string): ExportRow[] {
  return need(sections[section], what).rows.map(breakdownRow)
}

export function paymentMethodRows(sections: ReportSections): ExportRow[] {
  return need(sections.payments, 'payments').rows.map((row) => ({
    name: row.label,
    orders: count(row.values.orders),
    collected: pesos(row.values.money_received),
    share: row.values.share_of_sales ?? null,
  }))
}
