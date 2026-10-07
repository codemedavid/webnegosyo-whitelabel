import {
  DAY_MS,
  HOUR_MS,
  bucketIndex,
  bucketLabels,
  elapsedBuckets,
  manilaDayStart,
  manilaHour,
  parseDashboardRange,
  resolveDashboardWindow,
} from '@/lib/dashboard/periods'

// 2026-10-04 14:30 in Manila (+08:00) = 06:30 UTC.
const NOW = Date.parse('2026-10-04T06:30:00Z')
const MANILA_MIDNIGHT = Date.parse('2026-10-03T16:00:00Z')

describe('dashboard periods', () => {
  test('manila day starts at 16:00 UTC the previous calendar day', () => {
    expect(manilaDayStart(NOW)).toBe(MANILA_MIDNIGHT)
    expect(manilaHour(NOW)).toBe(14)
  })

  test('today compares with yesterday cut at the same clock time', () => {
    const window = resolveDashboardWindow('today', NOW)

    expect(window.start).toBe(MANILA_MIDNIGHT)
    expect(window.end).toBe(NOW)
    expect(window.previousStart).toBe(MANILA_MIDNIGHT - DAY_MS)
    expect(window.previousEnd).toBe(NOW - DAY_MS)
    expect(window.bucket).toBe('hour')
    expect(elapsedBuckets(window)).toBe(15)
  })

  test('7 days includes today and compares with the 7 days before', () => {
    const window = resolveDashboardWindow('7d', NOW)

    expect(window.start).toBe(MANILA_MIDNIGHT - 6 * DAY_MS)
    expect(window.previousStart).toBe(window.start - 7 * DAY_MS)
    expect(window.previousEnd).toBe(NOW - 7 * DAY_MS)
    expect(window.bucketCount).toBe(7)
    expect(elapsedBuckets(window)).toBe(7)
    expect(bucketLabels(window)).toEqual(['Sep 28', 'Sep 29', 'Sep 30', 'Oct 1', 'Oct 2', 'Oct 3', 'Oct 4'])
  })

  test('bucket index is measured from the given origin and bounded', () => {
    const window = resolveDashboardWindow('today', NOW)

    expect(bucketIndex(window, window.start, window.start + 9 * HOUR_MS + 5)).toBe(9)
    expect(bucketIndex(window, window.previousStart, window.previousStart + 23 * HOUR_MS)).toBe(23)
    expect(bucketIndex(window, window.start, window.start - 1)).toBeNull()
  })

  test('unknown range falls back to today', () => {
    expect(parseDashboardRange('30d')).toBe('30d')
    expect(parseDashboardRange('1y')).toBe('7d')
    expect(parseDashboardRange(undefined)).toBe('7d')
  })
})
