import { describe, it, expect } from '@jest/globals'
import { describeBranchSummary, type BranchMenuSummary } from '@/lib/outlets/outlet-menu-overrides'

/**
 * The one line the owner reads on a menu card.
 *
 * The owner's question scanning the menu list is never "what are the override
 * rows" — it is "is this dish the same everywhere, and if not, where is it
 * different". So the label leads with the exception and stays silent when there
 * is none: a badge on every card would make the interesting ones invisible.
 */

const summary = (over: Partial<BranchMenuSummary> = {}): BranchMenuSummary => ({
  branchCount: 3,
  listedCount: 3,
  isEverywhere: true,
  hasPriceOverrides: false,
  priceRange: { min: 180, max: 180 },
  unlistedBranchNames: [],
  unavailableBranchNames: [],
  ...over,
})

describe('describeBranchSummary', () => {
  it('says nothing about a dish that is the same everywhere', () => {
    expect(describeBranchSummary(summary())).toBeNull()
  })

  it('says nothing for a store with no branches', () => {
    expect(
      describeBranchSummary(summary({ branchCount: 0, listedCount: 0, priceRange: null }))
    ).toBeNull()
  })

  it('reports how many branches carry a dish that is not everywhere', () => {
    const label = describeBranchSummary(
      summary({ listedCount: 2, isEverywhere: false, unlistedBranchNames: ['Cebu'] })
    )

    expect(label?.text).toBe('2 of 3 branches')
    expect(label?.detail).toContain('Cebu')
  })

  it('reports a price that varies', () => {
    const label = describeBranchSummary(
      summary({ hasPriceOverrides: true, priceRange: { min: 160, max: 210 } })
    )

    expect(label?.text).toBe('Prices vary')
  })

  it('leads with the missing branches when both are true', () => {
    // Not carried at all is the bigger fact; a price spread is a detail of the
    // branches that do carry it.
    const label = describeBranchSummary(
      summary({
        listedCount: 1,
        isEverywhere: false,
        unlistedBranchNames: ['Cebu', 'Davao'],
        hasPriceOverrides: true,
        priceRange: { min: 160, max: 210 },
      })
    )

    expect(label?.text).toBe('1 of 3 branches')
    expect(label?.detail).toContain('Cebu')
    expect(label?.detail).toContain('Davao')
  })

  it('calls out a dish no branch carries', () => {
    const label = describeBranchSummary(
      summary({
        listedCount: 0,
        isEverywhere: false,
        priceRange: null,
        unlistedBranchNames: ['Makati', 'Cebu', 'Davao'],
      })
    )

    expect(label?.text).toBe('No branches')
    expect(label?.tone).toBe('warning')
  })

  it("mentions branches that have 86'd it", () => {
    const label = describeBranchSummary(summary({ unavailableBranchNames: ['Davao'] }))

    expect(label?.text).toBe('Out of stock at 1')
    expect(label?.detail).toContain('Davao')
  })
})
