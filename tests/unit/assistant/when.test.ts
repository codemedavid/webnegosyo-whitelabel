/** @jest-environment node */
import { parseCutoffSchedule } from '@/lib/business-day/trading-day'
import { MAX_WHEN_DAYS, resolveWhen, shiftDayKey, whenSchema, type ResolvedWhen } from '@/lib/assistant/insights/when'

// Friday 2026-11-13, 2:30 PM in Manila (+08:00) = 06:30 UTC.
const NOW = Date.parse('2026-11-13T06:30:00Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const manila = (local: string) => Date.parse(`${local}+08:00`)

function ok(result: ReturnType<typeof resolveWhen>): ResolvedWhen {
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`)
  return result.when
}

describe('resolveWhen: Owl asks about any point in time', () => {
  test('yesterday is the whole Manila day, compared with the same weekday last week', () => {
    const when = ok(resolveWhen({ period: 'yesterday' }, NOW))

    expect(when).toMatchObject({ from: '2026-11-12', to: '2026-11-12', dayCount: 1, isPartial: false, label: 'Yesterday' })
    expect(when.start).toBe(manila('2026-11-12T00:00:00'))
    expect(when.end).toBe(manila('2026-11-13T00:00:00'))
    expect(when.compare).toEqual({ start: when.start - 7 * DAY, end: when.end - 7 * DAY, label: 'the same day last week' })
  })

  test('today is "so far" and its comparison is cut at the same elapsed time', () => {
    const when = ok(resolveWhen({ period: 'today' }, NOW))

    expect(when.isPartial).toBe(true)
    expect(when.end).toBe(NOW)
    expect(when.compare.end - when.compare.start).toBe(NOW - when.start)
  })

  test('an exact date ("last Saturday") and a range; a reversed range is read the way it was meant', () => {
    const saturday = ok(resolveWhen({ from: '2026-11-07' }, NOW))
    expect(saturday).toMatchObject({ from: '2026-11-07', to: '2026-11-07', dayCount: 1, label: 'Sat, Nov 7' })

    const range = ok(resolveWhen({ from: '2026-11-10', to: '2026-11-01' }, NOW))
    expect(range).toMatchObject({ from: '2026-11-01', to: '2026-11-10', dayCount: 10 })
    expect(range.compare.end).toBe(range.start)
    expect(range.compare.start).toBe(range.start - 10 * DAY)
  })

  test('no period falls back to the tool default', () => {
    expect(ok(resolveWhen({}, NOW)).label).toBe('Last 7 days')
    expect(ok(resolveWhen({}, NOW, undefined, 'today')).label).toBe('Today')
  })

  test('last 90 days ends today and counts 90 days', () => {
    const when = ok(resolveWhen({ period: 'last_90_days' }, NOW))
    expect(when).toMatchObject({ to: '2026-11-13', dayCount: 90, label: 'Last 90 days', isPartial: true })
  })

  test('the future and ranges longer than the cap are refused in words, never cut silently', () => {
    expect(resolveWhen({ from: '2026-11-14' }, NOW)).toEqual({ ok: false, error: "The end date can't be in the future." })
    const tooLong = resolveWhen({ from: '2026-01-01', to: '2026-11-01' }, NOW)
    expect(tooLong.ok).toBe(false)
    if (!tooLong.ok) expect(tooLong.error).toContain(String(MAX_WHEN_DAYS))
    expect(ok(resolveWhen({ from: shiftDayKey('2026-11-13', 1 - MAX_WHEN_DAYS), to: '2026-11-13' }, NOW)).dayCount).toBe(MAX_WHEN_DAYS)
  })

  test('hours of one day narrow the window and move the comparison by the same amount', () => {
    const when = ok(resolveWhen({ period: 'yesterday', fromTime: '14:00', toTime: '17:00' }, NOW))

    expect(when.start).toBe(manila('2026-11-12T14:00:00'))
    expect(when.end).toBe(manila('2026-11-12T17:00:00'))
    expect(when.compare).toMatchObject({ start: when.start - 7 * DAY, end: when.end - 7 * DAY })
    expect(when.label).toBe('Yesterday, 2 PM – 5 PM')
  })

  test('hours today stop at now; a start still to come is refused', () => {
    const since = ok(resolveWhen({ period: 'today', fromTime: '13:00', toTime: '18:00' }, NOW))
    expect(since).toMatchObject({ start: manila('2026-11-13T13:00:00'), end: NOW, isPartial: true })

    expect(resolveWhen({ period: 'today', fromTime: '16:00' }, NOW)).toEqual({ ok: false, error: "That time hasn't happened yet." })
    expect(resolveWhen({ period: 'yesterday', fromTime: '17:00', toTime: '09:00' }, NOW).ok).toBe(false)
  })

  test('hours on a multi-day window are not applied, and the answer says so', () => {
    const when = ok(resolveWhen({ period: 'last_week', fromTime: '10:00' }, NOW))
    expect(when.timesIgnored).toBe(true)
    expect(when.dayCount).toBe(7)
  })

  test('a store whose day ends at 4 AM: yesterday runs 4 AM to 4 AM, and 1 AM is the next calendar date', () => {
    const schedule = parseCutoffSchedule([{ effective_from: '2026-01-01', cutoff_minutes: 240 }])
    const when = ok(resolveWhen({ period: 'yesterday' }, NOW, schedule))
    expect(when.start).toBe(manila('2026-11-12T04:00:00'))
    expect(when.end).toBe(manila('2026-11-13T04:00:00'))

    const lateNight = ok(resolveWhen({ period: 'yesterday', fromTime: '22:00', toTime: '02:00' }, NOW, schedule))
    expect(lateNight.start).toBe(manila('2026-11-12T22:00:00'))
    expect(lateNight.end).toBe(manila('2026-11-13T02:00:00'))

    // 3 AM on Nov 13 still belongs to business day Nov 12.
    const beforeCutoff = Date.parse('2026-11-13T03:00:00+08:00')
    expect(ok(resolveWhen({ period: 'today' }, beforeCutoff, schedule)).from).toBe('2026-11-12')
  })

  test('the schema accepts only calendar dates and 24h clock times', () => {
    expect(whenSchema.safeParse({ from: '2026-11-1' }).success).toBe(false)
    expect(whenSchema.safeParse({ fromTime: '2pm' }).success).toBe(false)
    expect(whenSchema.safeParse({ period: 'yesterday', fromTime: '09:30' }).success).toBe(true)
  })
})
