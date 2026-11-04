/**
 * Service periods over random times, cutoffs and instants.
 */
import fc from 'fast-check'
import { propertyParameters } from '../../utils/property'
import { servicePeriodOf, servicePeriodWindow } from '@/lib/business-day/service-periods'
import { tradingDayOf, type CutoffSchedule } from '@/lib/business-day/trading-day'

const DAY_MS = 24 * 60 * 60 * 1000
const FIRST_MS = Date.parse('2024-01-03T00:00:00.000Z')
const LAST_MS = Date.parse('2028-12-28T00:00:00.000Z')

const instantArb = fc.integer({ min: FIRST_MS, max: LAST_MS }).map((ms) => new Date(ms).toISOString())
const dayKeyArb = fc
  .integer({ min: FIRST_MS / DAY_MS, max: LAST_MS / DAY_MS })
  .map((d) => new Date(d * DAY_MS).toISOString().slice(0, 10))
const constantScheduleArb: fc.Arbitrary<CutoffSchedule> = fc
  .integer({ min: 0, max: 47 })
  .map((step) => [{ effectiveFrom: '2000-01-01', cutoffMinutes: step * 15 }])
const periodArb = fc.record({
  startsMinutes: fc.integer({ min: 0, max: 1439 }),
  endsMinutes: fc.integer({ min: 0, max: 1439 }),
})

describe('service period properties', () => {
  it('a match always contains the instant it was asked about', () => {
    fc.assert(
      fc.property(constantScheduleArb, fc.array(periodArb, { maxLength: 4 }), instantArb, (schedule, periods, iso) => {
        const match = servicePeriodOf(iso, periods, schedule)
        if (match === null) return
        expect(match.startIso <= iso && iso < match.endIso).toBe(true)
      }),
      propertyParameters(),
    )
  })

  it('with a constant cutoff, each occurrence starts inside its own business day', () => {
    fc.assert(
      fc.property(constantScheduleArb, periodArb, dayKeyArb, (schedule, period, dayKey) => {
        const window = servicePeriodWindow(dayKey, period, schedule)
        expect(tradingDayOf(window.startIso, schedule)).toBe(dayKey)
        const lengthMs = Date.parse(window.endIso) - Date.parse(window.startIso)
        expect(lengthMs).toBeGreaterThan(0)
        expect(lengthMs).toBeLessThanOrEqual(DAY_MS)
      }),
      propertyParameters(),
    )
  })

  it('a single period covering the whole day finds every instant', () => {
    fc.assert(
      fc.property(constantScheduleArb, instantArb, (schedule, iso) => {
        const cutoff = schedule[0].cutoffMinutes
        const allDay = { startsMinutes: cutoff, endsMinutes: cutoff }
        expect(servicePeriodOf(iso, [allDay], schedule)?.dayKey).toBe(tradingDayOf(iso, schedule))
      }),
      propertyParameters(),
    )
  })
})
