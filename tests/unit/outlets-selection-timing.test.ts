import { describe, it, expect } from '@jest/globals'
import {
  resolveOutletSelectionTiming,
  shouldGateMenuForOutlet,
  shouldPickOutletAtCheckout,
  type OutletTimingTenantFields,
} from '@/lib/outlets/selection-timing'

/**
 * A merchant can now decide WHEN the customer picks a branch: before the menu
 * (the splash chooser that shipped first) or at checkout alongside the order
 * type.
 *
 * Every existing tenant row predates the column, so an absent value must read
 * as 'before' — the behaviour those storefronts have today. A garbage value
 * must read as 'before' too: falling through to "no gate, no checkout picker"
 * would let a multi-branch order be placed with no branch at all.
 */

const enabled = (
  overrides: Partial<OutletTimingTenantFields> = {}
): OutletTimingTenantFields => ({
  multi_branch_enabled: true,
  ...overrides,
})

const outlet = (id: string, isActive = true) => ({ id, is_active: isActive })
const TWO_OUTLETS = [outlet('a'), outlet('b')]

describe('resolveOutletSelectionTiming', () => {
  it('is "before" when the column is missing (existing tenant rows)', () => {
    expect(resolveOutletSelectionTiming({})).toBe('before')
  })

  it('is "before" when the column is null', () => {
    expect(resolveOutletSelectionTiming({ outlet_selection_timing: null })).toBe('before')
  })

  it('is "before" for a null tenant', () => {
    expect(resolveOutletSelectionTiming(null)).toBe('before')
  })

  it('is "before" for an unrecognised value rather than disabling both prompts', () => {
    const tenant = { outlet_selection_timing: 'sometimes' } as OutletTimingTenantFields
    expect(resolveOutletSelectionTiming(tenant)).toBe('before')
  })

  it('is "after" only when explicitly set', () => {
    expect(resolveOutletSelectionTiming({ outlet_selection_timing: 'after' })).toBe('after')
  })

  it('reads "before" back when explicitly set', () => {
    expect(resolveOutletSelectionTiming({ outlet_selection_timing: 'before' })).toBe('before')
  })
})

describe('shouldGateMenuForOutlet', () => {
  it('gates the menu for a multi-branch tenant that has not chosen a timing', () => {
    // The shipped behaviour: no column value means the splash still shows.
    expect(shouldGateMenuForOutlet(enabled(), TWO_OUTLETS)).toBe(true)
  })

  it('does not gate the menu when the merchant chose checkout-time selection', () => {
    expect(shouldGateMenuForOutlet(enabled({ outlet_selection_timing: 'after' }), TWO_OUTLETS)).toBe(false)
  })

  it('does not gate the menu when multi-branch is off, whatever the timing', () => {
    const tenant = { multi_branch_enabled: false, outlet_selection_timing: 'before' }
    expect(shouldGateMenuForOutlet(tenant, TWO_OUTLETS)).toBe(false)
  })

  it('does not gate the menu when fewer than two branches are active', () => {
    expect(shouldGateMenuForOutlet(enabled(), [outlet('a'), outlet('b', false)])).toBe(false)
  })
})

describe('shouldPickOutletAtCheckout', () => {
  it('asks at checkout when the merchant chose checkout-time selection', () => {
    expect(shouldPickOutletAtCheckout(enabled({ outlet_selection_timing: 'after' }), TWO_OUTLETS)).toBe(true)
  })

  it('does not ask at checkout when the menu already gated (default timing)', () => {
    // Otherwise the customer answers the same question twice.
    expect(shouldPickOutletAtCheckout(enabled(), TWO_OUTLETS)).toBe(false)
  })

  it('does not ask at checkout when multi-branch is off', () => {
    const tenant = { multi_branch_enabled: false, outlet_selection_timing: 'after' }
    expect(shouldPickOutletAtCheckout(tenant, TWO_OUTLETS)).toBe(false)
  })

  it('does not ask at checkout when fewer than two branches are active', () => {
    // Matches the gate: a tenant switched on mid-setup keeps today's checkout.
    const tenant = enabled({ outlet_selection_timing: 'after' })
    expect(shouldPickOutletAtCheckout(tenant, [outlet('a')])).toBe(false)
  })

  it('never asks in both places at once', () => {
    for (const timing of ['before', 'after', null, 'nonsense'] as const) {
      const tenant = enabled({ outlet_selection_timing: timing })
      const both = shouldGateMenuForOutlet(tenant, TWO_OUTLETS) && shouldPickOutletAtCheckout(tenant, TWO_OUTLETS)
      expect(both).toBe(false)
    }
  })
})
