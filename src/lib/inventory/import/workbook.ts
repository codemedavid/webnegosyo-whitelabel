/**
 * Excel and CSV files ↔ plain grids of cells.
 *
 * `exceljs` is ~1 MB, so it is imported on demand — only when somebody opens a
 * spreadsheet or downloads one — and never sits in the inventory page's bundle.
 *
 * Everything the merchant touches in the template is built here: a styled,
 * frozen header with a hint on every column, dropdowns for Unit / Prep item /
 * Active, a "How to" sheet, and a sheet listing the store's own units. The
 * dropdowns WARN rather than refuse, because the importer understands "kgs"
 * and "Kilo" even though the list says "kg".
 */

import type { DataValidation, Workbook, Worksheet } from 'exceljs'
import { parseCsv, toCsv } from '@/lib/inventory/import/csv'
import type { ExportTable } from '@/lib/inventory/import/export-table'
import { IMPORT_FIELDS, TEMPLATE_HEADERS } from '@/lib/inventory/import/fields'

/** Largest file the browser will try to open. A pantry is kilobytes. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024

/** How far down the template's dropdowns and formats reach. */
const TEMPLATE_ROWS = 500
const INGREDIENTS_SHEET = 'Ingredients'
const UNITS_SHEET = 'Units'
const HOW_TO_SHEET = 'How to'

const INK = 'FF1D1815'
const PAPER = 'FFFFFFFF'
const MUTED_FILL = 'FFF6F3EE'
const MUTED_TEXT = 'FF6B645A'

/** Column widths in characters, index-aligned with TEMPLATE_HEADERS. */
const COLUMN_WIDTHS = [30, 14, 18, 10, 13, 15, 12, 12, 10]
const COST_FORMAT = '#,##0.00'

export interface SpreadsheetFile {
  name: string
  size: number
  arrayBuffer: () => Promise<ArrayBuffer>
  text: () => Promise<string>
}

export type ReadResult = { ok: true; grid: unknown[][] } | { ok: false; message: string }

export interface WorkbookUnit {
  name: string
  abbreviation: string
  dimension: string
}

type ExcelModule = typeof import('exceljs')

async function loadExcel(): Promise<ExcelModule> {
  const mod = (await import('exceljs')) as ExcelModule & { default?: ExcelModule }
  return mod.default ?? mod
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

function pickSheet(workbook: Workbook): Worksheet | undefined {
  const named = workbook.worksheets.find(
    (sheet) => sheet.name.trim().toLowerCase() === INGREDIENTS_SHEET.toLowerCase(),
  )
  return named ?? workbook.worksheets.find((sheet) => sheet.actualRowCount > 0)
}

/** The first useful sheet of an .xlsx file as rows of raw cell values. */
export async function readWorkbookBuffer(buffer: ArrayBuffer): Promise<unknown[][]> {
  const Excel = await loadExcel()
  const workbook = new Excel.Workbook()
  await workbook.xlsx.load(buffer)

  const sheet = pickSheet(workbook)
  if (!sheet) return []

  const grid: unknown[][] = []
  for (let r = 1; r <= sheet.rowCount; r++) {
    // `values` is 1-based and sparse: index 0 is always empty, holes are blanks.
    const values = sheet.getRow(r).values
    const cells = Array.isArray(values) ? values.slice(1) : []
    grid.push(Array.from({ length: cells.length }, (_, i) => cells[i] ?? null))
  }
  return grid
}

export async function readSpreadsheetFile(file: SpreadsheetFile): Promise<ReadResult> {
  const extension = extensionOf(file.name)

  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, message: 'This file is over 5 MB. Split it into smaller files and upload them one at a time.' }
  }
  if (extension === 'xls') {
    return {
      ok: false,
      message: 'This is an older Excel file (.xls). Open it in Excel, choose Save As → Excel Workbook (.xlsx), then upload that.',
    }
  }

  try {
    if (['csv', 'tsv', 'txt'].includes(extension)) return { ok: true, grid: parseCsv(await file.text()) }
    if (['xlsx', 'xlsm'].includes(extension)) {
      return { ok: true, grid: await readWorkbookBuffer(await file.arrayBuffer()) }
    }
  } catch (error) {
    console.error('[inventory-import] could not read file', { name: file.name, error })
    return {
      ok: false,
      message: 'We couldn’t open this file. It may be password-protected or damaged — try saving a fresh copy.',
    }
  }
  return { ok: false, message: 'Upload an Excel (.xlsx) or CSV file.' }
}

// ── Writing ──────────────────────────────────────────────────────────────────

function styleHeader(sheet: Worksheet, columnCount: number) {
  const header = sheet.getRow(1)
  header.height = 26
  for (let c = 1; c <= columnCount; c++) {
    const cell = header.getCell(c)
    cell.font = { bold: true, color: { argb: PAPER }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
}

/** Present at runtime since exceljs 4, missing from its typings. */
type ValidatedWorksheet = Worksheet & {
  dataValidations: { add: (address: string, validation: DataValidation) => void }
}

function addValidations(sheet: ValidatedWorksheet, unitCount: number) {
  const column = (key: string) => IMPORT_FIELDS.findIndex((field) => field.key === key) + 1
  const letter = (index: number) => sheet.getColumn(index).letter
  const yesNo: DataValidation = {
    type: 'list',
    allowBlank: true,
    formulae: ['"Yes,No"'],
    showErrorMessage: true,
    errorStyle: 'warning',
    errorTitle: 'Yes or No',
    error: 'Type Yes or No. Leave it blank to keep what’s saved.',
  }
  const unit: DataValidation = {
    type: 'list',
    allowBlank: true,
    formulae: [`${UNITS_SHEET}!$B$2:$B$${unitCount + 1}`],
    showErrorMessage: true,
    errorStyle: 'warning',
    errorTitle: 'Not one of your units',
    error: 'We’ll still try to match it (kgs, kilo, pcs…). If we can’t, you’ll pick the unit when you import.',
  }
  const number: DataValidation = {
    type: 'decimal',
    operator: 'greaterThanOrEqual',
    allowBlank: true,
    formulae: [0],
    showErrorMessage: true,
    errorStyle: 'warning',
    errorTitle: 'Numbers only',
    error: 'Type a number of zero or more, like 12.5.',
  }

  const rules: [number, DataValidation][] = [
    [column('is_prep'), yesNo],
    [column('is_active'), yesNo],
    [column('unit_cost'), number],
    [column('reorder_level'), number],
    [column('on_hand'), number],
    ...(unitCount > 0 ? [[column('unit'), unit] as [number, DataValidation]] : []),
  ]
  // Registered per cell: exceljs keys validations by address and squeezes
  // alike neighbours into one range when it writes the file.
  for (const [columnIndex, rule] of rules) {
    const columnLetter = letter(columnIndex)
    for (let r = 2; r <= TEMPLATE_ROWS + 1; r++) {
      sheet.dataValidations.add(`${columnLetter}${r}`, rule)
    }
  }
}

function addIngredientsSheet(workbook: Workbook, table: ExportTable, unitCount: number) {
  const sheet = workbook.addWorksheet(INGREDIENTS_SHEET, { properties: { tabColor: { argb: INK } } })
  sheet.columns = TEMPLATE_HEADERS.map((header, index) => ({
    header,
    key: IMPORT_FIELDS[index].key,
    width: COLUMN_WIDTHS[index] ?? 14,
  }))
  sheet.getColumn('unit_cost').numFmt = COST_FORMAT

  IMPORT_FIELDS.forEach((field, index) => {
    sheet.getRow(1).getCell(index + 1).note = `${field.isRequired ? 'Required. ' : ''}${field.hint}\n\nExample: ${field.example}`
  })
  styleHeader(sheet, TEMPLATE_HEADERS.length)
  table.rows.forEach((row) => sheet.addRow(row))
  addValidations(sheet as ValidatedWorksheet, unitCount)
}

function addHowToSheet(workbook: Workbook) {
  const sheet = workbook.addWorksheet(HOW_TO_SHEET)
  sheet.getColumn(1).width = 18
  sheet.getColumn(2).width = 12
  sheet.getColumn(3).width = 70
  sheet.getColumn(4).width = 16

  sheet.addRow(['Import your ingredients in 3 steps']).font = { bold: true, size: 16 }
  sheet.addRow([])
  const steps = [
    '1. Fill in the Ingredients sheet — one ingredient per row. New ingredients only need a Name and a Unit.',
    '2. Leave a cell blank to keep what’s already saved. A row whose Name (or SKU) you already have updates that ingredient.',
    '3. Save the file, then go to Inventory → Import and drop it in. You’ll see every change before anything is saved.',
  ]
  steps.forEach((step) => sheet.addRow([step]))
  sheet.addRow([])
  sheet.addRow([
    'Good to know: “On hand” is saved as a stock count. For ingredients you already have, it only changes if you tick “Update stock on hand” while importing.',
  ]).font = { italic: true, color: { argb: MUTED_TEXT } }
  sheet.addRow([])

  const header = sheet.addRow(['Column', 'Needed?', 'What goes in', 'Example'])
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: PAPER } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
  })
  IMPORT_FIELDS.forEach((field, index) => {
    const row = sheet.addRow([
      field.label,
      field.isRequired ? 'Yes' : field.key === 'unit' ? 'New only' : 'No',
      field.hint,
      field.example,
    ])
    row.getCell(3).alignment = { wrapText: true, vertical: 'top' }
    if (index % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MUTED_FILL } }
      })
    }
  })
}

function addUnitsSheet(workbook: Workbook, units: readonly WorkbookUnit[]) {
  const sheet = workbook.addWorksheet(UNITS_SHEET)
  sheet.columns = [
    { header: 'Unit', key: 'name', width: 18 },
    { header: 'Type this', key: 'abbreviation', width: 12 },
    { header: 'Measures', key: 'dimension', width: 12 },
  ]
  styleHeader(sheet, 3)
  units.forEach((unit) => sheet.addRow(unit))
}

export interface BuildWorkbookOptions {
  table: ExportTable
  units: readonly WorkbookUnit[]
}

/** The template (no rows) and the export (every ingredient) are one workbook. */
export async function buildIngredientsWorkbook({ table, units }: BuildWorkbookOptions): Promise<ArrayBuffer> {
  const Excel = await loadExcel()
  const workbook = new Excel.Workbook()
  workbook.creator = 'WebNegosyo'
  workbook.created = new Date()

  addIngredientsSheet(workbook, table, units.length)
  addHowToSheet(workbook)
  addUnitsSheet(workbook, units)

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer
}

/**
 * CSV with a byte-order mark: without it, Excel reads UTF-8 as the system code
 * page and "Jalapeño" or "₱" arrive garbled.
 */
export function buildCsvText(table: ExportTable): string {
  return `﻿${toCsv([table.headers, ...table.rows])}`
}
