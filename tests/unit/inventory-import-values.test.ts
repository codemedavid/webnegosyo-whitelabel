/**
 * Reading cell values the way a merchant types them.
 *
 * "₱1,250.50", "yes", "kgs" and "pcs" are all correct answers. The importer's
 * job is to understand them — and to say so plainly when it cannot, instead of
 * quietly reading a typo as zero.
 */

import { cellToText, parseNumberCell, parseYesNoCell } from '@/lib/inventory/import/value-parsing'
import { normalizeUnitText, resolveUnit, type ImportUnit } from '@/lib/inventory/import/unit-matching'

describe('parseNumberCell', () => {
  it.each([
    ['12', 12],
    ['12.5', 12.5],
    ['.5', 0.5],
    ['1,250.50', 1250.5],
    ['₱1,250', 1250],
    ['PHP 99.95', 99.95],
    ['  7 ', 7],
    ['-3', -3],
  ])('reads %p as %p', (raw, expected) => {
    expect(parseNumberCell(raw)).toEqual({ kind: 'value', value: expected })
  })

  it('reports a blank cell as blank, not zero', () => {
    expect(parseNumberCell('  ')).toEqual({ kind: 'blank' })
  })

  it('refuses text instead of reading it as zero', () => {
    expect(parseNumberCell('about 5')).toEqual({ kind: 'invalid', raw: 'about 5' })
    expect(parseNumberCell('1.2.3')).toEqual({ kind: 'invalid', raw: '1.2.3' })
  })
})

describe('parseYesNoCell', () => {
  it.each(['Yes', 'y', 'TRUE', '1', 'Prep', 'active', 'In use', '✓'])('reads %p as yes', (raw) => {
    expect(parseYesNoCell(raw)).toEqual({ kind: 'value', value: true })
  })

  it.each(['No', 'n', 'false', '0', 'raw', 'Inactive', 'retired'])('reads %p as no', (raw) => {
    expect(parseYesNoCell(raw)).toEqual({ kind: 'value', value: false })
  })

  it('reports blank and unreadable answers separately', () => {
    expect(parseYesNoCell('')).toEqual({ kind: 'blank' })
    expect(parseYesNoCell('maybe')).toEqual({ kind: 'invalid', raw: 'maybe' })
  })
})

describe('cellToText', () => {
  it('turns every kind of spreadsheet value into the text it displays', () => {
    expect(cellToText(null)).toBe('')
    expect(cellToText(undefined)).toBe('')
    expect(cellToText('  Flour ')).toBe('Flour')
    expect(cellToText(12.5)).toBe('12.5')
    expect(cellToText(true)).toBe('Yes')
    expect(cellToText(false)).toBe('No')
    expect(cellToText({ richText: [{ text: 'Mozza' }, { text: 'rella' }] })).toBe('Mozzarella')
    expect(cellToText({ formula: 'A1*2', result: 24 })).toBe('24')
    expect(cellToText({ text: 'Supplier', hyperlink: 'https://x.test' })).toBe('Supplier')
    expect(cellToText({ error: '#DIV/0!' })).toBe('')
  })

  it('writes a date as its calendar day', () => {
    expect(cellToText(new Date('2026-09-24T00:00:00Z'))).toBe('2026-09-24')
  })

  it('removes the apostrophe our own export puts in front of formula-like text', () => {
    expect(cellToText("'=SUM(A1)")).toBe('=SUM(A1)')
    expect(cellToText("'plain")).toBe("'plain")
  })
})

const UNITS: ImportUnit[] = [
  { id: 'g', name: 'Gram', abbreviation: 'g' },
  { id: 'kg', name: 'Kilogram', abbreviation: 'kg' },
  { id: 'ml', name: 'Millilitre', abbreviation: 'ml' },
  { id: 'l', name: 'Litre', abbreviation: 'L' },
  { id: 'pc', name: 'Piece', abbreviation: 'pc' },
  { id: 'lb', name: 'Pound', abbreviation: 'lb' },
  { id: 'sack', name: 'Sack', abbreviation: 'sack' },
]

describe('resolveUnit', () => {
  it.each([
    ['kg', 'kg'],
    ['KG', 'kg'],
    ['kgs', 'kg'],
    ['Kilo', 'kg'],
    ['kilograms', 'kg'],
    ['grams', 'g'],
    ['gm', 'g'],
    ['liter', 'l'],
    ['Litres', 'l'],
    ['ltr', 'l'],
    ['mL', 'ml'],
    ['pcs', 'pc'],
    ['pieces', 'pc'],
    ['each', 'pc'],
    ['lbs', 'lb'],
    ['Sacks', 'sack'],
  ])('reads %p as the %p unit', (raw, id) => {
    expect(resolveUnit(raw, UNITS)?.id).toBe(id)
  })

  it('does not invent a unit the store never set up', () => {
    expect(resolveUnit('dozen', UNITS)).toBeNull()
    expect(resolveUnit('bottle', UNITS)).toBeNull()
    expect(resolveUnit('', UNITS)).toBeNull()
  })

  it('uses the unit the merchant picked for a word it could not read', () => {
    const overrides = { [normalizeUnitText('Bottle')]: 'ml' }

    expect(resolveUnit('bottles', UNITS, overrides)?.id).toBe('ml')
  })

  it('ignores a picked unit that no longer exists', () => {
    expect(resolveUnit('bottle', UNITS, { bottle: 'gone' })).toBeNull()
  })
})
