import type { ModifierGroup } from '@/types/database'
import { applyChoiceRule, CHOICE_RULES, deriveChoiceRule } from '@/lib/modifier-choice-rule'

function group(overrides: Partial<ModifierGroup> = {}): ModifierGroup {
  return {
    id: 'g',
    name: 'Size',
    display_order: 0,
    min_select: 0,
    max_select: 1,
    selection_mode: 'choice',
    options: [],
    ...overrides,
  }
}

describe('deriveChoiceRule', () => {
  it('reads a required single pick as "must pick 1"', () => {
    expect(deriveChoiceRule(group({ min_select: 1, max_select: 1 }))).toBe('pick-one')
  })

  it('reads an optional single pick as "may pick 1"', () => {
    expect(deriveChoiceRule(group({ min_select: 0, max_select: 1 }))).toBe('pick-one-optional')
  })

  it('reads an optional multi pick as "may pick any"', () => {
    expect(deriveChoiceRule(group({ min_select: 0, max_select: null }))).toBe('pick-any')
  })

  it('reads a capped multi pick with a minimum as "must pick at least 1"', () => {
    expect(deriveChoiceRule(group({ min_select: 2, max_select: 3 }))).toBe('pick-some')
  })

  it('treats a group with no selection mode as a choice group', () => {
    expect(deriveChoiceRule(group({ selection_mode: undefined, min_select: 1, max_select: 1 }))).toBe('pick-one')
  })

  it('reads quantity groups by whether they are required', () => {
    expect(deriveChoiceRule(group({ selection_mode: 'quantity', min_select: 0, max_select: null }))).toBe('extras-optional')
    expect(deriveChoiceRule(group({ selection_mode: 'quantity', min_select: 2, max_select: 5 }))).toBe('extras-required')
  })
})

describe('applyChoiceRule', () => {
  it('round-trips every rule', () => {
    for (const { value } of CHOICE_RULES) {
      expect(deriveChoiceRule(applyChoiceRule(group(), value))).toBe(value)
    }
  })

  it('turns a choice group into extras without touching its options or limits', () => {
    const size = group({ options: [{ id: 'o', name: 'Large', price_modifier: 20, display_order: 0 }] })
    expect(applyChoiceRule(size, 'extras-optional')).toEqual({ ...size, selection_mode: 'quantity' })
  })

  it('makes a single pick required', () => {
    expect(applyChoiceRule(group(), 'pick-one')).toMatchObject({ min_select: 1, max_select: 1 })
  })

  it('opens a single pick up to any number', () => {
    expect(applyChoiceRule(group({ min_select: 1 }), 'pick-any')).toMatchObject({ min_select: 0, max_select: null })
  })

  it('keeps an existing multi-pick minimum when it is already required', () => {
    expect(applyChoiceRule(group({ min_select: 2, max_select: null }), 'pick-some')).toMatchObject({ min_select: 2, max_select: null })
  })

  it('brings extras back to a single pick', () => {
    const extras = group({ selection_mode: 'quantity', min_select: 0, max_select: null })
    expect(applyChoiceRule(extras, 'pick-one-optional')).toMatchObject({ selection_mode: 'choice', min_select: 0, max_select: 1 })
  })

  it('does not return the same object it was given', () => {
    const original = group()
    expect(applyChoiceRule(original, 'pick-one-optional')).not.toBe(original)
  })
})
