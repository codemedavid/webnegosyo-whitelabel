/**
 * The owner's own report format, opened IN THE BROWSER: the file never
 * leaves the device. Only its outline (tab names, heading rows, a few sample
 * rows cut short) is handed to the chat (`@/lib/assistant/spreadsheet`).
 *
 * `exceljs` is ~1 MB, so it is imported only when someone attaches a file.
 */

import { parseCsv } from '@/lib/inventory/import/csv'
import { MAX_SHEET_FILE_BYTES, outlineFromSheets, spreadsheetOutlineSchema, type RawSheet, type SpreadsheetOutline } from '@/lib/assistant/spreadsheet'

/** A refusal the owner can act on. */
export class SheetError extends Error {}

/** Rows of a tab that are looked at: the heading row sits near the top, and three sample rows are enough. */
const ROWS_READ = 400

type ExcelModule = typeof import('exceljs')

async function loadExcel(): Promise<ExcelModule> {
  const mod = (await import('exceljs')) as ExcelModule & { default?: ExcelModule }
  return mod.default ?? mod
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

async function workbookSheets(buffer: ArrayBuffer): Promise<RawSheet[]> {
  const Excel = await loadExcel()
  const workbook = new Excel.Workbook()
  await workbook.xlsx.load(buffer)
  return workbook.worksheets
    .filter((sheet) => sheet.state === 'visible' || sheet.state === undefined)
    .map((sheet) => {
      const grid: unknown[][] = []
      for (let r = 1; r <= Math.min(sheet.rowCount, ROWS_READ); r += 1) {
        // `values` is 1-based and sparse: index 0 is always empty, holes are blanks.
        const values = sheet.getRow(r).values
        const cells = Array.isArray(values) ? values.slice(1) : []
        grid.push(Array.from({ length: cells.length }, (_, index) => cells[index] ?? null))
      }
      return { name: sheet.name, grid }
    })
}

/** The outline of the file someone picked. Throws a `SheetError` with a sentence they can act on. */
export async function readSpreadsheetOutline(file: Pick<File, 'name' | 'size' | 'arrayBuffer' | 'text'>): Promise<SpreadsheetOutline> {
  const extension = extensionOf(file.name)
  if (file.size > MAX_SHEET_FILE_BYTES) throw new SheetError('That file is over 2 MB. Send a copy with only the headings and a few rows.')
  if (extension === 'xls') throw new SheetError('That is an older Excel file (.xls). Save it as an Excel Workbook (.xlsx), then attach that.')
  if (!['xlsx', 'xlsm', 'csv', 'tsv', 'txt'].includes(extension)) throw new SheetError('Attach an Excel (.xlsx) or CSV file.')

  let sheets: RawSheet[]
  try {
    sheets =
      extension === 'xlsx' || extension === 'xlsm'
        ? await workbookSheets(await file.arrayBuffer())
        : [{ name: file.name.slice(0, file.name.lastIndexOf('.')), grid: parseCsv(await file.text()).slice(0, ROWS_READ) }]
  } catch {
    throw new SheetError('That file could not be opened. It may be password-protected or damaged: try saving a fresh copy.')
  }
  const outline = outlineFromSheets(file.name, sheets)
  if (!outline) throw new SheetError('That file looks empty. Attach the spreadsheet with your headings in it.')
  // The same check the server runs, so a file it would refuse is refused here with a reason.
  const checked = spreadsheetOutlineSchema.safeParse(outline)
  if (!checked.success) throw new SheetError('That file could not be read. Try a simpler copy with one heading row.')
  return checked.data
}
