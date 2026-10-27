/**
 * The business day over random schedules and instants.
 *
 * The backward-compatibility pin is the empty-schedule property: a store that
 * never sets a cutoff must get exactly the Manila-midnight day every report,
 * order number and inventory count used before 2026-10-27.
 */
import fc from 'fast-check'
import { propertyParameters } from '../../utils/property'
import { resolveBusinessDayWindow, toBusinessDayKey } from '@/lib/inventory/business-day'
import {
  MIDNIGHT_SCHEDULE,
  cutoffMinutesFor,
  tradingDayLengthMs,
  tradingDayOf,
  tradingDayWindow,
  type CutoffChange,
  type CutoffSchedule,
} from '@/lib/business-day/trading-day'

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS
const MANILA_OFFSET_MS = 8 * 60 * MINUTE_MS

/** 2024-01-01 .. 2028-12-31: leap days, month and year ends included. */
const FIRST_MS = Date.parse('2024-01-01T00:00:00.000Z')
const LAST_MS = Date.parse('2028-12-31T00:00:00.000Z')

const dayKeyOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10)
const addDays = (dayKey: string, days: number): string =>
  dayKeyOf(Date.parse(`${dayKey}T00:00:00.000Z`) + days * DAY_MS)

const instantArb = fc.integer({ min: FIRST_MS, max: LAST_MS }).map((ms) => new Date(ms).toISOString())
const dayKeyArb = fc.integer({ min: FIRST_MS / DAY_MS + 2, max: LAST_MS / DAY_MS - 2 }).map((d) => dayKeyOf(d * DAY_MS))
const cutoffArb = fc.integer({ min: 0, max: 47 }).map((step) => step * 15)

/** Up to six changes on distinct days, sorted the way the database returns them. */
const scheduleArb: fc.Arbitrary<CutoffSchedule> = fc
  .uniqueArray(fc.tuple(dayKeyArb, cutoffArb), { maxLength: 6, selector: ([day]) => day })
  .map((pairs) =>
    pairs
      .map(([effectiveFrom, cutoffMinutes]): CutoffChange => ({ effectiveFrom, cutoffMinutes }))
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1)),
  )

const startMs = (dayKey: string, schedule: CutoffSchedule) => Date.parse(tradingDayWindow(dayKey, schedule).startIso)
const endMs = (dayKey: string, schedule: CutoffSchedule) => Date.parse(tradingDayWindow(dayKey, schedule).endIso)

describe('trading day properties', () => {
  it('consecutive days tile exactly: end(d) = start(d + 1)', () => {
    fc.assert(
      fc.property(scheduleArb, dayKeyArb, (schedule, day) => {
        expect(endMs(day, schedule)).toBe(startMs(addDays(day, 1), schedule))
      }),
      propertyParameters(),
    )
  })

  it('every instant is in exactly the day tradingDayOf names', () => {
    fc.assert(
      fc.property(scheduleArb, instantArb, (schedule, iso) => {
        const day = tradingDayOf(iso, schedule)
        const at = Date.parse(iso)
        expect(startMs(day, schedule)).toBeLessThanOrEqual(at)
        expect(at).toBeLessThan(endMs(day, schedule))
        // …and in neither neighbour.
        expect(at).toBeGreaterThanOrEqual(endMs(addDays(day, -1), schedule))
        expect(at).toBeLessThan(startMs(addDays(day, 1), schedule))
      }),
      propertyParameters(),
    )
  })

  it('a day starts in itself: tradingDayOf(start(d)) = d', () => {
    fc.assert(
      fc.property(scheduleArb, dayKeyArb, (schedule, day) => {
        expect(tradingDayOf(tradingDayWindow(day, schedule).startIso, schedule)).toBe(day)
      }),
      propertyParameters(),
    )
  })

  it('is monotone: a later instant never lands on an earlier day', () => {
    fc.assert(
      fc.property(scheduleArb, instantArb, instantArb, (schedule, a, b) => {
        const [early, late] = a <= b ? [a, b] : [b, a]
        expect(tradingDayOf(early, schedule) <= tradingDayOf(late, schedule)).toBe(true)
      }),
      propertyParameters(),
    )
  })

  it('an empty schedule is the existing Manila-midnight day for every instant', () => {
    fc.assert(
      fc.property(instantArb, (iso) => {
        const day = tradingDayOf(iso, MIDNIGHT_SCHEDULE)
        expect(day).toBe(toBusinessDayKey(iso))
        expect(tradingDayWindow(day, MIDNIGHT_SCHEDULE)).toEqual(resolveBusinessDayWindow(day))
      }),
      propertyParameters(),
    )
  })

  it('a constant cutoff c is (Manila local time − c) date arithmetic', () => {
    fc.assert(
      fc.property(cutoffArb, instantArb, (cutoff, iso) => {
        const schedule: CutoffSchedule = [{ effectiveFrom: '2000-01-01', cutoffMinutes: cutoff }]
        const shifted = Date.parse(iso) + MANILA_OFFSET_MS - cutoff * MINUTE_MS
        expect(tradingDayOf(iso, schedule)).toBe(dayKeyOf(shifted))
        expect(tradingDayLengthMs(dayKeyOf(shifted), schedule)).toBe(DAY_MS)
      }),
      propertyParameters(),
    )
  })

  it('a day is 24 h plus the change in cutoff to the next day', () => {
    fc.assert(
      fc.property(scheduleArb, dayKeyArb, (schedule, day) => {
        const delta = cutoffMinutesFor(schedule, addDays(day, 1)) - cutoffMinutesFor(schedule, day)
        expect(tradingDayLengthMs(day, schedule)).toBe(DAY_MS + delta * MINUTE_MS)
      }),
      propertyParameters(),
    )
  })
})
