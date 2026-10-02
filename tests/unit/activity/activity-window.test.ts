import {
  DEFAULT_ACTIVITY_PRESET,
  MAX_ACTIVITY_SPAN_DAYS,
  resolveActivityWindow,
} from '@/lib/activity/activity-window'

/** 2026-09-29 14:00 in Manila. */
const NOW = '2026-09-29T06:00:00.000Z'

describe('resolveActivityWindow', () => {
  it('defaults to the last 7 Manila days, today included', () => {
    const window = resolveActivityWindow({}, NOW)

    expect(window).toMatchObject({
      preset: DEFAULT_ACTIVITY_PRESET,
      fromDayKey: '2026-09-23',
      toDayKey: '2026-09-29',
      dayCount: 7,
    })
  })

  it('bounds the window on Manila midnights, end exclusive', () => {
    const window = resolveActivityWindow({ range: 'today' }, NOW)

    expect(new Date(window.startMs).toISOString()).toBe('2026-09-28T16:00:00.000Z')
    expect(new Date(window.endMs).toISOString()).toBe('2026-09-29T16:00:00.000Z')
    expect(window.dayCount).toBe(1)
  })

  it.each([
    ['30d', '2026-08-31', 30],
    ['90d', '2026-07-02', 90],
  ])('resolves the %s preset', (range, fromDayKey, dayCount) => {
    expect(resolveActivityWindow({ range }, NOW)).toMatchObject({
      preset: range,
      fromDayKey,
      toDayKey: '2026-09-29',
      dayCount,
    })
  })

  it('reads a custom range from its two dates', () => {
    const window = resolveActivityWindow({ from: '2026-09-01', to: '2026-09-15' }, NOW)

    expect(window).toMatchObject({
      preset: 'custom',
      fromDayKey: '2026-09-01',
      toDayKey: '2026-09-15',
      dayCount: 15,
    })
  })

  it('swaps a range entered back to front rather than returning nothing', () => {
    const window = resolveActivityWindow({ from: '2026-09-15', to: '2026-09-01' }, NOW)

    expect(window).toMatchObject({
      fromDayKey: '2026-09-01',
      toDayKey: '2026-09-15',
    })
  })

  it('runs a custom range with no end up to today', () => {
    const window = resolveActivityWindow({ from: '2026-09-20' }, NOW)

    expect(window).toMatchObject({
      fromDayKey: '2026-09-20',
      toDayKey: '2026-09-29',
      dayCount: 10,
    })
  })

  it('clamps a future end to today', () => {
    const window = resolveActivityWindow({ from: '2026-09-20', to: '2026-12-31' }, NOW)

    expect(window.toDayKey).toBe('2026-09-29')
  })

  it('caps a very long custom range at the maximum span, keeping the end', () => {
    const window = resolveActivityWindow({ from: '2020-01-01', to: '2026-09-29' }, NOW)

    expect(window.dayCount).toBe(MAX_ACTIVITY_SPAN_DAYS)
    expect(window.toDayKey).toBe('2026-09-29')
  })

  it('falls back to the default for impossible dates', () => {
    expect(resolveActivityWindow({ from: '2026-02-31', to: 'nonsense' }, NOW).preset).toBe(
      DEFAULT_ACTIVITY_PRESET
    )
  })

  it('falls back to the default for a range that starts in the future', () => {
    expect(resolveActivityWindow({ from: '2026-10-05', to: '2026-10-09' }, NOW).preset).toBe(
      DEFAULT_ACTIVITY_PRESET
    )
  })

  it('ignores an unknown preset', () => {
    expect(resolveActivityWindow({ range: 'forever' }, NOW).preset).toBe(DEFAULT_ACTIVITY_PRESET)
  })

  it('lets a named preset win over stray dates', () => {
    expect(resolveActivityWindow({ range: '30d', from: '2026-09-01' }, NOW).preset).toBe('30d')
  })
})
