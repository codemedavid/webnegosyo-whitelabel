/**
 * CSV for the BIR sales books — the same rules as the merchant app's export
 * (`webnegosyo-app/lib/export/csv.ts`), ported:
 *
 * - Excel opens these double-clicked, so the file leads with a UTF-8 BOM
 *   (Filipino names and ñ garble without it) and rows end in CRLF (RFC 4180).
 * - A claimant name is typed by a person. Any text cell starting with `=`,
 *   `+`, `-`, `@` (or a tab/CR) gets a leading apostrophe so a spreadsheet
 *   shows it instead of running it as a formula.
 * - Amounts the platform computed are written as plain numbers with two
 *   decimals and are NOT guarded: a `-120.00` reversal is data, not input.
 */

export interface MoneyCell {
  readonly money: number
}

export type CsvValue = string | number | boolean | null | undefined | MoneyCell

export const CSV_BOM = '﻿'

const NEEDS_QUOTING = /[",\r\n]/
const FORMULA_LEAD = /^[=+\-@\t\r]/

/** A peso amount, written `1234.50` (never `1,234.5`). */
export function money(value: number): MoneyCell {
  return { money: value }
}

function isMoneyCell(value: CsvValue): value is MoneyCell {
  return typeof value === 'object' && value !== null && 'money' in value
}

function moneyText(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(2)
}

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  if (isMoneyCell(value)) return moneyText(value.money)
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'

  const guarded = FORMULA_LEAD.test(value) ? `'${value}` : value
  return NEEDS_QUOTING.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

/** BOM, header row, data rows, CRLF-joined. */
export function toCsv(headers: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','))
  return CSV_BOM + lines.join('\r\n') + '\r\n'
}
