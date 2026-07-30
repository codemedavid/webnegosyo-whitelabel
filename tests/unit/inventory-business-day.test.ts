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
