/**
 * The storefront menu is cached as a column table: one list of keys, then one
 * array of values per row. Measured on the 4066-item store, repeating the 18
 * column names in every row was ~55% of the cached entry — enough to push it
 * past Next's 2 MB data-cache limit, after which every page view re-ran the
 * whole query plan.
 */
import { decodeRowTable, encodeRowTable } from '@/lib/storefront/row-table-codec'

describe('row table codec', () => {
  test('round-trips rows exactly, including nulls, nested JSON and falsy values', () => {
    const rows = [
      { id: 'a', price: 0, is_available: false, badge_text: null, variations: [{ name: 'L', price: 20 }], modifier_groups: null },
      { id: 'b', price: 120.5, is_available: true, badge_text: 'Hot', variations: [], modifier_groups: [{ id: 'g', options: [] }] },
    ]

    const decoded = decodeRowTable(JSON.parse(JSON.stringify(encodeRowTable(rows))))

    expect(decoded).toEqual(rows)
  })

  test('an empty list encodes and decodes to an empty list', () => {
    expect(decodeRowTable(encodeRowTable([]))).toEqual([])
  })

  test('names each column once rather than once per row', () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({ id: `id-${index}`, description: 'x' }))

    const encoded = JSON.stringify(encodeRowTable(rows))

    expect(encoded.match(/"description"/g)).toHaveLength(1)
    expect(encoded.length).toBeLessThan(JSON.stringify(rows).length)
  })

  test('a column missing from some rows decodes as absent on those rows', () => {
    const rows: Record<string, unknown>[] = [{ id: 'a', extra: 1 }, { id: 'b' }]

    const decoded = decodeRowTable<Record<string, unknown>>(JSON.parse(JSON.stringify(encodeRowTable(rows))))

    expect(decoded).toEqual(rows)
    expect('extra' in decoded[1]).toBe(false)
  })
})
