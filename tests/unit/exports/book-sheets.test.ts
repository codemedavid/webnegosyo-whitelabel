/**
 * The store's other books in an export: cash in and out, stock on hand and
 * stock movements, read through a client that hands back a few rows per
 * response (a reader that stops at the first page fails here).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { previewExport, runExport, type ExportInput } from '@/lib/exports/run-export'
import type { BuiltSheet } from '@/lib/exports/types'
import { DAY, NOW, TENANT, access, contextFor, noReports, seedStore } from './export-fixtures'

const PAGE = 3
const AT = (hour: number) => `${DAY.from}T${String(hour).padStart(2, '0')}:00:00+08:00`

const moves = [
  { id: 'm1', tenant_id: TENANT, shift_id: 's1', outlet_id: null, kind: 'pay_out', amount: 250, reason: 'Ice', recorded_by_name: 'Ana', taken_by_name: 'Ben', to_safe: false, created_at: AT(9) },
  { id: 'm2', tenant_id: TENANT, shift_id: 's1', outlet_id: null, kind: 'pay_in', amount: 500, reason: 'Change fund', recorded_by_name: 'Ana', taken_by_name: null, to_safe: false, created_at: AT(10) },
  { id: 'm3', tenant_id: TENANT, shift_id: 's1', outlet_id: null, kind: 'collect', amount: 1000, reason: null, recorded_by_name: 'Ana', taken_by_name: 'Owner', to_safe: true, created_at: AT(11) },
  { id: 'm4', tenant_id: TENANT, shift_id: 's1', outlet_id: null, kind: 'pay_out', amount: 80.5, reason: 'Tape', recorded_by_name: 'Ana', taken_by_name: null, to_safe: false, created_at: AT(12) },
  { id: 'other', tenant_id: 'another-store', shift_id: 's9', outlet_id: null, kind: 'pay_out', amount: 9999, reason: 'x', recorded_by_name: 'x', taken_by_name: null, to_safe: false, created_at: AT(12) },
]

const items = [
  { id: 'i1', tenant_id: TENANT, name: 'Rice', category: 'Dry', stock_unit_id: 'u1', current_qty: 12, reorder_level: 5, is_active: true, counted_at: null },
  { id: 'i2', tenant_id: TENANT, name: 'Eggs', category: null, stock_unit_id: 'u2', current_qty: 4, reorder_level: 6, is_active: true, counted_at: AT(8) },
  { id: 'i3', tenant_id: TENANT, name: 'Milk', category: null, stock_unit_id: 'u1', current_qty: 0, reorder_level: 0, is_active: true, counted_at: null },
  { id: 'i4', tenant_id: TENANT, name: 'Old syrup', category: null, stock_unit_id: 'u1', current_qty: 3, reorder_level: 0, is_active: false, counted_at: null },
]
const units = [
  { id: 'u1', tenant_id: TENANT, abbreviation: 'kg' },
  { id: 'u2', tenant_id: TENANT, abbreviation: 'pc' },
]
const movements = Array.from({ length: 8 }, (_, index) => ({
  id: `sm${index}`,
  tenant_id: TENANT,
  inventory_item_id: index % 2 === 0 ? 'i1' : 'i2',
  outlet_id: null,
  reason: index === 0 ? 'receive' : 'sale',
  quantity_delta: index === 0 ? 20 : -1,
  balance_after: 20 - index,
  note: null,
  order_id: index === 0 ? null : `o-${index}`,
  created_at: AT(8 + index),
}))

function input(sheets: ExportInput['sheets'], keys: Parameters<typeof access> = ['reports', 'cash_manage', 'inventory']): ExportInput {
  const store = seedStore([], { shift_cash_movements: moves, inventory_items: items, inventory_units: units, stock_movements: movements, inventory_stock: [] }, PAGE)
  return {
    context: contextFor({ period: 'custom', ...DAY }),
    storeName: 'Shop',
    access: access(...keys),
    reportClient: noReports,
    detailClient: store.client,
    bookClient: store.client as unknown as SupabaseClient,
    sheets,
    now: NOW,
    pageSize: PAGE,
  }
}

function column(sheet: BuiltSheet, id: string): unknown[] {
  const index = sheet.columns.findIndex((entry) => entry.id === id)
  if (index < 0) throw new Error(`no column ${id}`)
  return sheet.rows.map((row) => row[index])
}

describe('cash in and out', () => {
  it('lists every movement of this store past the page size; money in is a plus, money out a minus', async () => {
    const { sheets } = await runExport(input(['cash_moves']))
    expect(column(sheets[0], 'amount')).toEqual([-250, 500, -1000, -80.5])
    expect(column(sheets[0], 'kind')).toEqual(['Cash paid out', 'Cash put in', 'Cash collected from the drawer', 'Cash paid out'])
    expect(column(sheets[0], 'to_safe')).toEqual([null, null, 'Yes', null])
  })

  it('is left out, with the reason, for an account without the cash key', async () => {
    const result = await runExport(input(['cash_moves', 'stock_on_hand'], ['reports', 'inventory']))
    expect(result.sheets.map((sheet) => sheet.id)).toEqual(['stock_on_hand'])
    expect(result.leftOut.map((sheet) => sheet.id)).toEqual(['cash_moves'])
  })

  it('previews the count and the first rows without reading the book whole', async () => {
    const preview = await previewExport({ ...input(['cash_moves']), pageSize: undefined })
    expect(preview.sheets[0].rows).toBe(4)
    // The fake hands back three rows a response: the count is of the whole book, the peek is one page.
    expect(preview.sheets[0].peek).toHaveLength(PAGE)
  })
})

describe('stock on hand', () => {
  it('lists active ingredients with their state, and no cost columns without the costs key', async () => {
    const { sheets } = await runExport(input(['stock_on_hand']))
    const [sheet] = sheets
    expect(sheet.columns.map((entry) => entry.id)).not.toContain('unit_cost')
    expect(sheet.columns.map((entry) => entry.id)).not.toContain('value')
    expect(column(sheet, 'ingredient')).toEqual(['Eggs', 'Milk', 'Rice'])
    expect(column(sheet, 'state')).toEqual(['Low', 'Out', 'OK'])
    expect(column(sheet, 'unit')).toEqual(['pc', 'kg', 'kg'])
    expect(sheet.notes.join(' ')).toMatch(/on the shelf now/)
  })
})

describe('stock movements', () => {
  it('lists every movement in order, named, past the page size', async () => {
    const { sheets } = await runExport(input(['stock_movements']))
    const [sheet] = sheets
    expect(sheet.rows).toHaveLength(movements.length)
    expect(column(sheet, 'reason').slice(0, 2)).toEqual(['Received', 'Sold'])
    expect(column(sheet, 'ingredient').slice(0, 2)).toEqual(['Rice', 'Eggs'])
    expect(column(sheet, 'change').reduce((sum: number, value) => sum + Number(value), 0)).toBe(20 - 7)
  })
})

describe('range', () => {
  it('holds the books to the row-by-row range', async () => {
    const long = { ...input(['stock_movements']), context: contextFor({ period: 'custom', from: '2026-01-01', to: '2026-06-30' }) }
    await expect(runExport(long)).rejects.toThrow(/up to 93 days/)
  })
})
