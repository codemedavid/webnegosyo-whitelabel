/**
 * An option whose recipe the shelf cannot cover reads as sold out on the
 * storefront — the same answer checkout would give — instead of being offered
 * and then refused on the last screen.
 */

import {
  configurationCeiling,
  parseOptionCeilings,
  soldOutOptionIds,
  withRecipeStockAvailability,
} from '@/lib/inventory/option-availability'
import { pruneUnavailableSelection } from '@/lib/modifier-groups-cart'
import { isOptionAvailable } from '@/lib/modifier-groups'
import type { ModifierGroup } from '@/types/database'

const extras: ModifierGroup = {
  id: 'extras', name: 'Extras', min_select: 0, max_select: null, display_order: 0,
  options: [
    { id: 'pearls', name: 'Pearls', price_modifier: 15, display_order: 0, is_default: true },
    { id: 'jelly', name: 'Jelly', price_modifier: 15, display_order: 1, stock_mode: 'simple', stock_qty: 4 },
  ],
}
const size: ModifierGroup = {
  id: 'size', name: 'Size', min_select: 1, max_select: 1, display_order: 1,
  options: [
    { id: 'large', name: 'Large', price_modifier: 20, display_order: 0, is_default: true },
    { id: 'regular', name: 'Regular', price_modifier: 0, display_order: 1 },
  ],
}

describe('soldOutOptionIds', () => {
  it('names the options whose ceiling is zero', () => {
    expect(soldOutOptionIds(new Map([['pearls', 0], ['large', 3]]))).toEqual(new Set(['pearls']))
  })

  it('is empty without an opinion', () => {
    expect(soldOutOptionIds(undefined).size).toBe(0)
  })
})

describe('withRecipeStockAvailability', () => {
  it('marks a sold-out recipe option unavailable without touching the input', () => {
    const groups = withRecipeStockAvailability([extras, size], new Set(['pearls']))

    expect(isOptionAvailable(groups[0].options[0])).toBe(false)
    expect(isOptionAvailable(extras.options[0])).toBe(true)
  })

  it('never overrides an option counted with simple stock', () => {
    const groups = withRecipeStockAvailability([extras], new Set(['jelly']))

    expect(isOptionAvailable(groups[0].options[1])).toBe(true)
  })

  it('returns the very same groups when nothing is sold out', () => {
    const input = [extras, size]

    expect(withRecipeStockAvailability(input, new Set())).toBe(input)
  })
})

describe('pruneUnavailableSelection', () => {
  it('drops a default pick that turned out to be sold out', () => {
    const groups = withRecipeStockAvailability([extras, size], new Set(['pearls']))

    expect(pruneUnavailableSelection(groups, { extras: ['pearls'], size: ['large'] }))
      .toEqual({ extras: [], size: ['large'] })
  })

  it('moves a required single choice to the first option still available', () => {
    const groups = withRecipeStockAvailability([size], new Set(['large']))

    expect(pruneUnavailableSelection(groups, { size: ['large'] })).toEqual({ size: ['regular'] })
  })

  it('returns the same selection object when nothing changed', () => {
    const selection = { extras: ['pearls'], size: ['large'] }

    expect(pruneUnavailableSelection([extras, size], selection)).toBe(selection)
  })
})

describe('configurationCeiling', () => {
  const options = new Map([['pearls', 2], ['large', 6]])

  it('is the tightest of the dish ceiling and every picked option ceiling', () => {
    expect(configurationCeiling(10, options, ['large', 'pearls'])).toBe(2)
  })

  it('is the option ceiling when the dish itself is untracked', () => {
    expect(configurationCeiling(null, options, ['large'])).toBe(6)
  })

  it('stays untracked when neither the dish nor the picks have a ceiling', () => {
    expect(configurationCeiling(null, options, ['regular'])).toBeNull()
    expect(configurationCeiling(null, undefined, ['large'])).toBeNull()
  })
})

describe('parseOptionCeilings', () => {
  it('reads the route payload into maps', () => {
    expect(parseOptionCeilings({ 'm-tea': { pearls: 0, large: 4 } }))
      .toEqual(new Map([['m-tea', new Map([['pearls', 0], ['large', 4]])]]))
  })

  it('drops anything malformed instead of reading it as sold out', () => {
    expect(parseOptionCeilings({ 'm-tea': { pearls: '0', large: null }, bad: 3 }))
      .toEqual(new Map([['m-tea', new Map()]]))
    expect(parseOptionCeilings(null).size).toBe(0)
    expect(parseOptionCeilings([1]).size).toBe(0)
  })
})
