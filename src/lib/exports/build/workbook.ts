/**
 * One Excel file, one tab per sheet. Every tab opens with the same block —
 * store, period, branch, "as of" — so a printed or forwarded tab still says
 * what it is. Money cells are numbers (a bookkeeper's formulas work), text is
 * written as text (a customer name starting with `=` is never a formula).
 *
 * `exceljs` is ~1 MB, so it is imported on demand. Server only.
 */

import type { Worksheet } from 'exceljs'
import { isTypedCell } from '../cells'
import type { BuiltSheet, ExportCell, ExportCellKind, ExportHeader } from '../types'

type ExcelModule = typeof import('exceljs')

const NUMBER_FORMATS: Readonly<Record<ExportCellKind, string | null>> = {
  text: null,
  money: '#,##0.00',
  count: '#,##0',
  number: '#,##0.##',
  percent: '0.0%',
}

async function loadExcel(): Promise<ExcelModule> {
  const mod = (await import('exceljs')) as ExcelModule & { default?: ExcelModule }
  return mod.default ?? mod
}

/** Excel refuses these in a tab name, and anything past 31 characters. */
export function tabName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet'
}

export function headerLines(sheet: BuiltSheet, header: ExportHeader): string[][] {
  return [
    [header.storeName],
    [sheet.name],
    ['Period', header.periodLabel],
    ['Branch', header.branchLabel],
    ['As of', header.asOf],
    ...sheet.notes.map((note) => ['Note', note]),
    [],
  ]
}

function rawValue(cell: ExportCell): string | number | null {
  return isTypedCell(cell) ? cell.value : cell
}

function addSheet(sheet: BuiltSheet, header: ExportHeader, target: Worksheet): void {
  const lead = headerLines(sheet, header)
  lead.forEach((line) => target.addRow(line))
  target.getRow(1).font = { bold: true, size: 14 }
  target.getRow(2).font = { bold: true }

  const headerRowNumber = lead.length + 1
  target.addRow(sheet.columns.map((column) => column.header)).font = { bold: true }
  for (const row of sheet.rows) {
    const added = target.addRow(row.map(rawValue))
    row.forEach((cell, index) => {
      const kind = isTypedCell(cell) ? cell.kind : sheet.columns[index].kind
      const format = NUMBER_FORMATS[kind]
      if (format) added.getCell(index + 1).numFmt = format
    })
  }

  sheet.columns.forEach((column, index) => {
    const widest = sheet.rows.reduce((width, row) => {
      const value = rawValue(row[index])
      return Math.max(width, typeof value === 'string' ? value.length : 10)
    }, column.header.length)
    target.getColumn(index + 1).width = Math.max(10, Math.min(48, widest + 2))
  })
  target.views = [{ state: 'frozen', ySplit: headerRowNumber }]
  if (sheet.columns.length > 0) {
    target.autoFilter = { from: { row: headerRowNumber, column: 1 }, to: { row: headerRowNumber, column: sheet.columns.length } }
  }
}

export async function buildWorkbook(sheets: readonly BuiltSheet[], header: ExportHeader): Promise<Uint8Array> {
  const Excel = await loadExcel()
  const workbook = new Excel.Workbook()
  workbook.created = new Date()
  const used = new Set<string>()
  for (const sheet of sheets) {
    let name = tabName(sheet.name)
    for (let n = 2; used.has(name.toLowerCase()); n += 1) name = `${tabName(sheet.name).slice(0, 28)} ${n}`
    used.add(name.toLowerCase())
    addSheet(sheet, header, workbook.addWorksheet(name))
  }
  return new Uint8Array((await workbook.xlsx.writeBuffer()) as ArrayBuffer)
}
