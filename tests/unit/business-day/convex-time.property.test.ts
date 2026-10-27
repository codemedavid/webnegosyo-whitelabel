/**
 * The Convex deployment's business day (`convex-template/convex/time.ts`) must
 * be the web/app engine's. Convex stores number orders (#01) by it, so a drift
 * would reset a 4 AM store's numbers at a different moment from its reports.
 */
import fc from 'fast-check'
import { propertyParameters } from '../../utils/property'
import { tradingDayOf, tradingDayWindow, type CutoffChange, type CutoffSchedule } from '@/lib/business-day/trading-day'
import {
  businessDayKey,
  businessDayStartMs,
  localDateKey,
  localDayStartMs,
  parseCutoffConfig,
} from '../../../convex-template/convex/time'

const DAY_MS = 24 * 60 * 60 * 1000
const FIRST_MS = Date.parse('2024-01-01T00:00:00.000Z')
const LAST_MS = Date.parse('2028-12-31T00:00:00.000Z')

const dayKeyArb = fc
  .integer({ min: FIRST_MS / DAY_MS + 2, max: LAST_MS / DAY_MS - 2 })
  .map((d) => new Date(d * DAY_MS).toISOString().slice(0, 10))
const scheduleArb: fc.Arbitrary<CutoffSchedule> = fc
  .uniqueArray(fc.tuple(dayKeyArb, fc.integer({ min: 0, max: 47 })), { maxLength: 6, selector: ([day]) => day })
  .map((pairs) =>
    pairs
      .map(([effectiveFrom, step]): CutoffChange => ({ effectiveFrom, cutoffMinutes: step * 15 }))
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1)),
  )
const instantArb = fc.integer({ min: FIRST_MS, max: LAST_MS })

describe('Convex business day = the web engine', () => {
  it('names the same day and the same start for every instant and schedule', () => {
    fc.assert(
      fc.property(scheduleArb, instantArb, (schedule, atMs) => {
        const iso = new Date(atMs).toISOString()
        const day = tradingDayOf(iso, schedule)
        expect(businessDayKey(atMs, [...schedule])).toBe(day)
        expect(businessDayStartMs(atMs, [...schedule])).toBe(Date.parse(tradingDayWindow(day, schedule).startIso))
      }),
      propertyParameters(),
    )
  })

  it('an empty schedule is the existing Convex calendar day', () => {
    fc.assert(
      fc.property(instantArb, (atMs) => {
        expect(businessDayKey(atMs, [])).toBe(localDateKey(atMs))
        expect(businessDayStartMs(atMs, [])).toBe(localDayStartMs(atMs))
      }),
      propertyParameters(),
    )
  })

  it('reads back the schedule the web sync writes', () => {
    fc.assert(
      fc.property(scheduleArb, (schedule) => {
        expect(parseCutoffConfig(JSON.stringify(schedule))).toEqual(schedule)
      }),
      propertyParameters(),
    )
  })
})

describe('parseCutoffConfig', () => {
  it.each([
    ['no row', undefined],
    ['an empty value', ''],
    ['not JSON', '{nope'],
    ['not a list', '{"effectiveFrom":"2026-10-28","cutoffMinutes":240}'],
    ['a cutoff off the grid', '[{"effectiveFrom":"2026-10-28","cutoffMinutes":241}]'],
    ['a cutoff past 11:45 AM', '[{"effectiveFrom":"2026-10-28","cutoffMinutes":720}]'],
  ])('falls back to midnight on %s', (_label, value) => {
    expect(parseCutoffConfig(value)).toEqual([])
  })
})
