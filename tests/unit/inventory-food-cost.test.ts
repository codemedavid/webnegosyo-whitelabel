/**
 * Phase 2 — food cost percentage.
 *
 * The safety property under test is a single distinction: revenue that is
 * UNAVAILABLE must never be treated as revenue that is ZERO. A tenant whose
 * order backend could not be reached has an unknown food cost, not a perfect
 * one, and the difference between those two is the difference between a report
 * that is useful and a report that is quietly congratulatory.
 */

import { resolveFoodCostPercent } from '@/lib/inventory/food-cost'
import { describeRevenueCaveat, formatFoodCostPercent } from '@/lib/inventory/daily-report-view'

describe('resolveFoodCostPercent', () => {
  test('divides cost of goods by sales', () => {
    // Arrange
    const cogs = 300
    const revenue = 1000

    // Act
    const percent = resolveFoodCostPercent(cogs, revenue)

    // Assert
    expect(percent).toBe(30)
  })

  test('does not pre-round, so the view decides the precision', () => {
    expect(resolveFoodCostPercent(100, 300)).toBeCloseTo(33.3333, 4)
  })

  test('returns null when revenue could not be read at all', () => {
    // The whole point of the phase. A Convex tenant whose deployment timed out
    // has an unknown percentage; zero would read as a flawless day.
    expect(resolveFoodCostPercent(300, null)).toBeNull()
  })

  test('returns null when the day took no money', () => {
    // Dividing by zero yields Infinity, which renders as "∞%" and tells a
    // merchant nothing. A day with stock movement and no sales is a fact the
    // caveat states in words instead.
    expect(resolveFoodCostPercent(300, 0)).toBeNull()
  })

  test('returns null rather than a negative percentage for impossible revenue', () => {
    // Refunds are not modelled as negative day totals anywhere; a negative here
    // means the figure is wrong, and a wrong ratio is worse than none.
    expect(resolveFoodCostPercent(300, -500)).toBeNull()
  })

  test('reports a genuine zero when sales happened and nothing was deducted', () => {
    // Distinct from the unavailable case above: this day is real and its cost
    // really was zero, which is itself worth seeing (usually: no recipes).
    expect(resolveFoodCostPercent(0, 1000)).toBe(0)
  })

  test('keeps a negative cost of goods visible instead of hiding it', () => {
    // A void nets off its sale, so a day that voids more than it sells has
    // negative usage. That is a real anomaly and must not be silently clamped.
    expect(resolveFoodCostPercent(-50, 1000)).toBe(-5)
  })
})

describe('formatFoodCostPercent', () => {
  test('renders one decimal place with a percent sign', () => {
    expect(formatFoodCostPercent(33.3333)).toBe('33.3%')
  })

  test('rounds rather than truncates', () => {
    expect(formatFoodCostPercent(29.96)).toBe('30.0%')
  })

  test('keeps the sign on a negative percentage', () => {
    expect(formatFoodCostPercent(-5)).toBe('-5.0%')
  })
})

describe('describeRevenueCaveat', () => {
  test('says nothing when the day has sales', () => {
    // A caveat that is always present is a caveat nobody reads.
    expect(describeRevenueCaveat(1000)).toBeNull()
  })

  test('distinguishes an unreadable backend from a quiet day', () => {
    const unavailable = describeRevenueCaveat(null)
    const noSales = describeRevenueCaveat(0)

    expect(unavailable).not.toBeNull()
    expect(noSales).not.toBeNull()
    expect(unavailable).not.toBe(noSales)
  })

  test('blames the backend, not the merchant, when sales could not be read', () => {
    expect(describeRevenueCaveat(null)).toContain('could not be read')
  })

  test('states plainly that no sales were recorded', () => {
    expect(describeRevenueCaveat(0)).toContain('No sales')
  })
})
