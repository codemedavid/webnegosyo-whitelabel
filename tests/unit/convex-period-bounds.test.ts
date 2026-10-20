/**
 * Convex's `getDashboardStatsByPeriod` filters `>= start AND <= end`, and
 * `_creationTime` carries fractions of a millisecond. Passing `end − 1` for a
 * half-open window lost any order in (end − 1, end): counted on neither day.
 * The largest double below `end` makes `<=` exactly `<`.
 */
import { inclusiveEndFor } from '@/lib/convex/period-bounds'

describe('inclusiveEndFor', () => {
  const end = Date.UTC(2026, 9, 12, 16)

  test('is below the end, and nothing representable lies between', () => {
    const bound = inclusiveEndFor(end)
    expect(bound).toBeLessThan(end)
    expect((bound + end) / 2 === bound || (bound + end) / 2 === end).toBe(true)
  })

  test('keeps an order at a fraction of a millisecond before the end, drops the one at the end', () => {
    const bound = inclusiveEndFor(end)
    expect(end - 0.25 <= bound).toBe(true)
    expect(end - 1 + 0.5 <= bound).toBe(true)
    expect(end <= bound).toBe(false)
  })

  test('works at zero and for negative and non-finite input', () => {
    expect(inclusiveEndFor(0)).toBeLessThan(0)
    expect(inclusiveEndFor(-5)).toBeLessThan(-5)
    expect(() => inclusiveEndFor(Number.NaN)).toThrow()
  })
})
