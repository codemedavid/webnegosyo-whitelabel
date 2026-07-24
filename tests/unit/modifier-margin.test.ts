import { computeItemMarginSummary, computeOptionMargin } from '@/lib/modifier-margin'
import type { ModifierOption } from '@/types/database'

function option(overrides: Partial<ModifierOption> = {}): ModifierOption {
  return {
    id: overrides.id ?? 'opt',
    name: overrides.name ?? 'Option',
    price_modifier: overrides.price_modifier ?? 0,
    display_order: overrides.display_order ?? 0,
    ...overrides,
  }
}

describe('computeOptionMargin', () => {
  it('prices at base + modifier and costs from manual cost when no recipe', () => {
    const result = computeOptionMargin(100, option({ price_modifier: 20, manual_cost: 30 }))
    expect(result.price).toBe(120)
    expect(result.cost).toBe(30)
    expect(result.profit).toBe(90)
    expect(result.marginPercent).toBe(75)
  })

  it('lets an attached recipe cost override the manual cost', () => {
    const result = computeOptionMargin(100, option({ price_modifier: 0, manual_cost: 30 }), 45)
    expect(result.cost).toBe(45)
    expect(result.profit).toBe(55)
  })

  it('treats a missing manual cost as zero (full margin)', () => {
    const result = computeOptionMargin(50, option({ price_modifier: 0 }))
    expect(result.cost).toBe(0)
    expect(result.marginPercent).toBe(100)
  })

  it('does not divide by zero when price is zero', () => {
    const result = computeOptionMargin(0, option({ price_modifier: 0, manual_cost: 5 }))
    expect(result.price).toBe(0)
    expect(result.marginPercent).toBe(0)
  })
})

describe('computeItemMarginSummary', () => {
  it('summarizes the base item margin from base price and cost', () => {
    const summary = computeItemMarginSummary(200, 80)
    expect(summary.price).toBe(200)
    expect(summary.cost).toBe(80)
    expect(summary.profit).toBe(120)
    expect(summary.marginPercent).toBe(60)
  })

  it('reports zero margin for a free item', () => {
    expect(computeItemMarginSummary(0, 0).marginPercent).toBe(0)
  })
})
