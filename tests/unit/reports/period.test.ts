import {
  DEFAULT_REPORT_PRESET,
  MAX_REPORT_DAYS,
  REPORT_PRESETS,
  REPORT_PRESET_LABELS,
  bucketKey,
  bucketKeys,
  bucketLabel,
  grainFor,
  parseReportSearchParams,
  resolveComparePeriod,
  resolveReportPeriod,
  toReportSearchParams,
  type ReportPeriod,
  type ReportPreset,
} from '@/lib/reports/period'

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** A Manila wall-clock instant, e.g. manila('2026-10-14T14:00:00'). */
const manila = (wallClock: string): number => Date.parse(`${wallClock}+08:00`)

// Wednesday 14 Oct 2026, 2pm in Manila.
const NOW = manila('2026-10-14T14:00:00')

function period(preset: ReportPreset, now = NOW): ReportPeriod {
  const result = resolveReportPeriod({ preset }, now)
  if (!result.ok) throw new Error(result.error)
  return result.period
}

function custom(from: string, to: string, now = NOW): ReportPeriod {
  const result = resolveReportPeriod({ preset: 'custom', from, to }, now)
  if (!result.ok) throw new Error(result.error)
  return result.period
}

function error(from: string | null | undefined, to: string | null | undefined, now = NOW): string {
  const result = resolveReportPeriod({ preset: 'custom', from, to }, now)
  if (result.ok) throw new Error('expected an error')
  return result.error
}

describe('constants', () => {
  it('lists the presets in filter-bar order with plain labels', () => {
    expect(REPORT_PRESETS).toEqual(['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'custom'])
    expect(REPORT_PRESET_LABELS.this_week).toBe('This week')
    expect(REPORT_PRESET_LABELS.custom).toBe('Custom')
    expect(DEFAULT_REPORT_PRESET).toBe('this_week')
    expect(MAX_REPORT_DAYS).toBe(93)
  })
})

describe('resolveReportPeriod presets', () => {
  it('today runs from Manila midnight to now and is partial', () => {
    const p = period('today')
    expect(p).toMatchObject({ from: '2026-10-14', to: '2026-10-14', isPartial: true, grain: 'hour', label: 'Today', phrase: 'today' })
    expect(p.start).toBe(manila('2026-10-14T00:00:00'))
    expect(p.end).toBe(NOW)
    expect(p.fullEnd).toBe(manila('2026-10-15T00:00:00'))
  })

  it('yesterday is the full previous day and is not partial', () => {
    const p = period('yesterday')
    expect(p).toMatchObject({ from: '2026-10-13', to: '2026-10-13', isPartial: false, grain: 'hour', phrase: 'yesterday' })
    expect(p.start).toBe(manila('2026-10-13T00:00:00'))
    expect(p.end).toBe(manila('2026-10-14T00:00:00'))
    expect(p.end).toBe(p.fullEnd)
  })

  it('this week starts on Monday and runs to now', () => {
    const p = period('this_week')
    expect(p).toMatchObject({ from: '2026-10-12', to: '2026-10-14', isPartial: true, grain: 'day', label: 'This week', phrase: 'this week' })
    expect(p.start).toBe(manila('2026-10-12T00:00:00'))
    expect(p.end).toBe(NOW)
    expect(p.fullEnd).toBe(manila('2026-10-15T00:00:00'))
  })

  it('this week on a Sunday still starts on the Monday before', () => {
    const p = period('this_week', manila('2026-10-18T10:00:00'))
    expect(p.from).toBe('2026-10-12')
    expect(p.to).toBe('2026-10-18')
  })

  it('last week is the full previous Monday to Sunday', () => {
    const p = period('last_week')
    expect(p).toMatchObject({ from: '2026-10-05', to: '2026-10-11', isPartial: false, grain: 'day', phrase: 'last week' })
    expect(p.start).toBe(manila('2026-10-05T00:00:00'))
    expect(p.end).toBe(manila('2026-10-12T00:00:00'))
  })

  it('this month runs from the 1st to now', () => {
    const p = period('this_month')
    expect(p).toMatchObject({ from: '2026-10-01', to: '2026-10-14', isPartial: true, grain: 'day', phrase: 'this month' })
    expect(p.start).toBe(manila('2026-10-01T00:00:00'))
  })

  it('last month is the full previous calendar month', () => {
    const p = period('last_month')
    expect(p).toMatchObject({ from: '2026-09-01', to: '2026-09-30', isPartial: false, grain: 'day', phrase: 'last month' })
    expect(p.end).toBe(manila('2026-10-01T00:00:00'))
  })

  it('last month from January reaches back into the previous year', () => {
    const p = period('last_month', manila('2027-01-05T09:00:00'))
    expect(p.from).toBe('2026-12-01')
    expect(p.to).toBe('2026-12-31')
  })

  it('last week across a year boundary', () => {
    const p = period('last_week', manila('2027-01-05T09:00:00'))
    expect(p.from).toBe('2026-12-28')
    expect(p.to).toBe('2027-01-03')
  })

  it('uses the Manila day, not the UTC day, for "today"', () => {
    // 17:00 UTC on the 14th is already 01:00 on the 15th in Manila.
    const p = period('today', Date.parse('2026-10-14T17:00:00Z'))
    expect(p.from).toBe('2026-10-15')
  })

  it('an instant at exactly Manila midnight belongs to the new day (half-open)', () => {
    const midnight = manila('2026-10-14T00:00:00')
    const today = period('today', midnight)
    const yesterday = period('yesterday', midnight)
    expect(today.from).toBe('2026-10-14')
    expect(today.start).toBe(midnight)
    expect(yesterday.end).toBe(midnight)
  })
})

describe('resolveReportPeriod custom', () => {
  it('accepts a past range and labels it compactly', () => {
    const p = custom('2026-10-01', '2026-10-10')
    expect(p).toMatchObject({ preset: 'custom', isPartial: false, grain: 'day', label: 'Oct 1 – 10', phrase: 'from Oct 1 to Oct 10' })
    expect(p.start).toBe(manila('2026-10-01T00:00:00'))
    expect(p.end).toBe(manila('2026-10-11T00:00:00'))
  })

  it('labels a range across months and across years', () => {
    expect(custom('2026-09-28', '2026-10-05').label).toBe('Sep 28 – Oct 5')
    expect(custom('2026-12-28', '2027-01-03', manila('2027-01-10T10:00:00')).label).toBe('Dec 28, 2026 – Jan 3, 2027')
  })

  it('a range ending today is partial and cut at now', () => {
    const p = custom('2026-10-01', '2026-10-14')
    expect(p.isPartial).toBe(true)
    expect(p.end).toBe(NOW)
    expect(p.fullEnd).toBe(manila('2026-10-15T00:00:00'))
  })

  it('a single custom day reads like a day', () => {
    const p = custom('2026-10-13', '2026-10-13')
    expect(p).toMatchObject({ grain: 'hour', label: 'Tue, Oct 13', phrase: 'on Oct 13' })
  })

  it('picks the week grain beyond 31 days and allows exactly 93 days', () => {
    expect(custom('2026-07-01', '2026-08-15').grain).toBe('week')
    const ninetyThree = custom('2026-07-13', '2026-10-13')
    expect(ninetyThree.to).toBe('2026-10-13')
  })

  it.each([
    ['missing from', null, '2026-10-10', /start date.*end date/i],
    ['missing to', '2026-10-01', undefined, /start date.*end date/i],
    ['garbage from', 'last tuesday', '2026-10-10', /date/i],
    ['impossible date', '2026-02-30', '2026-03-05', /date/i],
    ['bad month', '2026-13-01', '2026-13-02', /date/i],
    ['reversed', '2026-10-10', '2026-10-01', /before/i],
    ['future end', '2026-10-10', '2026-10-15', /future/i],
    ['too long', '2026-07-12', '2026-10-13', /93/],
  ])('rejects %s with a plain message', (_name, from, to, pattern) => {
    expect(error(from, to)).toMatch(pattern)
  })
})

describe('resolveComparePeriod', () => {
  it('today compares with the same weekday last week, cut at the same clock time', () => {
    const c = resolveComparePeriod(period('today'))
    expect(c.kind).toBe('same_weekday_last_week')
    expect(c.start).toBe(manila('2026-10-07T00:00:00'))
    expect(c.end).toBe(manila('2026-10-07T14:00:00'))
    expect(c.phrase).toBe('on the same time last week')
    expect(c.label).toBe('the same time last week')
  })

  it('yesterday compares with the full same weekday a week earlier', () => {
    const c = resolveComparePeriod(period('yesterday'))
    expect(c.kind).toBe('same_weekday_last_week')
    expect(c.start).toBe(manila('2026-10-06T00:00:00'))
    expect(c.end).toBe(manila('2026-10-07T00:00:00'))
    expect(c.phrase).toBe('on the same day last week')
  })

  it('this week compares Mon-Wed 2pm with last week Mon-Wed 2pm', () => {
    const c = resolveComparePeriod(period('this_week'))
    expect(c.kind).toBe('previous_period')
    expect(c.start).toBe(manila('2026-10-05T00:00:00'))
    expect(c.end).toBe(manila('2026-10-07T14:00:00'))
    expect(c).toMatchObject({ label: 'last week', phrase: 'on last week' })
  })

  it('last week compares with the full week before it', () => {
    const c = resolveComparePeriod(period('last_week'))
    expect(c.start).toBe(manila('2026-09-28T00:00:00'))
    expect(c.end).toBe(manila('2026-10-05T00:00:00'))
    expect(c).toMatchObject({ label: 'the week before', phrase: 'on the week before' })
  })

  it('this month compares with the same span of the previous month', () => {
    const c = resolveComparePeriod(period('this_month'))
    expect(c.start).toBe(manila('2026-09-01T00:00:00'))
    expect(c.end).toBe(manila('2026-09-14T14:00:00'))
    expect(c).toMatchObject({ label: 'last month', phrase: 'on last month' })
  })

  it('this month clamps to a shorter previous month (leap February 2028)', () => {
    const march31 = manila('2028-03-31T14:00:00')
    const c = resolveComparePeriod(period('this_month', march31))
    expect(c.start).toBe(manila('2028-02-01T00:00:00'))
    expect(c.end).toBe(manila('2028-03-01T00:00:00'))
  })

  it('this month in January compares with December of the year before', () => {
    const c = resolveComparePeriod(period('this_month', manila('2027-01-10T12:00:00')))
    expect(c.start).toBe(manila('2026-12-01T00:00:00'))
    expect(c.end).toBe(manila('2026-12-10T12:00:00'))
  })

  it('last month compares with the full month before it', () => {
    const c = resolveComparePeriod(period('last_month', manila('2028-03-10T12:00:00')))
    expect(c.start).toBe(manila('2028-01-01T00:00:00'))
    expect(c.end).toBe(manila('2028-02-01T00:00:00'))
    expect(c).toMatchObject({ label: 'the month before', phrase: 'on the month before' })
  })

  it('a custom range compares with the preceding range of the same length', () => {
    const c = resolveComparePeriod(custom('2026-10-01', '2026-10-10'))
    expect(c.kind).toBe('previous_period')
    expect(c.start).toBe(manila('2026-09-21T00:00:00'))
    expect(c.end).toBe(manila('2026-10-01T00:00:00'))
    expect(c).toMatchObject({ label: 'the previous 10 days', phrase: 'on the previous 10 days' })
  })

  it('a partial custom range is cut at the same elapsed time', () => {
    const c = resolveComparePeriod(custom('2026-10-12', '2026-10-14'))
    expect(c.start).toBe(manila('2026-10-09T00:00:00'))
    expect(c.end).toBe(manila('2026-10-11T14:00:00'))
  })

  it('a one-day custom range behaves like a day', () => {
    const c = resolveComparePeriod(custom('2026-10-13', '2026-10-13'))
    expect(c.kind).toBe('same_weekday_last_week')
    expect(c.start).toBe(manila('2026-10-06T00:00:00'))
  })
})

describe('grainFor', () => {
  it.each([
    [1, 'hour'],
    [2, 'day'],
    [31, 'day'],
    [32, 'week'],
    [93, 'week'],
  ])('%i days -> %s', (days, grain) => {
    expect(grainFor(days)).toBe(grain)
  })
})

describe('bucketKey', () => {
  const at = manila('2026-10-13T21:30:00')

  it('formats each grain in Manila time', () => {
    expect(bucketKey(at, 'hour')).toBe('2026-10-13T21')
    expect(bucketKey(at, 'day')).toBe('2026-10-13')
    expect(bucketKey(at, 'week')).toBe('2026-10-12')
    expect(bucketKey(at, 'month')).toBe('2026-10-01')
  })

  it('puts Manila midnight on the new day and the millisecond before on the old one', () => {
    expect(bucketKey(manila('2026-10-13T00:00:00'), 'day')).toBe('2026-10-13')
    expect(bucketKey(manila('2026-10-13T00:00:00') - 1, 'day')).toBe('2026-10-12')
  })

  it('keeps a late-evening Manila order on its Manila day even though UTC says otherwise', () => {
    expect(bucketKey(Date.parse('2026-10-13T16:30:00Z'), 'day')).toBe('2026-10-14')
  })

  it('uses the ISO Monday across a year boundary', () => {
    expect(bucketKey(manila('2026-12-31T12:00:00'), 'week')).toBe('2026-12-28')
    expect(bucketKey(manila('2027-01-01T12:00:00'), 'week')).toBe('2026-12-28')
    expect(bucketKey(manila('2027-01-04T00:00:00'), 'week')).toBe('2027-01-04')
    expect(bucketKey(manila('2026-10-18T23:59:00'), 'week')).toBe('2026-10-12')
  })
})

describe('bucketKeys', () => {
  it('zero-fills 7 day buckets for a full week', () => {
    const p = period('last_week')
    const keys = bucketKeys(p.start, p.end, 'day')
    expect(keys).toHaveLength(7)
    expect(keys[0]).toBe('2026-10-05')
    expect(keys[6]).toBe('2026-10-11')
  })

  it('gives 24 hour buckets for a full day', () => {
    const p = period('yesterday')
    const keys = bucketKeys(p.start, p.end, 'hour')
    expect(keys).toHaveLength(24)
    expect(keys[0]).toBe('2026-10-13T00')
    expect(keys[23]).toBe('2026-10-13T23')
  })

  it('stops at now for a partial day', () => {
    const p = period('today')
    const keys = bucketKeys(p.start, p.end, 'hour')
    expect(keys).toHaveLength(14)
    expect(keys[13]).toBe('2026-10-14T13')
  })

  it('week buckets start on the Monday that touches the range', () => {
    const keys = bucketKeys(manila('2026-10-01T00:00:00'), manila('2026-10-15T00:00:00'), 'week')
    expect(keys).toEqual(['2026-09-28', '2026-10-05', '2026-10-12'])
  })

  it('month buckets roll over the year', () => {
    const keys = bucketKeys(manila('2026-11-15T00:00:00'), manila('2027-02-02T00:00:00'), 'month')
    expect(keys).toEqual(['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01'])
  })

  it('is empty for an empty or inverted window', () => {
    expect(bucketKeys(NOW, NOW, 'day')).toEqual([])
    expect(bucketKeys(NOW, NOW - DAY, 'day')).toEqual([])
  })
})

describe('bucketLabel', () => {
  it('reads each grain for a chart axis', () => {
    expect(bucketLabel('2026-10-13T21', 'hour')).toBe('9 PM')
    expect(bucketLabel('2026-10-13T00', 'hour')).toBe('12 AM')
    expect(bucketLabel('2026-10-13T12', 'hour')).toBe('12 PM')
    expect(bucketLabel('2026-10-13T07', 'hour')).toBe('7 AM')
    expect(bucketLabel('2026-10-13', 'day')).toBe('Oct 13')
    expect(bucketLabel('2026-10-12', 'week')).toBe('Week of Oct 12')
    expect(bucketLabel('2026-10-01', 'month')).toBe('October')
  })

  it('reads each grain in a sentence', () => {
    expect(bucketLabel('2026-10-17', 'day', 'spoken')).toBe('Saturday')
    expect(bucketLabel('2026-10-12', 'week', 'spoken')).toBe('The week of Oct 12')
    expect(bucketLabel('2026-10-13T21', 'hour', 'spoken')).toBe('9 PM')
    expect(bucketLabel('2026-10-01', 'month', 'spoken')).toBe('October')
  })
})

describe('search params', () => {
  const UUID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b'

  it('defaults for empty, unknown and garbage input', () => {
    const defaults = { preset: 'this_week', from: null, to: null, branch: null, compare: true }
    expect(parseReportSearchParams({})).toEqual(defaults)
    expect(parseReportSearchParams({ period: 'forever', branch: 'x; drop table', compare: 'maybe' })).toEqual(defaults)
  })

  it('reads a custom range, a branch and compare=0', () => {
    expect(
      parseReportSearchParams({ period: 'custom', from: '2026-10-01', to: '2026-10-10', branch: UUID, compare: '0' }),
    ).toEqual({ preset: 'custom', from: '2026-10-01', to: '2026-10-10', branch: UUID, compare: false })
  })

  it('takes the first value of a repeated param and accepts the unassigned branch', () => {
    const parsed = parseReportSearchParams({ period: ['today', 'last_week'], branch: 'unassigned' })
    expect(parsed.preset).toBe('today')
    expect(parsed.branch).toBe('unassigned')
  })

  it('drops from/to unless the period is custom, and drops unreal dates', () => {
    expect(parseReportSearchParams({ period: 'today', from: '2026-10-01', to: '2026-10-02' })).toMatchObject({ from: null, to: null })
    expect(parseReportSearchParams({ period: 'custom', from: '2026-02-30', to: 'nope' })).toMatchObject({ preset: 'custom', from: null, to: null })
  })

  it('omits defaults when writing', () => {
    const none = toReportSearchParams({ preset: 'this_week', from: null, to: null, branch: null, compare: true })
    expect(none.toString()).toBe('')
  })

  it.each<Parameters<typeof toReportSearchParams>[0]>([
    { preset: 'yesterday', from: null, to: null, branch: null, compare: true },
    { preset: 'last_month', from: null, to: null, branch: 'unassigned', compare: false },
    { preset: 'custom', from: '2026-10-01', to: '2026-10-10', branch: UUID, compare: false },
    { preset: 'this_week', from: null, to: null, branch: UUID, compare: true },
  ])('round-trips %j', (params) => {
    const written = toReportSearchParams(params)
    const raw = Object.fromEntries(written.entries())
    expect(parseReportSearchParams(raw)).toEqual(params)
  })
})
