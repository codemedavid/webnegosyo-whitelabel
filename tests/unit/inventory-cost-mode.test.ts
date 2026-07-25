/**
 * Cost mode: every costable target chooses between a `simple` manual cost and a
 * `composite` recipe-derived cost. The chosen mode is the single source of truth.
 *
 * Backward compatibility is the load-bearing requirement here: options saved
 * before this feature have no `cost_mode`, and they must keep the legacy
 * behavior exactly ("an attached recipe cost overrides the manual cost").
 */

import { describe, it, expect } from '@jest/globals'
import { resolveCostByMode, resolveOptionCostForOption } from '@/lib/inventory/cost-mode'
import { resolveOptionCost } from '@/lib/modifier-groups'
import type { ModifierOption } from '@/types/database'

function makeOption(overrides: Partial<ModifierOption> = {}): ModifierOption {
  return {
    id: 'opt-1',
    name: 'Large',
    price_modifier: 20,
    display_order: 0,
    ...overrides,
  }
}

describe('resolveCostByMode', () => {
  it('uses the manual cost in simple mode even when a recipe cost exists', () => {
    expect(resolveCostByMode('simple', 5, 12)).toBe(5)
  })

  it('uses the recipe cost in composite mode even when a manual cost exists', () => {
    expect(resolveCostByMode('composite', 5, 12)).toBe(12)
  })

  it('treats a zero recipe cost in composite mode as a real zero, not a fallback', () => {
    expect(resolveCostByMode('composite', 5, 0)).toBe(0)
  })

  it('returns 0 in composite mode when no recipe is attached yet', () => {
    expect(resolveCostByMode('composite', 5, undefined)).toBe(0)
  })

  it('returns 0 in simple mode when no manual cost is entered yet', () => {
    expect(resolveCostByMode('simple', undefined, 12)).toBe(0)
  })

  // ---- Legacy (mode absent) — must match resolveOptionCost exactly ----------

  it('falls back to legacy override behavior when no mode is set', () => {
    expect(resolveCostByMode(undefined, 5, 12)).toBe(12)
    expect(resolveCostByMode(undefined, 5, 0)).toBe(0)
    expect(resolveCostByMode(undefined, 5, undefined)).toBe(5)
    expect(resolveCostByMode(undefined, undefined, undefined)).toBe(0)
  })

  it('agrees with the pre-existing resolveOptionCost for every legacy input', () => {
    const cases: Array<[number | undefined, number | undefined]> = [
      [5, 12],
      [5, 0],
      [5, undefined],
      [undefined, 12],
      [undefined, undefined],
      [0, undefined],
    ]
    for (const [manual, recipe] of cases) {
      expect(resolveCostByMode(undefined, manual, recipe)).toBe(resolveOptionCost(manual, recipe))
    }
  })
})

describe('resolveOptionCostForOption', () => {
  it('honors an explicit simple mode on the option', () => {
    const option = makeOption({ cost_mode: 'simple', manual_cost: 5 })
    expect(resolveOptionCostForOption(option, 12)).toBe(5)
  })

  it('honors an explicit composite mode on the option', () => {
    const option = makeOption({ cost_mode: 'composite', manual_cost: 5 })
    expect(resolveOptionCostForOption(option, 12)).toBe(12)
  })

  it('keeps legacy behavior for options saved before cost_mode existed', () => {
    const option = makeOption({ manual_cost: 5 })
    expect(resolveOptionCostForOption(option, 12)).toBe(12)
    expect(resolveOptionCostForOption(option, undefined)).toBe(5)
  })

  it('returns 0 for an option with neither a manual cost nor a recipe', () => {
    expect(resolveOptionCostForOption(makeOption(), undefined)).toBe(0)
  })
})
