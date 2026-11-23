import { describe, expect, it } from '@jest/globals'
import { isLateNewOrder, orderTimeLabel, waitingLabel } from '@/lib/admin/orders-table/time'

const NOW = Date.parse('2026-11-21T04:50:00.000Z') // 12:50 PM Manila

describe('orderTimeLabel', () => {
  it("shows Manila time, and the day only when it isn't today", () => {
    expect(orderTimeLabel(Date.parse('2026-11-21T04:41:00.000Z'), NOW)).toEqual({ time: '12:41 PM', day: null })
    expect(orderTimeLabel(Date.parse('2026-11-20T13:05:00.000Z'), NOW)).toEqual({ time: '9:05 PM', day: 'Nov 20' })
  })

  it('uses the Manila calendar day, not UTC', () => {
    // 00:30 Manila on the 21st is still the 20th in UTC.
    expect(orderTimeLabel(Date.parse('2026-11-20T16:30:00.000Z'), NOW).day).toBeNull()
  })

  it('survives a missing time', () => {
    expect(orderTimeLabel(Number.NaN, NOW)).toEqual({ time: '—', day: null })
  })
})

describe('waitingLabel', () => {
  it('reads like a kitchen timer', () => {
    expect(waitingLabel(NOW - 20_000, NOW)).toBe('just now')
    expect(waitingLabel(NOW - 8 * 60_000, NOW)).toBe('8 min')
    expect(waitingLabel(NOW - 80 * 60_000, NOW)).toBe('1 h 20 min')
    expect(waitingLabel(NOW - 120 * 60_000, NOW)).toBe('2 h')
    expect(waitingLabel(NOW - 50 * 3_600_000, NOW)).toBe('2 d')
  })
})

describe('isLateNewOrder', () => {
  it('flags a new order after ten minutes', () => {
    expect(isLateNewOrder(NOW - 9 * 60_000, NOW)).toBe(false)
    expect(isLateNewOrder(NOW - 10 * 60_000, NOW)).toBe(true)
  })
})
