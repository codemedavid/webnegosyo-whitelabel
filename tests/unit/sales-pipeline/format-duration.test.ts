import { formatDuration } from '@/lib/sales-pipeline/format-duration'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

describe('formatDuration', () => {
  it.each([
    [null, '—'],
    [-5, '—'],
    [Number.NaN, '—'],
    [10 * 1000, '1m'],
    [45 * MINUTE_MS, '45m'],
    [5 * HOUR_MS, '5h'],
    [3.5 * DAY_MS, '3.5d'],
    [12.4 * DAY_MS, '12d'],
  ])('formats %p as %p', (input, expected) => {
    expect(formatDuration(input)).toBe(expected)
  })
})
