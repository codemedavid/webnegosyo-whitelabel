/**
 * The import plan: what each spreadsheet row will do before anything is saved.
 *
 * The review screen shows this plan, and the server receives it. Its rules are
 * the ones a merchant would guess: a row names an ingredient they already have
 * → it updates it; a new name → it adds one; a blank cell → leave it alone. The
 * rule they would NOT guess, and therefore the one pinned hardest, is that an
 * existing ingredient's stock is never overwritten unless they asked for it.
 */

import { buildImportPlan, toImportBatches, type PlanOptions } from '@/lib/inventory/import/import-plan'
import { mergeImportedItems } from '@/lib/inventory/import/merge-items'
import { matchColumns } from '@/lib/inventory/import/column-matching'
import { toImportSheet } from '@/lib/inventory/import/sheet'
import { normalizeUnitText } from '@/lib/inventory/import/unit-matching'
import type { InventoryItem } from '@/types/database'

const UNITS = [
  { id: '00000000-0000-4000-8000-00000000000a', name: 'Kilogram', abbreviation: 'kg' },
  { id: '00000000-0000-4000-8000-00000000000b', name: 'Piece', abbreviation: 'pc' },
]
const [KG, PC] = UNITS

const existing = (overrides: Partial<InventoryItem>): InventoryItem => ({
  id: '00000000-0000-4000-8000-000000000001',
  tenant_id: 't1',
  name: 'Flour',
  sku: 'FL-1',
  category: 'Dry goods',
  stock_unit_id: KG.id,
  unit_cost: 50,
  is_prep: false,
  image_url: 'https://img.test/flour.jpg',
  current_qty: 10,
  reorder_level: 2,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const OPTIONS: PlanOptions = { updateExistingStock: false, unitOverrides: {} }

function plan(grid: string[][], ingredients: InventoryItem[] = [], options = OPTIONS) {
  const sheet = toImportSheet(grid)
  return buildImportPlan(sheet, matchColumns(sheet.headers), ingredients, UNITS, options)
}

const HEADER = ['Name', 'SKU', 'Category', 'Unit', 'Unit cost', 'Reorder level', 'On hand']

describe('buildImportPlan — new ingredients', () => {
  it('adds a new ingredient with its opening stock', () => {
    const result = plan([HEADER, ['Mozzarella', 'CH-1', 'Dairy', 'kg', '₱450', '1', '3']])

    expect(result.summary).toMatchObject({ create: 1, update: 0, error: 0, total: 1 })
    expect(result.rows[0]).toMatchObject({
      rowNumber: 2,
      status: 'create',
      existingId: null,
      onHand: 3,
      input: {
        name: 'Mozzarella',
        sku: 'CH-1',
        category: 'Dairy',
        stock_unit_id: KG.id,
        unit_cost: 450,
        reorder_level: 1,
        is_prep: false,
        is_active: true,
      },
    })
  })

  it('fills in sensible defaults for the columns a file does not have', () => {
    const result = plan([['Name', 'Unit'], ['Eggs', 'pcs']])

    expect(result.rows[0].input).toEqual({
      name: 'Eggs',
      sku: null,
      category: null,
      stock_unit_id: PC.id,
      unit_cost: 0,
      reorder_level: 0,
      is_prep: false,
      is_active: true,
    })
    expect(result.rows[0].onHand).toBeNull()
  })

  it('needs a unit for a new ingredient', () => {
    const result = plan([['Name', 'Unit'], ['Eggs', '']])

    expect(result.rows[0].status).toBe('error')
    expect(result.rows[0].issues[0]).toMatchObject({ field: 'unit', severity: 'error' })
  })

  it('collects the unit words it could not read so they can be fixed once, not per row', () => {
    const result = plan([
      ['Name', 'Unit'],
      ['Soy sauce', 'Bottle'],
      ['Vinegar', 'bottles'],
      ['Rice', 'sack'],
    ])

    expect(result.summary.error).toBe(3)
    expect(result.unresolvedUnits).toEqual([
      { key: normalizeUnitText('Bottle'), label: 'Bottle', rowCount: 2 },
      { key: 'sack', label: 'sack', rowCount: 1 },
    ])
  })

  it('imports those rows once the merchant says what the word means', () => {
    const result = plan(
      [['Name', 'Unit'], ['Soy sauce', 'Bottle']],
      [],
      { ...OPTIONS, unitOverrides: { [normalizeUnitText('bottle')]: PC.id } },
    )

    expect(result.rows[0]).toMatchObject({ status: 'create', input: { stock_unit_id: PC.id } })
    expect(result.unresolvedUnits).toEqual([])
  })

  it('explains a number it cannot read instead of saving zero', () => {
    const result = plan([HEADER, ['Cheese', '', '', 'kg', 'cheap', '-1', '']])

    expect(result.rows[0].status).toBe('error')
    expect(result.rows[0].issues.map((issue) => issue.field)).toEqual(['unit_cost', 'reorder_level'])
    expect(result.rows[0].issues[0].message).toContain('cheap')
  })

  it('refuses a yes/no answer it cannot read', () => {
    const result = plan([['Name', 'Unit', 'Prep item'], ['Dough', 'kg', 'sometimes']])

    expect(result.rows[0].issues[0]).toMatchObject({ field: 'is_prep', severity: 'error' })
  })

  it('flags a row with no name but other content', () => {
    const result = plan([['Name', 'Unit'], ['', 'kg']])

    expect(result.rows[0]).toMatchObject({ status: 'error', name: '' })
    expect(result.rows[0].issues[0].field).toBe('name')
  })

  it('imports the first of two rows for the same new ingredient and flags the second', () => {
    const result = plan([['Name', 'Unit'], ['Garlic', 'kg'], [' garlic ', 'kg']])

    expect(result.rows.map((row) => row.status)).toEqual(['create', 'error'])
    expect(result.rows[1].issues[0].message).toContain('row 2')
  })
})

describe('buildImportPlan — existing ingredients', () => {
  it('matches by SKU first, then by name, ignoring case', () => {
    const flour = existing({})
    const bySku = plan([['Name', 'SKU'], ['Bread flour', 'fl-1']], [flour])
    const byName = plan([['Name'], ['  FLOUR ']], [flour])

    expect(bySku.rows[0]).toMatchObject({ status: 'update', existingId: flour.id })
    expect(byName.rows[0]).toMatchObject({ status: 'unchanged', existingId: flour.id })
  })

  it('changes only the cells that were filled in, and lists each change', () => {
    const result = plan([HEADER, ['Flour', '', '', '', '55', '', '']], [existing({})])

    expect(result.rows[0].status).toBe('update')
    expect(result.rows[0].changes).toEqual([{ field: 'unit_cost', label: 'Unit cost', from: '50', to: '55' }])
    expect(result.rows[0].input).toMatchObject({
      sku: 'FL-1',
      category: 'Dry goods',
      unit_cost: 55,
      reorder_level: 2,
    })
  })

  it('reports an identical row as unchanged so it is not re-saved', () => {
    const result = plan([HEADER, ['Flour', 'FL-1', 'Dry goods', 'kg', '50', '2', '10']], [existing({})])

    expect(result.rows[0].status).toBe('unchanged')
    expect(result.summary.unchanged).toBe(1)
  })

  it('never overwrites existing stock unless the merchant opted in', () => {
    const grid = [HEADER, ['Flour', '', '', '', '', '', '4']]
    const off = plan(grid, [existing({})])
    const on = plan(grid, [existing({})], { ...OPTIONS, updateExistingStock: true })

    expect(off.rows[0]).toMatchObject({ status: 'unchanged', onHand: null })
    expect(on.rows[0]).toMatchObject({ status: 'update', onHand: 4 })
    expect(on.rows[0].changes).toEqual([{ field: 'on_hand', label: 'On hand', from: '10', to: '4' }])
  })

  it('keeps the unit of an existing ingredient and says why', () => {
    const result = plan([['Name', 'Unit'], ['Flour', 'pc']], [existing({})])

    expect(result.rows[0].status).toBe('unchanged')
    expect(result.rows[0].input?.stock_unit_id).toBe(KG.id)
    expect(result.rows[0].issues[0]).toMatchObject({ field: 'unit', severity: 'warning' })
  })

  it('does not ask about an unreadable unit on an ingredient that keeps its own', () => {
    const result = plan([['Name', 'Unit'], ['Flour', 'sack']], [existing({})])

    expect(result.unresolvedUnits).toEqual([])
    expect(result.rows[0].status).not.toBe('error')
  })

  it('flags a second row that points at the same existing ingredient', () => {
    const result = plan([['Name', 'SKU'], ['Flour', ''], ['Other name', 'FL-1']], [existing({})])

    expect(result.rows[1].status).toBe('error')
  })
})

describe('toImportBatches', () => {
  it('sends only rows that do something, in fixed-size batches', () => {
    const result = plan(
      [
        ['Name', 'Unit'],
        ['A', 'kg'],
        ['B', 'kg'],
        ['Flour', ''],
        ['C', 'nope'],
        ['D', 'kg'],
      ],
      [existing({})],
    )

    const batches = toImportBatches(result, 2)

    expect(batches.map((batch) => batch.map((row) => row.rowNumber))).toEqual([[2, 3], [6]])
    expect(batches[0][0]).toEqual({
      rowNumber: 2,
      existingId: null,
      input: expect.objectContaining({ name: 'A' }),
      onHand: null,
    })
  })
})

describe('mergeImportedItems', () => {
  it('replaces updated ingredients in place and adds new ones, keeping the list in name order', () => {
    const flour = existing({})
    const salt = existing({ id: 'salt', name: 'Salt' })
    const cheaperFlour = { ...flour, unit_cost: 40 }
    const basil = existing({ id: 'basil', name: 'Basil' })

    const merged = mergeImportedItems([flour, salt], [cheaperFlour, basil])

    expect(merged.map((item) => item.name)).toEqual(['Basil', 'Flour', 'Salt'])
    expect(merged.find((item) => item.id === flour.id)?.unit_cost).toBe(40)
  })
})
