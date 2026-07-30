/**
 * Phase 1 — which day a movement belongs to.
 *
 * A UTC day boundary would cut a Philippine dinner service in half: 8pm Manila
 * is already the next day in UTC, so the busiest two hours of trade would land
 * on tomorrow's report and every day would look short. The report is for a
 * merchant standing in their shop, so the day is THEIR day.
 *
 * The database already agrees — `assign_daily_order_number` numbers orders by
 * `(created_at at time zone 'Asia/Manila')::date`. This is the same rule on the
 * read side, so the report and the order numbers cannot disagree about what
 * "today" means.
 */

import {
  resolveBusinessDayWindow,
  toBusinessDayKey,
  previousBusinessDayKey,
  resolveReportDay,
} from '@/lib/inventory/business-day'

describe('resolveBusinessDayWindow', () => {
  test('a Manila day starts at 16:00 UTC the day before', () => {
    // Arrange / Act — Manila is UTC+8.
    const window = resolveBusinessDayWindow('2026-07-29')

    // Assert
    expect(window.startIso).toBe('2026-07-28T16:00:00.000Z')
    expect(window.endIso).toBe('2026-07-29T16:00:00.000Z')
  })

  test('the window is half-open, so a movement is never counted on two days', () => {
    // Arrange — the instant one day ends is the instant the next begins.
    const monday = resolveBusinessDayWindow('2026-07-27')
    const tuesday = resolveBusinessDayWindow('2026-07-28')

    // Assert — the caller filters `created_at >= start AND created_at < end`.
    expect(monday.endIso).toBe(tuesday.startIso)
  })

  test('rejects a key that is not a calendar date', () => {
    // Arrange — a bad key would silently produce an Invalid Date window and an
    // empty report that looks like a quiet day.
    expect(() => resolveBusinessDayWindow('29-07-2026')).toThrow()
    expect(() => resolveBusinessDayWindow('not-a-date')).toThrow()
  })
})

describe('toBusinessDayKey', () => {
  test('late Manila evening still belongs to that Manila day', () => {
    // Arrange — 11pm Manila on the 29th is 15:00 UTC on the 29th.
    expect(toBusinessDayKey('2026-07-29T15:00:00.000Z')).toBe('2026-07-29')
  })

  test('a sale just after Manila midnight belongs to the new day', () => {
    // Arrange — 00:30 Manila on the 30th is 16:30 UTC on the 29th. Under a UTC
    // day this reads as the 29th, which is the bug this rule exists to avoid.
    expect(toBusinessDayKey('2026-07-29T16:30:00.000Z')).toBe('2026-07-30')
  })

  test('round-trips with the window it names', () => {
    const key = toBusinessDayKey('2026-07-29T15:00:00.000Z')
    const window = resolveBusinessDayWindow(key)

    expect(window.startIso <= '2026-07-29T15:00:00.000Z').toBe(true)
    expect('2026-07-29T15:00:00.000Z' < window.endIso).toBe(true)
  })
})

describe('previousBusinessDayKey', () => {
  test('steps back one day', () => {
    // The report defaults to yesterday: today is always mid-service and so
    // always looks short.
    expect(previousBusinessDayKey('2026-07-29')).toBe('2026-07-28')
  })

  test('steps across a month boundary', () => {
    expect(previousBusinessDayKey('2026-08-01')).toBe('2026-07-31')
  })

  test('steps across a year boundary', () => {
    expect(previousBusinessDayKey('2026-01-01')).toBe('2025-12-31')
  })
})

/**
 * Phase 1c — turning a URL into a day.
 *
 * The day arrives from `?day=` and is therefore untrusted. A hand-edited or
 * stale URL must never take down the inventory page: the report is a read, and
 * a bad query string is a reason to show a sensible day, not a 500.
 */
describe('resolveReportDay', () => {
  const NOW = '2026-07-30T05:00:00.000Z' // 1pm Manila on the 30th

  test('defaults to yesterday, because today is always mid-service', () => {
    // Today always reads short — half its trade has not happened yet — and a
    // report that always looks short trains a merchant to ignore it.
    expect(resolveReportDay(undefined, NOW)).toEqual({
      dayKey: '2026-07-29',
      latestDayKey: '2026-07-30',
    })
  })

  test('honours an explicit day', () => {
    expect(resolveReportDay('2026-07-04', NOW).dayKey).toBe('2026-07-04')
  })

  test('allows today to be asked for deliberately', () => {
    // Mid-service is a legitimate thing to look at, as long as it is chosen.
    expect(resolveReportDay('2026-07-30', NOW).dayKey).toBe('2026-07-30')
  })

  test('falls back rather than throwing on a malformed day', () => {
    // A bad URL must not break the page.
    expect(resolveReportDay('not-a-date', NOW).dayKey).toBe('2026-07-29')
    expect(resolveReportDay('2026-13-45', NOW).dayKey).toBe('2026-07-29')
  })

  test('refuses a day in the future, which could only ever be empty', () => {
    // An empty future report is indistinguishable from a day that lost its data.
    expect(resolveReportDay('2027-01-01', NOW).dayKey).toBe('2026-07-30')
  })

  test('treats late Manila evening as still today when choosing the default', () => {
    // 11pm Manila on the 30th is 15:00 UTC on the 30th; yesterday is the 29th.
    expect(resolveReportDay(undefined, '2026-07-30T15:00:00.000Z').dayKey).toBe('2026-07-29')
  })
})
