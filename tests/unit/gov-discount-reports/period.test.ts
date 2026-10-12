import {
  MAX_CUSTOM_DAYS,
  isDayKey,
  manilaDayKey,
  parseReportPeriodKey,
  periodSearchParams,
  rangeLabel,
  resolveReportPeriod,
} from '@/lib/gov-discount-reports/period'

// Monday 12 October 2026, 10:00 in Manila.
const NOW = Date.parse('2026-10-12T02:00:00.000Z')

describe('manilaDayKey', () => {
  it('rolls over at Manila midnight, not UTC midnight', () => {
    expect(manilaDayKey(Date.parse('2026-10-11T15:59:59.999Z'))).toBe('2026-10-11')
    expect(manilaDayKey(Date.parse('2026-10-11T16:00:00.000Z'))).toBe('2026-10-12')
  })
})

describe('resolveReportPeriod', () => {
  it('defaults to this month when no period is given', () => {
    const period = resolveReportPeriod({}, NOW)
    expect(period).toMatchObject({
      key: 'month',
      fromDay: '2026-10-01',
      toDay: '2026-10-31',
      startIso: '2026-09-30T16:00:00.000Z',
      endIso: '2026-10-31T16:00:00.000Z',
      label: 'October 2026',
      fileTag: '2026-10',
    })
  })

  it('treats an unknown period key as this month', () => {
    expect(resolveReportPeriod({ period: 'yesterday' }, NOW).key).toBe('month')
    expect(parseReportPeriodKey('drop table')).toBe('month')
  })

  it('covers today as one Manila day', () => {
    const period = resolveReportPeriod({ period: 'today' }, NOW)
    expect(period).toMatchObject({
      fromDay: '2026-10-12',
      toDay: '2026-10-12',
      startIso: '2026-10-11T16:00:00.000Z',
      endIso: '2026-10-12T16:00:00.000Z',
      label: 'Today',
      fileTag: '2026-10-12',
    })
  })

  it('uses the Manila day just after midnight even though UTC is still on yesterday', () => {
    const justAfterMidnight = Date.parse('2026-10-11T16:30:00.000Z')
    expect(resolveReportPeriod({ period: 'today' }, justAfterMidnight).fromDay).toBe('2026-10-12')
  })

  it('starts the week on Monday', () => {
    const period = resolveReportPeriod({ period: 'week' }, NOW)
    expect(period.fromDay).toBe('2026-10-12')
    expect(period.toDay).toBe('2026-10-18')
    expect(period.label).toBe('This week · Oct 12 – 18, 2026')

    const sunday = Date.parse('2026-10-18T10:00:00.000Z')
    expect(resolveReportPeriod({ period: 'week' }, sunday).fromDay).toBe('2026-10-12')
  })

  it('reads last month across a year boundary', () => {
    const january = Date.parse('2026-01-15T02:00:00.000Z')
    expect(resolveReportPeriod({ period: 'last_month' }, january)).toMatchObject({
      key: 'last_month',
      fromDay: '2025-12-01',
      toDay: '2025-12-31',
      label: 'December 2025',
      fileTag: '2025-12',
    })
  })

  it('reads a custom range inclusively and swaps a reversed one', () => {
    const period = resolveReportPeriod({ period: 'custom', from: '2026-10-12', to: '2026-10-01' }, NOW)
    expect(period).toMatchObject({
      key: 'custom',
      fromDay: '2026-10-01',
      toDay: '2026-10-12',
      startIso: '2026-09-30T16:00:00.000Z',
      endIso: '2026-10-12T16:00:00.000Z',
      label: 'Oct 1 – 12, 2026',
      fileTag: '2026-10-01_to_2026-10-12',
    })
  })

  it('names a custom range that is exactly a month like the month', () => {
    expect(resolveReportPeriod({ period: 'custom', from: '2026-02-01', to: '2026-02-28' }, NOW).fileTag).toBe('2026-02')
  })

  it('shortens a custom range longer than a year to its last year', () => {
    const period = resolveReportPeriod({ period: 'custom', from: '2020-01-01', to: '2026-10-12' }, NOW)
    const days = (Date.parse(period.endIso) - Date.parse(period.startIso)) / 86_400_000
    expect(days).toBe(MAX_CUSTOM_DAYS)
    expect(period.toDay).toBe('2026-10-12')
  })

  it('falls back to this month when custom dates are missing or not real dates', () => {
    expect(resolveReportPeriod({ period: 'custom', from: '2026-02-30', to: '2026-03-01' }, NOW).key).toBe('month')
    expect(resolveReportPeriod({ period: 'custom' }, NOW).key).toBe('month')
  })
})

describe('isDayKey', () => {
  it('accepts only real calendar days', () => {
    expect(isDayKey('2028-02-29')).toBe(true)
    expect(isDayKey('2026-02-29')).toBe(false)
    expect(isDayKey('2026-1-01')).toBe(false)
    expect(isDayKey(20261001)).toBe(false)
  })
})

describe('rangeLabel', () => {
  it('writes ranges that cross months and years', () => {
    expect(rangeLabel('2026-09-28', '2026-10-04')).toBe('Sep 28 – Oct 4, 2026')
    expect(rangeLabel('2025-12-29', '2026-01-04')).toBe('Dec 29, 2025 – Jan 4, 2026')
    expect(rangeLabel('2026-10-05', '2026-10-05')).toBe('Oct 5, 2026')
  })
})

describe('periodSearchParams', () => {
  it('round-trips a custom range and a preset', () => {
    const custom = resolveReportPeriod({ period: 'custom', from: '2026-10-01', to: '2026-10-05' }, NOW)
    expect(resolveReportPeriod(periodSearchParams(custom), NOW)).toEqual(custom)
    expect(periodSearchParams(resolveReportPeriod({ period: 'today' }, NOW))).toEqual({ period: 'today' })
  })
})
