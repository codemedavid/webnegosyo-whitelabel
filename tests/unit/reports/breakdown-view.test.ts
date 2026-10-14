import { busiestHours, menuMatrix, rowShare, slotLabel, windowDays } from '@/lib/reports/breakdown-view'
import type { ItemRow } from '@/lib/reports/sales-breakdowns'

const item = (key: string, menuItemId: string | null, quantity: number, netCents: number, extra: Partial<ItemRow> = {}): ItemRow => ({
  key,
  label: key,
  menuItemId,
  categoryLabel: null,
  isUnrecorded: false,
  orders: quantity,
  quantity,
  grossCents: netCents,
  discountCents: 0,
  netCents,
  ...extra,
})

describe('rowShare', () => {
  test('a row’s share of the column total; nothing sold = no share (null), never 0%', () => {
    expect(rowShare(250, 1000)).toBe(0.25)
    expect(rowShare(0, 0)).toBeNull()
  })
})

describe('windowDays', () => {
  test('whole days, at least one', () => {
    expect(windowDays(0, 3 * 86_400_000)).toBe(3)
    expect(windowDays(0, 3_600_000)).toBe(1)
  })
})

describe('busiestHours', () => {
  test('the busiest cells by orders, ties to the larger sales, then the earlier slot', () => {
    const cells = [
      { weekday: 1, hour: 12, orders: 5, netCents: 100 },
      { weekday: 6, hour: 19, orders: 9, netCents: 900 },
      { weekday: 5, hour: 19, orders: 9, netCents: 1200 },
      { weekday: 2, hour: 8, orders: 5, netCents: 100 },
      { weekday: 3, hour: 9, orders: 0, netCents: 0 },
    ]
    expect(busiestHours(cells, 3).map((cell) => [cell.weekday, cell.hour])).toEqual([
      [5, 19],
      [6, 19],
      [1, 12],
    ])
  })

  test('an empty slot is never "busiest"', () => {
    expect(busiestHours([{ weekday: 1, hour: 1, orders: 0, netCents: 0 }], 3)).toEqual([])
  })
})

describe('menuMatrix — the Menu matrix from the same item totals as the table', () => {
  const menu = [
    { id: 'a', name: 'Sisig', price: 250 },
    { id: 'b', name: 'Rice', price: 30 },
    { id: 'c', name: 'Lechon', price: 400 },
    { id: 'd', name: 'Soda', price: 50 },
  ]

  test('classifies the menu by units sold and price (a proxy, said so), unsold dishes included', () => {
    const matrix = menuMatrix(
      [item('id:a', 'a', 40, 1_000_000), item('id:b', 'b', 60, 180_000), item('id:c', 'c', 2, 80_000), item('unrecorded', null, 0, 5000, { isUnrecorded: true })],
      menu,
      7,
    )
    const byId = Object.fromEntries(matrix.items.map((entry) => [entry.itemId, entry.classification]))
    expect(byId).toEqual({ a: 'star', b: 'plowhorse', c: 'puzzle', d: 'dog' })
    expect(matrix.marginBasis).toBe('price_proxy')
    expect(matrix.warnings.join(' ')).toMatch(/PRICE/)
  })

  test('too few sales classifies nothing rather than calling the whole menu slow', () => {
    const matrix = menuMatrix([item('id:a', 'a', 3, 75_000)], menu, 1)
    expect(matrix.canApply).toBe(false)
    expect(new Set(matrix.items.map((entry) => entry.classification))).toEqual(new Set(['unclassified']))
  })
})

describe('slotLabel', () => {
  test('ISO weekday and Manila hour, as a person says it', () => {
    expect(slotLabel(5, 19)).toBe('Friday 7 PM')
    expect(slotLabel(1, 0)).toBe('Monday 12 AM')
    expect(slotLabel(7, 12)).toBe('Sunday 12 PM')
  })
})
