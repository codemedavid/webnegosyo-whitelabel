/** @jest-environment node */

/**
 * The browser's reader, against REAL files: a workbook written by exceljs
 * (formulas, dates, a title above the headings, a hidden tab) and a CSV.
 * What comes out is the outline only, and it passes the server's own check.
 */
import ExcelJS from 'exceljs'
import { readSpreadsheetOutline, SheetError } from '@/components/admin/assistant/read-spreadsheet'
import { checkMessageSheet, MAX_SHEET_FILE_BYTES } from '@/lib/assistant/spreadsheet'

function fileOf(name: string, bytes: ArrayBuffer | string): Pick<File, 'name' | 'size' | 'arrayBuffer' | 'text'> {
  const buffer = typeof bytes === 'string' ? new TextEncoder().encode(bytes).buffer : bytes
  return {
    name,
    size: buffer.byteLength,
    arrayBuffer: () => Promise.resolve(buffer as ArrayBuffer),
    text: () => Promise.resolve(typeof bytes === 'string' ? bytes : ''),
  }
}

async function workbook(): Promise<ArrayBuffer> {
  const book = new ExcelJS.Workbook()
  const daily = book.addWorksheet('Benta')
  daily.addRow(['Monthly report ni Ate'])
  daily.addRow([])
  daily.addRow(['Petsa', 'Benta', 'Upa', null, 'Kita'])
  daily.addRow([new Date('2026-11-01T00:00:00Z'), 12500.456789, 15000, null, { formula: 'B4-C4', result: -2499.54 }])
  daily.addRow([new Date('2026-11-02T00:00:00Z'), 9800, 15000, null, { formula: 'B5-C5', result: -5200 }])
  const dishes = book.addWorksheet('Ulam')
  dishes.addRow(['Ulam', 'Dami'])
  dishes.addRow([{ text: 'Sisig', hyperlink: 'https://example.com/steal' }, 14])
  const hidden = book.addWorksheet('Lihim')
  hidden.state = 'hidden'
  hidden.addRow(['Password', 'Bank'])
  book.addWorksheet('Empty')
  const out = await book.xlsx.writeBuffer()
  return out instanceof ArrayBuffer ? out : (out as Uint8Array).buffer.slice((out as Uint8Array).byteOffset, (out as Uint8Array).byteOffset + (out as Uint8Array).byteLength) as ArrayBuffer
}

describe('readSpreadsheetOutline', () => {
  it('reads a real workbook down to its outline: headings, a few short rows, visible tabs only', async () => {
    const outline = await readSpreadsheetOutline(fileOf('Monthly para kay Ate.xlsx', await workbook()))
    expect(outline).toEqual({
      name: 'Monthly para kay Ate.xlsx',
      moreTabs: 0,
      tabs: [
        {
          name: 'Benta',
          // The title row above is skipped; the empty heading cell keeps its place.
          headers: ['Petsa', 'Benta', 'Upa', '', 'Kita'],
          // A date is a day, a long decimal is rounded, a formula gives its last result.
          samples: [
            ['2026-11-01', '12500.4568', '15000', '', '-2499.54'],
            ['2026-11-02', '9800', '15000', '', '-5200'],
          ],
          rows: 2,
          moreColumns: 0,
        },
        // A link gives its words, never its address.
        { name: 'Ulam', headers: ['Ulam', 'Dami'], samples: [['Sisig', '14']], rows: 1, moreColumns: 0 },
      ],
    })
    expect(JSON.stringify(outline)).not.toMatch(/Password|example\.com|B4-C4/)
    expect(checkMessageSheet(outline)).toEqual({ ok: true, sheet: outline })
  })

  it('reads a CSV as one tab named after the file', async () => {
    const outline = await readSpreadsheetOutline(fileOf('daily sales.csv', 'Petsa,Benta,"No. of Orders"\n2026-11-01,12500,31\n2026-11-02,9800,24\n'))
    expect(outline.tabs).toEqual([{ name: 'daily sales', headers: ['Petsa', 'Benta', 'No. of Orders'], samples: [['2026-11-01', '12500', '31'], ['2026-11-02', '9800', '24']], rows: 2, moreColumns: 0 }])
  })

  it('refuses what it cannot read, with a sentence the owner can act on', async () => {
    await expect(readSpreadsheetOutline({ ...fileOf('big.xlsx', ''), size: MAX_SHEET_FILE_BYTES + 1 })).rejects.toThrow(/over 2 MB/)
    await expect(readSpreadsheetOutline(fileOf('old.xls', 'x'))).rejects.toThrow(/older Excel file/)
    await expect(readSpreadsheetOutline(fileOf('menu.pdf', 'x'))).rejects.toThrow(/Excel \(\.xlsx\) or CSV/)
    await expect(readSpreadsheetOutline(fileOf('broken.xlsx', 'not a zip'))).rejects.toThrow(/could not be opened/)
    await expect(readSpreadsheetOutline(fileOf('blank.csv', '\n\n'))).rejects.toThrow(/looks empty/)
    await expect(readSpreadsheetOutline(fileOf('blank.csv', '\n\n'))).rejects.toBeInstanceOf(SheetError)
  })
})
