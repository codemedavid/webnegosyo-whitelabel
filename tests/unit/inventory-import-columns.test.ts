/**
 * Column matching for the ingredient import.
 *
 * A merchant's spreadsheet is whatever their supplier or their last system
 * produced: "Item", "UOM", "Cost (₱)", "Qty". The importer guesses what each
 * column is so most files need no matching at all, and the merchant only
 * corrects the guesses that are wrong.
 */

import {
  assignColumn,
  isEveryColumnMatched,
  matchColumns,
  missingRequiredFields,
  normalizeHeader,
} from '@/lib/inventory/import/column-matching'
import { IMPORT_FIELDS, TEMPLATE_HEADERS } from '@/lib/inventory/import/fields'

describe('normalizeHeader', () => {
  it('ignores case, spacing, punctuation and a bracketed currency or note', () => {
    expect(normalizeHeader('  Unit Cost (₱) ')).toBe('unitcost')
    expect(normalizeHeader('Re-order level')).toBe('reorderlevel')
    expect(normalizeHeader('Name (required)')).toBe('name')
  })
})

describe('matchColumns', () => {
  it('matches every column of our own template, in order', () => {
    const mapping = matchColumns(TEMPLATE_HEADERS)

    expect(mapping).toEqual(IMPORT_FIELDS.map((field) => field.key))
  })

  it('recognises the names other systems give the same columns', () => {
    const mapping = matchColumns(['Item', 'UOM', 'Cost', 'Qty', 'Par level', 'Group', 'Code'])

    expect(mapping).toEqual([
      'name',
      'unit',
      'unit_cost',
      'on_hand',
      'reorder_level',
      'category',
      'sku',
    ])
  })

  it('leaves a column it does not recognise unmatched rather than guessing', () => {
    expect(matchColumns(['Name', 'Supplier', 'Notes'])).toEqual(['name', null, null])
  })

  it('gives a field to one column only — the first that claims it', () => {
    expect(matchColumns(['Name', 'Ingredient'])).toEqual(['name', null])
  })

  it('falls back to a header that merely contains a known name', () => {
    expect(matchColumns(['Ingredient', 'Total quantity'])).toEqual(['name', 'on_hand'])
  })

  it('prefers an exact match over a contains match wherever it sits', () => {
    // "Stock unit price" contains "stock"; the exact "Qty" must still win on_hand.
    expect(matchColumns(['Name', 'Stock level note', 'Qty'])).toEqual(['name', null, 'on_hand'])
  })
})

describe('assignColumn', () => {
  it('moves a field off the column that had it, so it is never mapped twice', () => {
    const mapping = assignColumn(['name', null, 'unit'], 1, 'unit')

    expect(mapping).toEqual(['name', 'unit', null])
  })

  it('clears a column when told to skip it', () => {
    expect(assignColumn(['name', 'unit'], 1, null)).toEqual(['name', null])
  })

  it('does not change the mapping it was given', () => {
    const original = ['name', null] as const
    assignColumn(original, 1, 'sku')

    expect(original).toEqual(['name', null])
  })
})

describe('missingRequiredFields', () => {
  it('asks for the name column, which every row needs', () => {
    expect(missingRequiredFields(['unit', null]).map((field) => field.key)).toEqual(['name'])
    expect(missingRequiredFields(['name', 'unit'])).toEqual([])
  })
})

describe('isEveryColumnMatched', () => {
  it('is true only when each titled column found a field', () => {
    expect(isEveryColumnMatched(['Name', 'Unit'], ['name', 'unit'])).toBe(true)
    expect(isEveryColumnMatched(['Name', 'Notes'], ['name', null])).toBe(false)
  })

  it('ignores untitled, empty columns trailing off the edge of a sheet', () => {
    expect(isEveryColumnMatched(['Name', ''], ['name', null])).toBe(true)
  })
})
