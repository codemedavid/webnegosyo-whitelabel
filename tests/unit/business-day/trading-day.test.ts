/**
 * The business ("trading") day on fixed cases. The properties over random
 * schedules live in trading-day.property.test.ts; these pin the edges a person
 * would check by hand: 03:59 / 04:00, the day a cutoff changes, the copy.
 */
import {
  MIDNIGHT_SCHEDULE,
  cutoffMinutesFor,
  describeCutoff,
  parseCutoffSchedule,
  tradingDayLengthMs,
  tradingDayOf,
  tradingDayWindow,
  type CutoffSchedule,
} from '@/lib/business-day/trading-day'

const HOUR_MS = 60 * 60 * 1000
const FOUR_AM: CutoffSchedule = [{ effectiveFrom: '2026-01-01', cutoffMinutes: 240 }]

/** Manila wall clock → ISO instant (Manila is a fixed +08:00). */
const manila = (local: string): string => new Date(`${local}+08:00`).toISOString()

describe('MIDNIGHT_SCHEDULE', () => {
  it('is empty: no row means Manila midnight', () => {
    expect(MIDNIGHT_SCHEDULE).toEqual([])
    expect(cutoffMinutesFor(MIDNIGHT_SCHEDULE, '2026-10-24')).toBe(0)
  })

  it('keeps the Manila calendar day', () => {
    expect(tradingDayOf(manila('2026-10-24T23:59:59.999'), MIDNIGHT_SCHEDULE)).toBe('2026-10-24')
    expect(tradingDayOf(manila('2026-10-25T00:00:00.000'), MIDNIGHT_SCHEDULE)).toBe('2026-10-25')
    expect(tradingDayWindow('2026-10-24', MIDNIGHT_SCHEDULE)).toEqual({
      startIso: '2026-10-23T16:00:00.000Z',
      endIso: '2026-10-24T16:00:00.000Z',
    })
  })
})

describe('a 4:00 AM cutoff', () => {
  it('counts a 3:59 AM sale toward the day before', () => {
    expect(tradingDayOf(manila('2026-10-25T03:59:59.999'), FOUR_AM)).toBe('2026-10-24')
  })

  it('starts the new day at exactly 4:00 AM', () => {
    expect(tradingDayOf(manila('2026-10-25T04:00:00.000'), FOUR_AM)).toBe('2026-10-25')
  })

  it('runs Friday from Fri 4:00 AM to Sat 4:00 AM, half-open', () => {
    expect(tradingDayWindow('2026-10-24', FOUR_AM)).toEqual({
      startIso: manila('2026-10-24T04:00:00.000'),
      endIso: manila('2026-10-25T04:00:00.000'),
    })
    expect(tradingDayLengthMs('2026-10-24', FOUR_AM)).toBe(24 * HOUR_MS)
  })

  it('leaves days before the first row on midnight', () => {
    expect(cutoffMinutesFor(FOUR_AM, '2025-12-31')).toBe(0)
    expect(tradingDayWindow('2025-12-31', FOUR_AM)).toEqual({
      startIso: manila('2025-12-31T00:00:00.000'),
      endIso: manila('2026-01-01T04:00:00.000'),
    })
  })
})

describe('the day a cutoff changes', () => {
  const schedule: CutoffSchedule = [
    { effectiveFrom: '2026-10-25', cutoffMinutes: 240 },
    { effectiveFrom: '2026-11-01', cutoffMinutes: 120 },
  ]

  it('makes the day before a later cutoff longer', () => {
    // Oct 24 starts at midnight and ends when Oct 25 starts, at 4 AM.
    expect(tradingDayLengthMs('2026-10-24', schedule)).toBe(28 * HOUR_MS)
  })

  it('makes the day before an earlier cutoff shorter', () => {
    expect(tradingDayLengthMs('2026-10-31', schedule)).toBe(22 * HOUR_MS)
  })

  it('reads the cutoff in effect on each day', () => {
    expect(cutoffMinutesFor(schedule, '2026-10-24')).toBe(0)
    expect(cutoffMinutesFor(schedule, '2026-10-25')).toBe(240)
    expect(cutoffMinutesFor(schedule, '2026-10-31')).toBe(240)
    expect(cutoffMinutesFor(schedule, '2026-11-01')).toBe(120)
  })

  it('does not depend on the order the rows arrive in', () => {
    const reversed = [...schedule].reverse()
    expect(cutoffMinutesFor(reversed, '2026-10-31')).toBe(240)
  })
})

describe('parseCutoffSchedule', () => {
  it('reads database rows (snake_case) and sorts them', () => {
    expect(
      parseCutoffSchedule([
        { effective_from: '2026-11-01', cutoff_minutes: 120 },
        { effective_from: '2026-10-25', cutoff_minutes: 240 },
      ]),
    ).toEqual([
      { effectiveFrom: '2026-10-25', cutoffMinutes: 240 },
      { effectiveFrom: '2026-11-01', cutoffMinutes: 120 },
    ])
  })

  it('reads its own output back (camelCase, from a cached copy)', () => {
    const once = parseCutoffSchedule([{ effectiveFrom: '2026-10-25', cutoffMinutes: 240 }])
    expect(parseCutoffSchedule(once)).toEqual(once)
  })

  it('treats no rows as midnight', () => {
    expect(parseCutoffSchedule([])).toEqual([])
  })

  it.each([
    ['not a list', null],
    ['a cutoff past 11:45 AM', [{ effective_from: '2026-10-25', cutoff_minutes: 720 }]],
    ['a cutoff off the 15-minute grid', [{ effective_from: '2026-10-25', cutoff_minutes: 241 }]],
    ['a negative cutoff', [{ effective_from: '2026-10-25', cutoff_minutes: -15 }]],
    ['a cutoff that is not a number', [{ effective_from: '2026-10-25', cutoff_minutes: '240' }]],
    ['an impossible date', [{ effective_from: '2026-02-30', cutoff_minutes: 240 }]],
    ['a timestamp instead of a date', [{ effective_from: '2026-10-25T00:00:00Z', cutoff_minutes: 240 }]],
    ['two rows for one day', [
      { effective_from: '2026-10-25', cutoff_minutes: 240 },
      { effective_from: '2026-10-25', cutoff_minutes: 120 },
    ]],
  ])('refuses %s', (_label, rows) => {
    expect(() => parseCutoffSchedule(rows)).toThrow()
  })
})

describe('describeCutoff', () => {
  it('says which sales count toward which day', () => {
    expect(describeCutoff(240)).toEqual({
      label: '4:00 AM',
      example: 'Sales from Fri 4:00 AM until Sat 3:59 AM count as Friday.',
    })
  })

  it('names midnight the way the setting chip does', () => {
    expect(describeCutoff(0)).toEqual({
      label: '12:00 AM (midnight)',
      example: 'Sales from Fri 12:00 AM until Fri 11:59 PM count as Friday.',
    })
  })

  it('handles quarter hours and the latest cutoff', () => {
    expect(describeCutoff(255).example).toBe('Sales from Fri 4:15 AM until Sat 4:14 AM count as Friday.')
    expect(describeCutoff(705).label).toBe('11:45 AM')
  })

  it('refuses a cutoff the setting cannot hold', () => {
    expect(() => describeCutoff(720)).toThrow()
    expect(() => describeCutoff(10)).toThrow()
  })
})

describe('bad input', () => {
  it('refuses an instant that is not a timestamp', () => {
    expect(() => tradingDayOf('yesterday', MIDNIGHT_SCHEDULE)).toThrow()
  })

  it('refuses a day key that is not a date', () => {
    expect(() => tradingDayWindow('2026-13-01', MIDNIGHT_SCHEDULE)).toThrow()
  })
})
