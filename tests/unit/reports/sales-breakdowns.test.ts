/**
 * Breakdowns: every row set adds up to net sales, labels never depend on the
 * order rows were read in (the SQL report functions mirror these rules).
 */
import {
  UNCATEGORISED_LABEL,
  categoryKey,
  itemKey,
  rollupCategories,
  rollupHours,
  rollupItems,
  rollupPeriods,
} from '@/lib/reports/sales-breakdowns'
import { UNRECORDED_LINE_NAME, summarizeSales } from '@/lib/reports/sales-model'
import { line, order } from './report-fixtures'

const at = (iso: string) => Date.parse(iso)

describe('keys', () => {
  test('a dish is its menu row; a deleted dish its folded name; unrecorded lines their own bucket', () => {
    expect(itemKey({ menuItemId: 'd1', name: 'Adobo', isUnrecorded: false })).toBe('id:d1')
    expect(itemKey({ menuItemId: null, name: '  Pork  Adobo! ', isUnrecorded: false })).toBe('name:pork adobo')
    expect(itemKey({ menuItemId: null, name: UNRECORDED_LINE_NAME, isUnrecorded: true })).toBe('unrecorded')
  })

  test('a category is its folded name; none is uncategorised', () => {
    expect(categoryKey({ categoryName: ' Rice  Meals', isUnrecorded: false })).toBe('name:rice meals')
    expect(categoryKey({ categoryName: null, isUnrecorded: false })).toBe('uncategorised')
    expect(categoryKey({ categoryName: null, isUnrecorded: true })).toBe('unrecorded')
  })
})

describe('rollupItems', () => {
  test('rows add up to net sales; quantity and orders per dish; discounts shared by value', () => {
    const orders = [
      order({
        id: 'a',
        total: 270,
        discount: { total: 30, deliveryDiscount: 0, lines: [], allocationsByLine: {} },
        lines: [line({ id: 'l1', menuItemId: 'd1', name: 'Adobo', subtotal: 200, quantity: 2 }), line({ id: 'l2', menuItemId: 'd2', name: 'Rice', subtotal: 100 })],
      }),
      order({ id: 'b', total: 100, lines: [line({ id: 'l3', menuItemId: 'd1', name: 'Adobo', subtotal: 100 })] }),
      order({ id: 'c', total: 50, status: 'cancelled', lines: [line({ id: 'l4', menuItemId: 'd2', subtotal: 50 })] }),
    ]
    const rows = rollupItems(orders)
    expect(rows.map((r) => [r.key, r.orders, r.quantity, r.grossCents, r.discountCents, r.netCents])).toEqual([
      ['id:d1', 2, 3, 30000, 2000, 28000],
      ['id:d2', 1, 1, 10000, 1000, 9000],
    ])
    expect(rows.reduce((sum, r) => sum + r.netCents, 0)).toBe(summarizeSales(orders).netCents)
  })

  test('a renamed dish shows its most recent name; a tie goes to the first name in code-point order', () => {
    const orders = [
      order({ id: 'a', at: 1, lines: [line({ id: 'x', menuItemId: 'd1', name: 'Adobo' })] }),
      order({ id: 'b', at: 2, lines: [line({ id: 'y', menuItemId: 'd1', name: 'Chicken Adobo' })] }),
      order({ id: 'c', at: 3, lines: [line({ id: 'z', menuItemId: 'd2', name: 'tea' }), line({ id: 'w', menuItemId: 'd2', name: 'Tea' })] }),
    ]
    const labels = Object.fromEntries(rollupItems(orders).map((r) => [r.key, r.label]))
    expect(labels).toEqual({ 'id:d1': 'Chicken Adobo', 'id:d2': 'Tea' })
    const reversed = Object.fromEntries(rollupItems([...orders].reverse()).map((r) => [r.key, r.label]))
    expect(reversed).toEqual(labels)
  })

  test('an order with no recorded lines is one "Items not recorded" row, so items still add up', () => {
    const rows = rollupItems([order({ total: 80, lines: [] })])
    expect(rows).toEqual([
      expect.objectContaining({ key: 'unrecorded', label: UNRECORDED_LINE_NAME, isUnrecorded: true, netCents: 8000, quantity: 0 }),
    ])
  })

  test('largest first, then label', () => {
    const rows = rollupItems([
      order({ id: 'a', total: 100, lines: [line({ id: 'p', menuItemId: 'b', name: 'B' })] }),
      order({ id: 'b', total: 100, lines: [line({ id: 'q', menuItemId: 'a', name: 'A' })] }),
      order({ id: 'c', total: 300, lines: [line({ id: 'r', menuItemId: 'c', name: 'C', subtotal: 300 })] }),
    ])
    expect(rows.map((r) => r.label)).toEqual(['C', 'A', 'B'])
  })
})

describe('rollupCategories', () => {
  test('categories add up to net sales, with an Uncategorised row', () => {
    const orders = [
      order({ id: 'a', total: 300, lines: [line({ id: 'l1', categoryName: 'Mains', subtotal: 200 }), line({ id: 'l2', categoryName: null, subtotal: 100 })] }),
      order({ id: 'b', total: 100, lines: [line({ id: 'l3', categoryName: ' mains ', subtotal: 100 })] }),
    ]
    const rows = rollupCategories(orders)
    expect(rows.map((r) => [r.key, r.label, r.orders, r.netCents])).toEqual([
      ['name:mains', 'Mains', 2, 30000],
      ['uncategorised', UNCATEGORISED_LABEL, 1, 10000],
    ])
  })
})

describe('rollupPeriods and rollupHours', () => {
  const orders = [
    order({ id: 'a', at: at('2026-10-12T15:59:59.999Z'), total: 100 }), // Mon 23:59 Manila
    order({ id: 'b', at: at('2026-10-12T16:00:00.000Z'), total: 200 }), // Tue 00:00 Manila
    order({ id: 'c', at: at('2026-10-13T11:30:00.000Z'), total: 50, status: 'voided' }),
  ]

  test('each live order falls in exactly one Manila day', () => {
    expect(rollupPeriods(orders, 'day').map((r) => [r.key, r.orders, r.netCents])).toEqual([
      ['2026-10-12', 1, 10000],
      ['2026-10-13', 1, 20000],
    ])
    expect(rollupPeriods(orders, 'week').map((r) => [r.key, r.netCents])).toEqual([['2026-10-12', 30000]])
  })

  test('weekday (ISO, Monday = 1) × Manila hour', () => {
    expect(rollupHours(orders)).toEqual([
      { weekday: 1, hour: 23, orders: 1, netCents: 10000 },
      { weekday: 2, hour: 0, orders: 1, netCents: 20000 },
    ])
  })
})
