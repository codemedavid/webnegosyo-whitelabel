import { describeSelectionRule, isSelectionAtMax } from '@/lib/modifier-groups'
import type { ModifierGroup } from '@/types/database'

/**
 * The customer-facing wording of a group's min/max rule. Before this existed,
 * `min_select` / `max_select` were invisible on the storefront: the shopper only
 * discovered "choose at least 2" by pressing Add to Cart and getting a toast.
 * The copy lives in one pure function so the selector stays presentational and
 * the wording is pinned by tests.
 */

function group(overrides: Partial<ModifierGroup> = {}): ModifierGroup {
  return {
    id: 'g',
    name: 'Toppings',
    display_order: 0,
    min_select: 0,
    max_select: null,
    options: [],
    ...overrides,
  }
}

describe('describeSelectionRule', () => {
  it('describes an optional unlimited group as free choice', () => {
    expect(describeSelectionRule(group({ min_select: 0, max_select: null })))
      .toBe('Optional — choose any')
  })

  it('describes an optional capped group with the cap', () => {
    expect(describeSelectionRule(group({ min_select: 0, max_select: 3 })))
      .toBe('Optional — choose up to 3')
  })

  it('describes a single-select required group as choose 1', () => {
    expect(describeSelectionRule(group({ min_select: 1, max_select: 1 })))
      .toBe('Required — choose 1')
  })

  it('describes an exact-count group as a single number', () => {
    expect(describeSelectionRule(group({ min_select: 2, max_select: 2 })))
      .toBe('Required — choose 2')
  })

  it('describes a bounded range with both ends', () => {
    expect(describeSelectionRule(group({ min_select: 2, max_select: 4 })))
      .toBe('Required — choose 2 to 4')
  })

  it('describes an unbounded minimum with at least', () => {
    expect(describeSelectionRule(group({ min_select: 2, max_select: null })))
      .toBe('Required — choose at least 2')
  })
})

describe('isSelectionAtMax', () => {
  it('is false when the group has no cap', () => {
    expect(isSelectionAtMax(group({ max_select: null }), 99)).toBe(false)
  })

  it('is false below the cap', () => {
    expect(isSelectionAtMax(group({ max_select: 3 }), 2)).toBe(false)
  })

  it('is true at the cap', () => {
    expect(isSelectionAtMax(group({ max_select: 3 }), 3)).toBe(true)
  })

  it('is true past the cap', () => {
    expect(isSelectionAtMax(group({ max_select: 3 }), 4)).toBe(true)
  })

  it('is false for a single-select group so the choice stays swappable', () => {
    // Single-select toggling replaces rather than accumulates, so capping the
    // UI at 1 would freeze the customer on their first pick.
    expect(isSelectionAtMax(group({ max_select: 1 }), 1)).toBe(false)
  })
})
