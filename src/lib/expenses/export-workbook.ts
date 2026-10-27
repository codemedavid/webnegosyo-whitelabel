/**
 * The accountant export as an .xlsx: an "Expenses" sheet (the same columns
 * and rows as the CSV, money as numbers so the bookkeeper's formulas work)
 * and a "Monthly summary" sheet.
 *
 * `exceljs` is ~1 MB, so it is imported on demand (same as the inventory
 * import's workbook). Server only.
 */

import type { Worksheet } from 'exceljs'
import {
  EXPORT_COLUMNS,
  MONTHLY_SUMMARY_COLUMNS,
  pesoText,
  type ExportRow,
  type MonthlySummary,
  type MonthlySummaryRow,
} from './export'

type ExcelModule = typeof import('exceljs')

const MONEY_COLUMNS = new Set<string>(['Gross', 'VATable', 'Input VAT', 'EWT', 'Net paid'])
const NUMBER_COLUMNS = new Set<string>(['EWT rate'])
const MONEY_FORMAT = '#,##0.00'

async function loadExcel(): Promise<ExcelModule> {
  const mod = (await import('exceljs')) as ExcelModule & { default?: ExcelModule }
  return mod.default ?? mod
}

/** A text cell that looks like a number becomes one; blanks stay blank (blank ≠ 0). */
function cellValue(column: string, text: string): string | number | null {
  if (text === '') return null
  if (MONEY_COLUMNS.has(column) || NUMBER_COLUMNS.has(column)) {
    const value = Number(text)
    return Number.isFinite(value) ? value : text
  }
  return text
}

function styleSheet(sheet: Worksheet, headers: readonly string[]): void {
  const header = sheet.getRow(1)
  header.font = { bold: true }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  headers.forEach((name, index) => {
    const column = sheet.getColumn(index + 1)
    column.width = Math.max(10, Math.min(40, name.length + 4))
    if (MONEY_COLUMNS.has(name) || name === 'Total') column.numFmt = MONEY_FORMAT
  })
}

function summaryRow(row: MonthlySummaryRow): Array<string | number> {
  return [row.month, row.category, row.plLine, row.branch, row.count, Number(row.total)]
}

function addSummary(sheet: Worksheet, rows: readonly MonthlySummaryRow[], totalLabel: string, totalCents: number): void {
  rows.forEach((row) => sheet.addRow(summaryRow(row)))
  const count = rows.reduce((total, row) => total + row.count, 0)
  const totalRow = sheet.addRow([totalLabel, '', '', '', count, Number(pesoText(totalCents))])
  totalRow.font = { bold: true }
}

export async function buildExpenseWorkbook(rows: readonly ExportRow[], summary: MonthlySummary): Promise<ArrayBuffer> {
  const Excel = await loadExcel()
  const workbook = new Excel.Workbook()
  workbook.created = new Date()

  const expenses = workbook.addWorksheet('Expenses')
  expenses.addRow([...EXPORT_COLUMNS])
  rows.forEach((row) => expenses.addRow(EXPORT_COLUMNS.map((column) => cellValue(column, row[column]))))
  styleSheet(expenses, EXPORT_COLUMNS)

  const monthly = workbook.addWorksheet('Monthly summary')
  monthly.addRow([...MONTHLY_SUMMARY_COLUMNS])
  addSummary(monthly, summary.expenseRows, 'Total expenses', summary.expenseTotalCents)
  monthly.addRow([])
  addSummary(monthly, summary.notExpenseRows, 'Total not an expense', summary.notExpenseTotalCents)
  styleSheet(monthly, MONTHLY_SUMMARY_COLUMNS)

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer
}
