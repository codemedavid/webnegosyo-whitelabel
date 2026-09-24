/**
 * CSV in and out, and the export that the importer can read back.
 *
 * The round trip is the feature: export, edit in any spreadsheet app, import,
 * and every ingredient lands back where it was.
 */

import { parseCsv, toCsv } from '@/lib/inventory/import/csv'
import { MAX_IMPORT_ROWS, toImportSheet } from '@/lib/inventory/import/sheet'
import { buildIngredientExport, exportFileName } from '@/lib/inventory/import/export-table'
import { TEMPLATE_HEADERS } from '@/lib/inventory/import/fields'
import type { InventoryItem } from '@/types/database'

describe('parseCsv', () => {
  it('reads quoted cells with commas, quotes and line breaks inside them', () => {
    const text = 'Name,Note\r\n"Cheese, grated","He said ""fresh"""\n"Two\nlines",x\n'

    expect(parseCsv(text)).toEqual([
      ['Name', 'Note'],
      ['Cheese, grated', 'He said "fresh"'],
      ['Two\nlines', 'x'],
    ])
  })

  it('drops the byte-order mark Excel writes at the start of a UTF-8 CSV', () => {
    expect(parseCsv('﻿Name\nFlour')).toEqual([['Name'], ['Flour']])
  })

  it('detects semicolon and tab separated files', () => {
    expect(parseCsv('Name;Cost\nFlour;1,50')).toEqual([
      ['Name', 'Cost'],
      ['Flour', '1,50'],
    ])
    expect(parseCsv('Name\tCost\nFlour\t2')).toEqual([
      ['Name', 'Cost'],
      ['Flour', '2'],
    ])
  })

  it('returns nothing for an empty file', () => {
    expect(parseCsv('')).toEqual([])
  })
})

describe('toCsv', () => {
  it('quotes only the cells that need it', () => {
    expect(toCsv([['Name', 'Cost'], ['Cheese, grated', 2.5], ['Plain', null]])).toBe(
      'Name,Cost\r\n"Cheese, grated",2.5\r\nPlain,',
    )
  })

  it('defuses text a spreadsheet would run as a formula', () => {
    expect(toCsv([['=HYPERLINK("x")', '+1', '@cmd']])).toBe(`"'=HYPERLINK(""x"")",'+1,'@cmd`)
  })

  it('round-trips through parseCsv', () => {
    const rows = [['Name', 'Note'], ['a "b", c', 'line\nbreak']]

    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })
})

describe('toImportSheet', () => {
  it('takes the first non-empty row as the header and numbers rows as the spreadsheet does', () => {
    const sheet = toImportSheet([
      [],
      ['Name', 'Unit'],
      ['Flour', 'kg'],
      ['', ''],
      ['Sugar'],
    ])

    expect(sheet.headers).toEqual(['Name', 'Unit'])
    expect(sheet.rows).toEqual([
      { rowNumber: 3, cells: ['Flour', 'kg'] },
      { rowNumber: 5, cells: ['Sugar', ''] },
    ])
  })

  it('trims cells and widens the header to the widest row', () => {
    const sheet = toImportSheet([['Name'], ['  Flour ', 'extra']])

    expect(sheet.headers).toEqual(['Name', ''])
    expect(sheet.rows[0].cells).toEqual(['Flour', 'extra'])
  })

  it('is empty for a file with no content', () => {
    expect(toImportSheet([[''], []])).toEqual({ headers: [], rows: [] })
  })

  it('caps how many rows one import may carry', () => {
    expect(MAX_IMPORT_ROWS).toBeGreaterThanOrEqual(1000)
  })
})

const item = (overrides: Partial<InventoryItem>): InventoryItem => ({
  id: 'i1',
  tenant_id: 't1',
  name: 'Flour',
  sku: null,
  category: null,
  stock_unit_id: 'kg',
  unit_cost: 0,
  is_prep: false,
  image_url: null,
  current_qty: 0,
  reorder_level: 0,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('buildIngredientExport', () => {
  it('writes the template columns so the file imports straight back', () => {
    const table = buildIngredientExport(
      [
        item({
          name: 'Mozzarella',
          sku: 'CH-01',
          category: 'Dairy',
          unit_cost: 450.5,
          reorder_level: 2,
          current_qty: 4.25,
          is_prep: false,
          is_active: true,
        }),
        item({ id: 'i2', name: 'Pizza sauce', stock_unit_id: 'gone', is_prep: true, is_active: false }),
      ],
      [{ id: 'kg', name: 'Kilogram', abbreviation: 'kg' }],
    )

    expect(table.headers).toEqual(TEMPLATE_HEADERS)
    expect(table.rows).toEqual([
      ['Mozzarella', 'CH-01', 'Dairy', 'kg', 450.5, 2, 4.25, 'No', 'Yes'],
      ['Pizza sauce', '', '', '', 0, 0, 0, 'Yes', 'No'],
    ])
  })

  it('trims the float noise a NUMERIC round-trip leaves', () => {
    const table = buildIngredientExport([item({ current_qty: 0.1 + 0.2 })], [])

    expect(table.rows[0][6]).toBe(0.3)
  })
})

describe('exportFileName', () => {
  it('names the file after the store and the day', () => {
    const date = new Date('2026-09-24T10:00:00Z')

    expect(exportFileName('ingredients', 'xlsx', "Juan's Café", date)).toBe(
      'juans-cafe-ingredients-2026-09-24.xlsx',
    )
    expect(exportFileName('template', 'csv', '', date)).toBe('ingredients-template.csv')
  })
})
