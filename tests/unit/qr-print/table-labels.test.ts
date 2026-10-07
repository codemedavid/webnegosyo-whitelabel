import { describe, it, expect } from '@jest/globals'
import { MAX_TABLE_LABELS, parseTableLabels } from '@/lib/qr-print/table-labels'

describe('parseTableLabels', () => {
  it('expands a numeric range', () => {
    expect(parseTableLabels('1-5')).toEqual({ labels: ['1', '2', '3', '4', '5'], error: null })
  })

  it('expands a prefixed range and keeps the prefix', () => {
    expect(parseTableLabels('A1 - A3').labels).toEqual(['A1', 'A2', 'A3'])
  })

  it('keeps zero padding when both ends are padded', () => {
    expect(parseTableLabels('08-11').labels).toEqual(['08', '09', '10', '11'])
  })

  it('reads lists separated by commas and new lines, mixed with ranges', () => {
    expect(parseTableLabels('Patio 1, patio 2\nBar\n1-2').labels).toEqual(['PATIO 1', 'PATIO 2', 'BAR', '1', '2'])
  })

  it('drops duplicates after normalizing', () => {
    expect(parseTableLabels('table 3, 3, T3').labels).toEqual(['3', 'T3'])
  })

  it('accepts a range written backwards', () => {
    expect(parseTableLabels('3-1').labels).toEqual(['1', '2', '3'])
  })

  it('refuses a range whose prefixes differ', () => {
    expect(parseTableLabels('A1-B3').error).toMatch(/A1-B3/)
  })

  it(`refuses more than ${MAX_TABLE_LABELS} tables`, () => {
    const result = parseTableLabels(`1-${MAX_TABLE_LABELS + 1}`)
    expect(result.labels).toEqual([])
    expect(result.error).toMatch(String(MAX_TABLE_LABELS))
  })

  it('refuses a label longer than the floor plan allows', () => {
    expect(parseTableLabels('x'.repeat(25)).error).toMatch(/24/)
  })

  it('returns nothing, without an error, for blank input', () => {
    expect(parseTableLabels('  ,\n ')).toEqual({ labels: [], error: null })
  })

  it('treats a hyphenated name without numbers as one label', () => {
    expect(parseTableLabels('Roof-top').labels).toEqual(['ROOF-TOP'])
  })
})
