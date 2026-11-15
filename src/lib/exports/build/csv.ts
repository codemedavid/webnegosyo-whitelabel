/**
 * CSV: one file per sheet (several sheets = one .zip). The writer is the
 * sales books' (`gov-discount-reports/csv.ts`: BOM, CRLF, formula guard on
 * text, plain two-decimal money), so there is still one set of CSV rules.
 */

import { strToU8, zipSync } from 'fflate'
import { money, toCsv, type CsvValue } from '@/lib/gov-discount-reports/csv'
import { isTypedCell } from '../cells'
import type { BuiltSheet, ExportCell, ExportCellKind, ExportHeader } from '../types'
import { headerLines } from './workbook'

function csvValue(cell: ExportCell, columnKind: ExportCellKind): CsvValue {
  const kind = isTypedCell(cell) ? cell.kind : columnKind
  const value = isTypedCell(cell) ? cell.value : cell
  if (value === null) return null
  if (typeof value === 'string') return value
  if (kind === 'money') return money(value)
  // 0.254 → 25.4 (a percent column says "%" in its heading).
  if (kind === 'percent') return Math.round(value * 1000) / 10
  return value
}

/** The header block rides above the table as plain rows, so the file says what it is. */
export function sheetToCsv(sheet: BuiltSheet, header: ExportHeader): string {
  const lead = headerLines(sheet, header)
  const headings = sheet.columns.map((column) => (column.kind === 'percent' ? `${column.header} (%)` : column.header))
  const rows = sheet.rows.map((row) => row.map((cell, index) => csvValue(cell, sheet.columns[index].kind)))
  const [first, ...rest] = [...lead, headings]
  return toCsv(first, [...rest, ...rows])
}

export function fileSlug(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || 'sheet'
  )
}

export function zipCsvSheets(sheets: readonly BuiltSheet[], header: ExportHeader): Uint8Array {
  const used = new Set<string>()
  const files: Record<string, Uint8Array> = {}
  for (const sheet of sheets) {
    let name = fileSlug(sheet.name)
    for (let n = 2; used.has(name); n += 1) name = `${fileSlug(sheet.name)}-${n}`
    used.add(name)
    files[`${name}.csv`] = strToU8(sheetToCsv(sheet, header))
  }
  return zipSync(files)
}
