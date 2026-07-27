import {
  setGroupMinSelect,
  setGroupMaxSelect,
  setGroupMultiple,
  setGroupRequired,
} from '@/lib/modifier-groups-form'
import type { ModifierGroup } from '@/types/database'

/**
 * The admin editor could only ever express `min_select` 0 or 1 (via a Required
 * checkbox), so "pick at least 2" was unauthorable on the web even though the
 * DB, the library schema and the storefront validator all supported it. These
 * setters make the minimum a first-class, clamped value.
 *
 * Both setters keep `min_select <= max_select` true, because a group where the
 * minimum exceeds the cap can never be satisfied — add-to-cart would reject
 * every possible selection.
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

describe('setGroupMinSelect', () => {
  it('sets an explicit minimum above 1', () => {
    expect(setGroupMinSelect(group({ max_select: 4 }), 2).min_select).toBe(2)
  })

  it('clamps a negative minimum to zero', () => {
    expect(setGroupMinSelect(group(), -3).min_select).toBe(0)
  })

  it('raises max_select so the rule stays satisfiable', () => {
    const result = setGroupMinSelect(group({ min_select: 0, max_select: 2 }), 5)

    expect(result.min_select).toBe(5)
    expect(result.max_select).toBe(5)
  })

  it('leaves an uncapped group uncapped', () => {
    expect(setGroupMinSelect(group({ max_select: null }), 3).max_select).toBeNull()
  })

  it('does not mutate the input group', () => {
    const original = group({ min_select: 0, max_select: 2 })
    setGroupMinSelect(original, 5)

    expect(original.min_select).toBe(0)
    expect(original.max_select).toBe(2)
  })
})

describe('setGroupMaxSelect', () => {
  it('sets an explicit cap', () => {
    expect(setGroupMaxSelect(group(), 3).max_select).toBe(3)
  })

  it('clears the cap when given null', () => {
    expect(setGroupMaxSelect(group({ max_select: 3 }), null).max_select).toBeNull()
  })

  it('clamps a cap below 1 up to 1', () => {
    expect(setGroupMaxSelect(group(), 0).max_select).toBe(1)
  })

  it('lowers min_select so the rule stays satisfiable', () => {
    const result = setGroupMaxSelect(group({ min_select: 4, max_select: null }), 2)

    expect(result.max_select).toBe(2)
    expect(result.min_select).toBe(2)
  })

  it('does not mutate the input group', () => {
    const original = group({ min_select: 4, max_select: null })
    setGroupMaxSelect(original, 2)

    expect(original.min_select).toBe(4)
    expect(original.max_select).toBeNull()
  })
})

describe('existing Required / Allow multiple toggles still hold', () => {
  it('required keeps a minimum above 1 rather than resetting it to 1', () => {
    expect(setGroupRequired(group({ min_select: 3, max_select: null }), true).min_select).toBe(3)
  })

  it('switching to single-select clamps a large minimum down to 1', () => {
    const result = setGroupMultiple(group({ min_select: 3, max_select: null }), false)

    expect(result.max_select).toBe(1)
    expect(result.min_select).toBe(1)
  })
})
