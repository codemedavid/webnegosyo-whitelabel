/**
 * Storefront "we're currently closed" status.
 *
 * Operating hours already existed, but they only constrained *advance-order slot
 * generation* — the storefront itself never read them, so a shop with a 9pm close
 * time still took ASAP orders at 3am. These tests pin the pure resolver that turns
 * (operating_hours, timezone, now) into a customer-facing open/closed status.
 *
 * Two invariants matter more than any single case:
 *  1. Nothing closes a store unless the merchant explicitly opted in
 *     (`enforce_operating_hours`) AND explicitly configured that weekday.
 *  2. The clock is the STORE's wall clock (tenant timezone), not the customer's —
 *     a Manila shop is closed at 3am Manila even for a browser in London.
 */

import { describe, it, expect } from '@jest/globals'
import {
  getStoreOpenStatus,
  getZonedNow,
  formatTimeLabel,
  ALWAYS_OPEN_STATUS,
  OPERATING_HOURS_ENFORCEMENT_COLUMNS,
  type StoreHoursSource,
} from '@/lib/store-open-status'
import type { OperatingHours } from '@/lib/operating-hours'

const MANILA = 'Asia/Manila' // UTC+8, no DST — keeps the arithmetic in these tests obvious.

// Calendar anchors (verified): 2026-07-20 is a Monday, 2026-07-25 a Saturday.
const MON_0900 = new Date('2026-07-20T01:00:00Z') // Monday 09:00 Manila
const MON_0700 = new Date('2026-07-19T23:00:00Z') // Monday 07:00 Manila
const MON_2300 = new Date('2026-07-20T15:00:00Z') // Monday 23:00 Manila
const MON_0100 = new Date('2026-07-19T17:00:00Z') // Monday 01:00 Manila
const SAT_1200 = new Date('2026-07-25T04:00:00Z') // Saturday 12:00 Manila

/** Every weekday open 09:00–21:00 unless overridden. */
function week(overrides: OperatingHours = {}): OperatingHours {
  const base: OperatingHours = {}
  for (const key of ['0', '1', '2', '3', '4', '5', '6']) {
    base[key] = { closed: false, open: '09:00', close: '21:00' }
  }
  return { ...base, ...overrides }
}

function source(overrides: Partial<StoreHoursSource> = {}): StoreHoursSource {
  return {
    operating_hours: week(),
    timezone: MANILA,
    enforce_operating_hours: true,
    ...overrides,
  }
}

describe('getZonedNow', () => {
  it('reads the weekday and minutes from the store timezone, not the runtime timezone', () => {
    // 2026-07-19T17:00:00Z is Sunday in UTC but already Monday 01:00 in Manila.
    expect(getZonedNow(MON_0100, MANILA)).toEqual({ weekday: 1, minutes: 60 })
  })

  it('handles midnight as minute 0 rather than 1440', () => {
    expect(getZonedNow(new Date('2026-07-19T16:00:00Z'), MANILA)).toEqual({ weekday: 1, minutes: 0 })
  })

  it('falls back to the runtime clock when the timezone is missing or invalid', () => {
    const now = new Date('2026-07-20T01:00:00Z')
    const expected = { weekday: now.getDay(), minutes: now.getHours() * 60 + now.getMinutes() }
    expect(getZonedNow(now, null)).toEqual(expected)
    expect(getZonedNow(now, 'Not/AZone')).toEqual(expected)
  })
})

describe('formatTimeLabel', () => {
  it.each([
    [0, '12:00 AM'],
    [540, '9:00 AM'],
    [720, '12:00 PM'],
    [1290, '9:30 PM'],
  ])('formats %i minutes as %s', (minutes, label) => {
    expect(formatTimeLabel(minutes)).toBe(label)
  })
})

describe('getStoreOpenStatus — never closes a store by accident', () => {
  it('stays open when the merchant has not enabled enforcement', () => {
    const status = getStoreOpenStatus(source({ enforce_operating_hours: false }), MON_2300)
    expect(status).toEqual(ALWAYS_OPEN_STATUS)
  })

  it('stays open when enforcement is enabled but no hours are configured', () => {
    expect(getStoreOpenStatus(source({ operating_hours: null }), MON_2300).isOpen).toBe(true)
  })

  it('stays open when the hours JSON is malformed', () => {
    expect(getStoreOpenStatus(source({ operating_hours: 'nonsense' }), MON_2300).isOpen).toBe(true)
  })

  it('stays open all day on a weekday that has no explicit configuration', () => {
    // Only Saturday is configured; Monday is absent → open, never blocked.
    const hours: OperatingHours = { '6': { closed: false, open: '09:00', close: '21:00' } }
    const status = getStoreOpenStatus(source({ operating_hours: hours }), MON_2300)
    expect(status.isOpen).toBe(true)
    expect(status.isOrderingBlocked).toBe(false)
  })

  it('stays open for a null tenant', () => {
    expect(getStoreOpenStatus(null, MON_2300)).toEqual(ALWAYS_OPEN_STATUS)
  })
})

describe('getStoreOpenStatus — open/closed decisions', () => {
  it('is open inside the configured window', () => {
    const status = getStoreOpenStatus(source(), MON_0900)
    expect(status.isOpen).toBe(true)
    expect(status.isOrderingBlocked).toBe(false)
    expect(status.reason).toBeNull()
    expect(status.closesAt).toBe('9:00 PM')
  })

  it('is closed before opening time and blocks ordering', () => {
    const status = getStoreOpenStatus(source(), MON_0700)
    expect(status.isOpen).toBe(false)
    expect(status.isOrderingBlocked).toBe(true)
    expect(status.reason).toBe('before_open')
    expect(status.nextOpenLabel).toBe('today at 9:00 AM')
  })

  it('is closed after closing time and points at tomorrow', () => {
    const status = getStoreOpenStatus(source(), MON_2300)
    expect(status.isOpen).toBe(false)
    expect(status.reason).toBe('after_close')
    expect(status.nextOpenLabel).toBe('tomorrow at 9:00 AM')
  })

  it('treats the closing minute itself as closed', () => {
    // Monday 21:00 Manila = 13:00Z.
    const status = getStoreOpenStatus(source(), new Date('2026-07-20T13:00:00Z'))
    expect(status.isOpen).toBe(false)
    expect(status.reason).toBe('after_close')
  })

  it('is closed all day on an explicitly closed weekday', () => {
    const hours = week({ '1': { closed: true, open: '09:00', close: '21:00' } })
    const status = getStoreOpenStatus(source({ operating_hours: hours }), MON_0900)
    expect(status.isOpen).toBe(false)
    expect(status.reason).toBe('closed_day')
    expect(status.nextOpenLabel).toBe('tomorrow at 9:00 AM')
  })

  it('names the weekday when the next opening is more than a day away', () => {
    // Closed Sunday and Monday; it is Saturday noon, so the next opening is Tuesday.
    const hours = week({
      '0': { closed: true, open: '09:00', close: '21:00' },
      '1': { closed: true, open: '09:00', close: '21:00' },
      '6': { closed: true, open: '09:00', close: '21:00' },
    })
    const status = getStoreOpenStatus(source({ operating_hours: hours }), SAT_1200)
    expect(status.isOpen).toBe(false)
    expect(status.nextOpenLabel).toBe('Tuesday at 9:00 AM')
  })

  it('reports no reopening when every day is closed', () => {
    const hours: OperatingHours = {}
    for (const key of ['0', '1', '2', '3', '4', '5', '6']) {
      hours[key] = { closed: true, open: '09:00', close: '21:00' }
    }
    const status = getStoreOpenStatus(source({ operating_hours: hours }), MON_0900)
    expect(status.isOpen).toBe(false)
    expect(status.nextOpenLabel).toBeNull()
  })
})

describe('getStoreOpenStatus — overnight windows', () => {
  const overnight = () => week({
    '0': { closed: false, open: '18:00', close: '02:00' },
    '1': { closed: false, open: '18:00', close: '02:00' },
  })

  it('is open past midnight when the window wraps', () => {
    // Monday 01:00 Manila falls inside Sunday-night's 18:00–02:00 window.
    const status = getStoreOpenStatus(source({ operating_hours: overnight() }), MON_0100)
    expect(status.isOpen).toBe(true)
  })

  it('is closed in the daytime gap and reopens the same evening', () => {
    const status = getStoreOpenStatus(source({ operating_hours: overnight() }), MON_0900)
    expect(status.isOpen).toBe(false)
    expect(status.reason).toBe('before_open')
    expect(status.nextOpenLabel).toBe('today at 6:00 PM')
  })
})

describe('OPERATING_HOURS_ENFORCEMENT_COLUMNS', () => {
  it('lists every tenant column the storefront needs to decide open/closed', () => {
    expect([...OPERATING_HOURS_ENFORCEMENT_COLUMNS]).toEqual([
      'operating_hours',
      'timezone',
      'enforce_operating_hours',
    ])
  })
})
