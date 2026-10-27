/**
 * Service periods ("Shifts" in the UI): named windows inside a business day,
 * e.g. Day shift 12 PM–8 PM and Night shift 8 PM–2 AM.
 */
import { servicePeriodOf, servicePeriodWindow } from '@/lib/business-day/service-periods'
import { MIDNIGHT_SCHEDULE, type CutoffSchedule } from '@/lib/business-day/trading-day'

const manila = (local: string): string => new Date(`${local}+08:00`).toISOString()
const FOUR_AM: CutoffSchedule = [{ effectiveFrom: '2026-01-01', cutoffMinutes: 240 }]

const DAY = { id: 'day', startsMinutes: 12 * 60, endsMinutes: 20 * 60 }
const NIGHT = { id: 'night', startsMinutes: 20 * 60, endsMinutes: 2 * 60 }
const PERIODS = [DAY, NIGHT]

describe('servicePeriodWindow', () => {
  it('places a daytime period on the business day it names', () => {
    expect(servicePeriodWindow('2026-10-24', DAY, FOUR_AM)).toEqual({
      startIso: manila('2026-10-24T12:00:00.000'),
      endIso: manila('2026-10-24T20:00:00.000'),
    })
  })

  it('runs an overnight period into the next calendar day (ends <= starts)', () => {
    expect(servicePeriodWindow('2026-10-24', NIGHT, FOUR_AM)).toEqual({
      startIso: manila('2026-10-24T20:00:00.000'),
      endIso: manila('2026-10-25T02:00:00.000'),
    })
  })

  it('keeps an overnight period whole on a midnight store too', () => {
    // The night shift is one shift to the people working it, cutoff or not.
    expect(servicePeriodWindow('2026-10-24', NIGHT, MIDNIGHT_SCHEDULE).endIso).toBe(manila('2026-10-25T02:00:00.000'))
  })

  it('puts a period that starts before the cutoff on the next calendar morning', () => {
    const graveyard = { startsMinutes: 2 * 60, endsMinutes: 6 * 60 }
    expect(servicePeriodWindow('2026-10-24', graveyard, FOUR_AM)).toEqual({
      startIso: manila('2026-10-25T02:00:00.000'),
      endIso: manila('2026-10-25T06:00:00.000'),
    })
  })

  it('reads equal start and end as a full 24 hours', () => {
    const allDay = { startsMinutes: 240, endsMinutes: 240 }
    expect(servicePeriodWindow('2026-10-24', allDay, FOUR_AM)).toEqual({
      startIso: manila('2026-10-24T04:00:00.000'),
      endIso: manila('2026-10-25T04:00:00.000'),
    })
  })

  it('refuses minutes outside a day', () => {
    expect(() => servicePeriodWindow('2026-10-24', { startsMinutes: 1440, endsMinutes: 0 }, FOUR_AM)).toThrow()
    expect(() => servicePeriodWindow('2026-10-24', { startsMinutes: 1.5, endsMinutes: 0 }, FOUR_AM)).toThrow()
  })
})

describe('servicePeriodOf', () => {
  it('finds the daytime period', () => {
    expect(servicePeriodOf(manila('2026-10-24T13:00:00.000'), PERIODS, FOUR_AM)).toEqual({
      period: DAY,
      dayKey: '2026-10-24',
      startIso: manila('2026-10-24T12:00:00.000'),
      endIso: manila('2026-10-24T20:00:00.000'),
    })
  })

  it('hands 8:00 PM sharp to the night shift (half-open windows)', () => {
    expect(servicePeriodOf(manila('2026-10-24T20:00:00.000'), PERIODS, FOUR_AM)?.period).toBe(NIGHT)
  })

  it("files a 1 AM sale under Friday's night shift", () => {
    const match = servicePeriodOf(manila('2026-10-25T01:00:00.000'), PERIODS, FOUR_AM)
    expect(match?.period).toBe(NIGHT)
    expect(match?.dayKey).toBe('2026-10-24')
  })

  it("files a 1 AM sale under Friday's night shift on a midnight store as well", () => {
    // Business day Saturday, but the shift that was running started on Friday.
    const match = servicePeriodOf(manila('2026-10-25T01:00:00.000'), PERIODS, MIDNIGHT_SCHEDULE)
    expect(match?.period).toBe(NIGHT)
    expect(match?.dayKey).toBe('2026-10-24')
  })

  it('answers null between shifts', () => {
    expect(servicePeriodOf(manila('2026-10-25T03:00:00.000'), PERIODS, FOUR_AM)).toBeNull()
    expect(servicePeriodOf(manila('2026-10-24T09:00:00.000'), PERIODS, FOUR_AM)).toBeNull()
  })

  it('answers null when the store has no named shifts', () => {
    expect(servicePeriodOf(manila('2026-10-24T13:00:00.000'), [], FOUR_AM)).toBeNull()
  })

  it('prefers the period that started most recently when two overlap', () => {
    const lunch = { id: 'lunch', startsMinutes: 11 * 60, endsMinutes: 15 * 60 }
    const afternoon = { id: 'afternoon', startsMinutes: 14 * 60, endsMinutes: 18 * 60 }
    expect(servicePeriodOf(manila('2026-10-24T14:30:00.000'), [afternoon, lunch], FOUR_AM)?.period).toBe(afternoon)
    expect(servicePeriodOf(manila('2026-10-24T14:30:00.000'), [lunch, afternoon], FOUR_AM)?.period).toBe(afternoon)
  })
})
