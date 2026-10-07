import { buildTimeProfile, hourLabel } from '@/lib/assistant/insights/best-times'
import { summarizeStock } from '@/lib/assistant/insights/inventory-status'
import { maskCustomerName, staffLabel } from '@/lib/assistant/insights/customer-label'
import type { SaleRecord } from '@/lib/dashboard/sale-record'

/** A Manila wall-clock time as epoch ms. */
function manila(iso: string): number {
  return Date.parse(`${iso}+08:00`)
}

function sale(at: number, total = 100, overrides: Partial<SaleRecord> = {}): SaleRecord {
  return { id: String(at), at, total, status: 'delivered', paymentStatus: 'paid', channel: 'online', orderType: 'Pickup', outletId: null, phone: null, items: null, ...overrides }
}

describe('buildTimeProfile', () => {
  const startMs = manila('2026-09-01T00:00:00') // a Tuesday
  const endMs = manila('2026-09-15T00:00:00') // two full weeks

  test('groups completed orders by Manila hour and names the busiest and quietest open hours', () => {
    const sales = [
      sale(manila('2026-09-02T19:10:00')),
      sale(manila('2026-09-03T19:40:00')),
      sale(manila('2026-09-04T12:05:00')),
      sale(manila('2026-09-04T19:00:00'), 100, { status: 'cancelled' }),
    ]

    const profile = buildTimeProfile(sales, { by: 'hour', startMs, endMs })

    expect(profile.slots).toHaveLength(24)
    expect(profile.best).toMatchObject({ label: '7 PM', orders: 2 })
    expect(profile.quietest).toMatchObject({ label: '12 PM', orders: 1 })
    expect(profile.completedOrders).toBe(3)
  })

  test('averages weekdays per occurrence so a window with extra Tuesdays does not crown Tuesday', () => {
    const window = { startMs, endMs: manila('2026-09-16T00:00:00') } // 3 Tuesdays, 2 Fridays
    const sales = [
      sale(manila('2026-09-01T10:00:00')), sale(manila('2026-09-08T10:00:00')), sale(manila('2026-09-15T10:00:00')),
      sale(manila('2026-09-04T10:00:00')), sale(manila('2026-09-04T11:00:00')), sale(manila('2026-09-11T10:00:00')),
    ]

    const profile = buildTimeProfile(sales, { by: 'weekday', ...window })

    expect(profile.slots.find((s) => s.label === 'Tuesday')?.orders).toBe(1)
    expect(profile.slots.find((s) => s.label === 'Friday')?.orders).toBe(1.5)
    expect(profile.best?.label).toBe('Friday')
  })

  test('labels hours on a 12-hour clock', () => {
    expect([0, 9, 12, 23].map(hourLabel)).toEqual(['12 AM', '9 AM', '12 PM', '11 PM'])
  })
})

describe('summarizeStock', () => {
  const units = new Map([['kg', 'kg']])
  const row = (name: string, qty: number, reorder: number, cost = 10, active = true) => ({
    id: name, name, current_qty: qty, reorder_level: reorder, unit_cost: cost, stock_unit_id: 'kg', is_active: active,
  })

  test('lists out-of-stock first, then the lowest cover, and values the shelf', () => {
    const status = summarizeStock([row('Rice', 50, 10), row('Pork', 2, 10), row('Egg', 0, 30), row('Garlic', 4, 5), row('Old', 0, 5, 10, false)], units)

    expect(status.attention.map((r) => r.name)).toEqual(['Egg', 'Pork', 'Garlic'])
    expect(status).toMatchObject({ activeCount: 4, outCount: 1, lowCount: 2, stockValue: 560 })
    expect(status.attention[0].unit).toBe('kg')
  })
})

describe('maskCustomerName', () => {
  test('keeps a first name and last initial, never more', () => {
    expect(maskCustomerName('Maria Clara Santos')).toBe('Maria S.')
    expect(maskCustomerName('Ana')).toBe('Ana')
    expect(maskCustomerName('  ')).toBe('Unnamed guest')
    expect(maskCustomerName(null)).toBe('Unnamed guest')
  })
})

describe('staffLabel', () => {
  test('never hands the model a staff email address', () => {
    expect(staffLabel('admin@seacook1.com')).toBe('admin (seacook1)')
    expect(staffLabel('admin@webnegosyo.com')).toBe('admin (webnegosyo)')
    expect(staffLabel('Joy Reyes')).toBe('Joy Reyes')
    expect(staffLabel(' ')).toBe('Staff member')
  })
})
