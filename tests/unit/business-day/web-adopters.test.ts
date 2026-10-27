/**
 * Web Reports periods and the dashboard window on a 4 AM business day.
 *
 * The existing suites (`tests/unit/reports/period.test.ts`,
 * `tests/unit/dashboard/periods.test.ts`) pin that passing no schedule is the
 * old Manila-midnight behaviour; these pin what a 4 AM store sees.
 */
import {
  bucketKey,
  bucketKeys,
  resolveComparePeriod,
  resolveReportPeriod,
  type ReportPeriod,
} from '@/lib/reports/period'
import { bucketLabels, resolveDashboardWindow, tradingDayStart } from '@/lib/dashboard/periods'
import { MIDNIGHT_SCHEDULE, type CutoffSchedule } from '@/lib/business-day/trading-day'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const FOUR_AM: CutoffSchedule = [{ effectiveFrom: '2026-01-01', cutoffMinutes: 240 }]
const manila = (local: string): number => Date.parse(`${local}+08:00`)

/** Sat Oct 25 2026, 1:30 AM Manila: still Friday's trade on a 4 AM store. */
const LATE_NIGHT = manila('2026-10-25T01:30:00.000')

function period(input: Parameters<typeof resolveReportPeriod>[0], now: number, schedule: CutoffSchedule): ReportPeriod {
  const result = resolveReportPeriod(input, now, schedule)
  if (!result.ok) throw new Error(result.error)
  return result.period
}

describe('reports/period on a 4 AM day', () => {
  it("reads 'Today' at 1:30 AM Saturday as Friday since 4:00 AM", () => {
    const today = period({ preset: 'today' }, LATE_NIGHT, FOUR_AM)
    expect(today.from).toBe('2026-10-24')
    expect(today.start).toBe(manila('2026-10-24T04:00:00.000'))
    expect(today.fullEnd).toBe(manila('2026-10-25T04:00:00.000'))
    expect(today.end).toBe(LATE_NIGHT)
    expect(today.isPartial).toBe(true)
  })

  it('compares with the same business day last week, cut at the same elapsed time', () => {
    const today = period({ preset: 'today' }, LATE_NIGHT, FOUR_AM)
    const compare = resolveComparePeriod(today, FOUR_AM)
    expect(compare.start).toBe(manila('2026-10-17T04:00:00.000'))
    expect(compare.end).toBe(LATE_NIGHT - 7 * DAY_MS)
  })

  it('buckets a 1:30 AM sale on Friday, by day, week and month', () => {
    expect(bucketKey(LATE_NIGHT, 'day', FOUR_AM)).toBe('2026-10-24')
    expect(bucketKey(LATE_NIGHT, 'day', MIDNIGHT_SCHEDULE)).toBe('2026-10-25')
    expect(bucketKey(LATE_NIGHT, 'week', FOUR_AM)).toBe('2026-10-19')
    expect(bucketKey(manila('2026-11-01T02:00:00.000'), 'month', FOUR_AM)).toBe('2026-10-01')
  })

  it('keeps the hour grain on the wall clock', () => {
    expect(bucketKey(LATE_NIGHT, 'hour', FOUR_AM)).toBe('2026-10-25T01')
  })

  it("gives a business day's hours from 4 AM to 3 AM", () => {
    const keys = bucketKeys(manila('2026-10-24T04:00:00.000'), manila('2026-10-25T04:00:00.000'), 'hour', FOUR_AM)
    expect(keys).toHaveLength(24)
    expect(keys[0]).toBe('2026-10-24T04')
    expect(keys[23]).toBe('2026-10-25T03')
  })

  it('does not assume 24-hour days on the day the cutoff changes', () => {
    const change: CutoffSchedule = [{ effectiveFrom: '2026-10-25', cutoffMinutes: 240 }]
    const friday = period({ preset: 'custom', from: '2026-10-24', to: '2026-10-24' }, manila('2026-10-27T12:00:00.000'), change)
    expect(friday.fullEnd - friday.start).toBe(28 * HOUR_MS)
    const days = bucketKeys(manila('2026-10-23T00:00:00.000'), manila('2026-10-27T04:00:00.000'), 'day', change)
    expect(days).toEqual(['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26'])
  })

  it('puts every instant in the day bucket bucketKeys produces for it (a 3-day sweep)', () => {
    const SWEEP_STEP_MS = 37 * 60 * 1000
    for (let at = manila('2026-10-23T00:00:00.000'); at < manila('2026-10-26T00:00:00.000'); at += SWEEP_STEP_MS) {
      expect(bucketKeys(at, at + 1, 'day', FOUR_AM)).toEqual([bucketKey(at, 'day', FOUR_AM)])
    }
  })
})

describe('dashboard/periods on a 4 AM day', () => {
  it("opens 'today' at 4:00 AM and compares with yesterday by this time", () => {
    const window = resolveDashboardWindow('today', LATE_NIGHT, FOUR_AM)
    expect(window.start).toBe(manila('2026-10-24T04:00:00.000'))
    expect(window.previousStart).toBe(manila('2026-10-23T04:00:00.000'))
    expect(window.previousEnd).toBe(LATE_NIGHT - DAY_MS)
  })

  it('labels the hours from the cutoff', () => {
    const labels = bucketLabels(resolveDashboardWindow('today', LATE_NIGHT, FOUR_AM))
    expect(labels[0]).toBe('4 AM')
    expect(labels[20]).toBe('12 AM')
  })

  it('opens a 7-day window six business days back', () => {
    const window = resolveDashboardWindow('7d', LATE_NIGHT, FOUR_AM)
    expect(window.start).toBe(manila('2026-10-18T04:00:00.000'))
    expect(window.previousStart).toBe(manila('2026-10-11T04:00:00.000'))
  })

  it('tradingDayStart is Manila midnight with no schedule', () => {
    expect(tradingDayStart(LATE_NIGHT)).toBe(manila('2026-10-25T00:00:00.000'))
    expect(tradingDayStart(LATE_NIGHT, FOUR_AM)).toBe(manila('2026-10-24T04:00:00.000'))
  })
})

describe('report context on a 4 AM day', () => {
  // Imported here so the suite above keeps its own imports short.
  const { buildReportContext } = jest.requireActual<typeof import('@/lib/reports/read/report-context')>(
    '@/lib/reports/read/report-context',
  )
  const TENANT = 'aaaaaaaa-0000-4000-8000-000000000001'
  const base = {
    tenant: { id: TENANT, slug: 'shop', multiBranchEnabled: false, hasConvexDeployment: false },
    backend: 'platform' as const,
    appUser: { role: 'admin', tenant_id: TENANT, is_owner: true, permissions: [], outlet_id: null },
    outlets: [],
    searchParams: { period: 'today' },
    now: LATE_NIGHT,
  }

  it("resolves 'Today' and its windows on the store's business day", () => {
    const state = buildReportContext({ ...base, schedule: FOUR_AM })
    if (state.kind !== 'ready') throw new Error(state.kind)
    expect(state.context.today).toBe('2026-10-24')
    expect(state.context.windows.current.start).toBe(manila('2026-10-24T04:00:00.000'))
    expect(state.context.windows.previous?.start).toBe(manila('2026-10-17T04:00:00.000'))
    expect(state.context.schedule).toBe(FOUR_AM)
    expect(state.context.isScheduleFallback).toBe(false)
  })

  it('is the Manila calendar day with no schedule, and says when it is a stand-in', () => {
    const state = buildReportContext({ ...base, isScheduleFallback: true })
    if (state.kind !== 'ready') throw new Error(state.kind)
    expect(state.context.today).toBe('2026-10-25')
    expect(state.context.windows.current.start).toBe(manila('2026-10-25T00:00:00.000'))
    expect(state.context.isScheduleFallback).toBe(true)
  })
})

describe('startOfTodayISO (dashboard order stats)', () => {
  const { startOfTodayISO } = jest.requireActual<typeof import('@/lib/order-stats')>('@/lib/order-stats')

  it('starts at the cutoff with a schedule, at Manila midnight without', () => {
    expect(startOfTodayISO(new Date(LATE_NIGHT), FOUR_AM)).toBe(new Date(manila('2026-10-24T04:00:00.000')).toISOString())
    expect(startOfTodayISO(new Date(LATE_NIGHT))).toBe(new Date(manila('2026-10-25T00:00:00.000')).toISOString())
  })
})
