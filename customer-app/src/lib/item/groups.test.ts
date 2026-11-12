import { VALID_CATALOG } from '@/fixtures/contract-fixtures'
import type { AppMenuItem, AppModifierGroup } from '@/lib/contract'
import { defaultSelections } from '@/lib/cart/pricing'
import { canQuickAdd, firstUnmetGroupId, formatPriceDelta, groupKind, groupSummary } from './groups'

const latte = VALID_CATALOG.items.find((item) => item.id === 'item-latte') as AppMenuItem
const croissant = VALID_CATALOG.items.find((item) => item.id === 'item-croissant') as AppMenuItem
const [size, milk, extras] = latte.modifierGroups

const multi: AppModifierGroup = { ...extras, id: 'toppings', name: 'Toppings', selectionMode: 'choice', minSelect: 0, maxSelect: 2 }
const atLeastTwo: AppModifierGroup = { ...multi, id: 'sauces', name: 'Sauces', minSelect: 2, maxSelect: null }

describe('groupKind', () => {
  it('tells single choice, multi choice and quantity groups apart', () => {
    expect(groupKind(size)).toBe('single')
    expect(groupKind(multi)).toBe('multi')
    expect(groupKind(extras)).toBe('quantity')
  })
})

describe('groupSummary', () => {
  it('marks a required single choice and counts its pick', () => {
    const summary = groupSummary(size, defaultSelections(latte))
    expect(summary).toEqual({ kind: 'single', isRequired: true, hint: 'Choose 1', picked: 1, isSatisfied: true })
  })

  it('says how many an optional capped group may take', () => {
    expect(groupSummary(multi, {}).hint).toBe('Choose up to 2')
    expect(groupSummary(multi, {}).isRequired).toBe(false)
    expect(groupSummary(multi, {}).isSatisfied).toBe(true)
  })

  it('asks for the minimum when a group needs several picks', () => {
    const summary = groupSummary(atLeastTwo, { sauces: { a: 1 } })
    expect(summary.hint).toBe('Choose at least 2')
    expect(summary.isSatisfied).toBe(false)
  })

  it('counts quantity picks, not distinct options', () => {
    expect(groupSummary(extras, { extras: { shot: 2, syrup: 1 } }).picked).toBe(3)
    expect(groupSummary(extras, {}).hint).toBe('Optional')
  })
})

describe('firstUnmetGroupId', () => {
  it('is null when every group is satisfied', () => {
    expect(firstUnmetGroupId(latte, defaultSelections(latte))).toBeNull()
  })

  it('points at the first required group left empty, in menu order', () => {
    expect(firstUnmetGroupId(latte, { size: {}, milk: {}, extras: {} })).toBe('size')
    expect(firstUnmetGroupId(latte, { size: { tall: 1 }, milk: {} })).toBe(milk.id)
  })
})

describe('formatPriceDelta', () => {
  it('shows a plus price, and nothing for free options', () => {
    expect(formatPriceDelta(20)).toBe('+₱20')
    expect(formatPriceDelta(12.5)).toBe('+₱12.50')
    expect(formatPriceDelta(0)).toBe('')
  })
})

describe('canQuickAdd', () => {
  it('allows a one-tap add only for available dishes with nothing to choose', () => {
    expect(canQuickAdd(croissant)).toBe(true)
    expect(canQuickAdd(latte)).toBe(false)
    expect(canQuickAdd({ ...croissant, isAvailable: false })).toBe(false)
  })

  it('allows it when every group is optional', () => {
    expect(canQuickAdd({ ...croissant, modifierGroups: [extras] })).toBe(true)
  })
})
