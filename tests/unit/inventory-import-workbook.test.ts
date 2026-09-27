/**
 * @jest-environment node
 *
 * The Excel round trip: the template and the export are real .xlsx files that
 * the importer reads straight back — no matching step, no changes reported.
 */

import { readSpreadsheetFile, buildIngredientsWorkbook, buildCsvText } from '@/lib/inventory/import/workbook'
import { buildIngredientExport } from '@/lib/inventory/import/export-table'
import { isEveryColumnMatched, matchColumns } from '@/lib/inventory/import/column-matching'
import { buildImportPlan } from '@/lib/inventory/import/import-plan'
import { toImportSheet } from '@/lib/inventory/import/sheet'
import { TEMPLATE_HEADERS } from '@/lib/inventory/import/fields'
import type { InventoryItem } from '@/types/database'

const UNITS = [
  { id: '00000000-0000-4000-8000-00000000000a', name: 'Kilogram', abbreviation: 'kg', dimension: 'weight' },
  { id: '00000000-0000-4000-8000-00000000000b', name: 'Piece', abbreviation: 'pc', dimension: 'count' },
]

const INGREDIENTS: InventoryItem[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    tenant_id: 't1',
    name: 'Mozzarella, shredded',
    sku: 'CH-1',
    category: 'Dairy',
    stock_unit_id: UNITS[0].id,
    unit_cost: 450.5,
    is_prep: false,
    image_url: null,
    current_qty: 4.25,
    reorder_level: 1,
    is_active: true,
    created_at: '',
    updated_at: '',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    tenant_id: 't1',
    name: 'Jalapeño salsa',
    sku: null,
    category: null,
    stock_unit_id: UNITS[1].id,
    unit_cost: 0,
    is_prep: true,
    image_url: null,
    current_qty: 0,
    reorder_level: 0,
    is_active: false,
    created_at: '',
    updated_at: '',
  },
]

function asFile(name: string, data: ArrayBuffer | string) {
  const bytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data)
  return {
    name,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    text: async () => bytes.toString('utf8'),
  }
}

async function planFrom(name: string, data: ArrayBuffer | string) {
  const read = await readSpreadsheetFile(asFile(name, data))
  if (!read.ok) throw new Error(read.message)
  const sheet = toImportSheet(read.grid)
  const mapping = matchColumns(sheet.headers)
  return {
    sheet,
    mapping,
    plan: buildImportPlan(sheet, mapping, INGREDIENTS, UNITS, { updateExistingStock: true, unitOverrides: {} }),
  }
}

describe('ingredient workbooks', () => {
  it('writes a blank template whose header row the importer matches completely', async () => {
    const buffer = await buildIngredientsWorkbook({ table: { headers: TEMPLATE_HEADERS, rows: [] }, units: UNITS })
    const { sheet, mapping } = await planFrom('template.xlsx', buffer)

    expect(sheet.headers).toEqual(TEMPLATE_HEADERS)
    expect(sheet.rows).toEqual([])
    expect(isEveryColumnMatched(sheet.headers, mapping)).toBe(true)
  })

  it('reads an Excel export back as "nothing changed"', async () => {
    const buffer = await buildIngredientsWorkbook({ table: buildIngredientExport(INGREDIENTS, UNITS), units: UNITS })
    const { plan } = await planFrom('export.xlsx', buffer)

    expect(plan.summary).toMatchObject({ total: 2, unchanged: 2, error: 0 })
  })

  it('reads a CSV export back as "nothing changed", accents and commas intact', async () => {
    const csv = buildCsvText(buildIngredientExport(INGREDIENTS, UNITS))
    const { plan } = await planFrom('export.csv', csv)

    expect(plan.rows.map((row) => row.name)).toEqual(['Mozzarella, shredded', 'Jalapeño salsa'])
    expect(plan.summary).toMatchObject({ unchanged: 2, error: 0 })
  })

  it('explains the files it cannot open', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(await readSpreadsheetFile(asFile('old.xls', 'x'))).toMatchObject({ ok: false, message: expect.stringContaining('.xlsx') })
    expect(await readSpreadsheetFile(asFile('menu.pdf', 'x'))).toMatchObject({ ok: false })
    expect(await readSpreadsheetFile(asFile('broken.xlsx', 'not a zip'))).toMatchObject({ ok: false })
    consoleError.mockRestore()
  })
})
