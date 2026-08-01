import { describe, it, expect } from '@jest/globals'
import { resolveCheckoutOutletSelection } from '@/lib/outlets/checkout-outlet'
import type { OutletLocation } from '@/lib/outlets/nearest-outlet'

/**
 * When the merchant asks for the branch AT checkout, the order type is chosen
 * first — so it, not a splash screen, decides which branches can take the
 * order. A delivery order must never be offered a dine-in-only branch.
 *
 * The other half of this module's job is holding a selection steady while the
 * customer changes their mind: switching the order type must drop a branch that
 * can no longer fulfill it rather than quietly submitting it.
 */

function makeOutlet(overrides: Partial<OutletLocation> & { id: string }): OutletLocation {
  return {
    slug: overrides.id,
    name: overrides.id,
    latitude: null,
    longitude: null,
    delivery_radius_km: null,
    supports_pickup: true,
    supports_delivery: true,
    supports_dine_in: false,
    is_active: true,
    sort_order: 0,
    ...overrides,
  }
}

const DINE_ONLY = makeOutlet({
  id: 'dine-only',
  supports_pickup: false,
  supports_delivery: false,
  supports_dine_in: true,
  sort_order: 1,
})
const DELIVERS = makeOutlet({ id: 'delivers', sort_order: 2 })
const CLOSED = makeOutlet({ id: 'closed', is_active: false, sort_order: 3 })

const idsOf = (result: { choices: readonly { outlet: OutletLocation }[] }) =>
  result.choices.map((entry) => entry.outlet.id)

describe('resolveCheckoutOutletSelection', () => {
  it('offers only branches that can fulfill the chosen order type', () => {
    // Arrange / Act
    const result = resolveCheckoutOutletSelection({
      outlets: [DINE_ONLY, DELIVERS],
      mode: 'delivery',
      selectedOutletId: null,
    })

    // Assert
    expect(idsOf(result)).toEqual(['delivers'])
  })

  it('offers the dine-in-only branch when the customer is dining in', () => {
    const result = resolveCheckoutOutletSelection({
      outlets: [DINE_ONLY, DELIVERS],
      mode: 'dine_in',
      selectedOutletId: null,
    })

    expect(idsOf(result)).toEqual(['dine-only'])
  })

  it('offers every active branch before an order type is chosen', () => {
    // Nothing to narrow by yet — the customer still sees what exists.
    const result = resolveCheckoutOutletSelection({
      outlets: [DELIVERS, DINE_ONLY],
      mode: null,
      selectedOutletId: null,
    })

    expect(idsOf(result)).toEqual(['dine-only', 'delivers'])
  })

  it('never offers a deactivated branch', () => {
    const result = resolveCheckoutOutletSelection({
      outlets: [CLOSED, DELIVERS],
      mode: null,
      selectedOutletId: null,
    })

    expect(idsOf(result)).toEqual(['delivers'])
  })

  it('auto-selects when the order type leaves exactly one branch', () => {
    // One choice is not a choice; making the customer tap it adds nothing.
    const result = resolveCheckoutOutletSelection({
      outlets: [DINE_ONLY, DELIVERS],
      mode: 'delivery',
      selectedOutletId: null,
    })

    expect(result.selectedOutletId).toBe('delivers')
  })

  it('leaves the choice open when several branches qualify', () => {
    const second = makeOutlet({ id: 'delivers-2', sort_order: 4 })

    const result = resolveCheckoutOutletSelection({
      outlets: [DELIVERS, second],
      mode: 'delivery',
      selectedOutletId: null,
    })

    expect(result.selectedOutletId).toBeNull()
  })

  it('keeps a selection that still qualifies after the order type changes', () => {
    const second = makeOutlet({ id: 'delivers-2', sort_order: 4 })

    const result = resolveCheckoutOutletSelection({
      outlets: [DELIVERS, second],
      mode: 'delivery',
      selectedOutletId: 'delivers-2',
    })

    expect(result.selectedOutletId).toBe('delivers-2')
  })

  it('drops a selection the new order type can no longer be fulfilled by', () => {
    // The regression this guards: switching dine-in → delivery must not submit
    // a delivery order against a branch with no delivery.
    const result = resolveCheckoutOutletSelection({
      outlets: [DINE_ONLY, DELIVERS],
      mode: 'delivery',
      selectedOutletId: 'dine-only',
    })

    expect(result.selectedOutletId).toBe('delivers')
  })

  it('drops a selection for a branch the merchant deactivated mid-session', () => {
    const second = makeOutlet({ id: 'delivers-2', sort_order: 4 })

    const result = resolveCheckoutOutletSelection({
      outlets: [CLOSED, DELIVERS, second],
      mode: null,
      selectedOutletId: 'closed',
    })

    expect(result.selectedOutletId).toBeNull()
  })

  it('returns no choices and no selection when the order type fits no branch', () => {
    const result = resolveCheckoutOutletSelection({
      outlets: [DELIVERS],
      mode: 'dine_in',
      selectedOutletId: 'delivers',
    })

    expect(result.choices).toEqual([])
    expect(result.selectedOutletId).toBeNull()
  })

  it('does not mutate the outlets it was given', () => {
    const outlets = [DELIVERS, DINE_ONLY]
    const snapshot = [...outlets]

    resolveCheckoutOutletSelection({ outlets, mode: null, selectedOutletId: null })

    expect(outlets).toEqual(snapshot)
  })
})
