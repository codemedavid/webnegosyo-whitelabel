import { describe, it, expect } from '@jest/globals'
import {
  getOrderOutletId,
  getOrderOutletLabel,
  listOrderOutlets,
  matchesOutletFilter,
  OUTLET_FILTER_ALL,
  type OutletOrderLike,
} from '@/lib/outlets/order-outlet-display'

/**
 * Reading a branch back off an order.
 *
 * Phase 5 wrote the branch down in two places and nothing ever read it: the
 * platform database gets a real `orders.outlet_id` column, while Convex and
 * tenant-owned Supabase projects carry it inside `customer_data` because their
 * schemas cannot be migrated on demand. Every merchant surface has to read
 * both, or the feature works on one backend and silently vanishes on the other.
 *
 * The name is a snapshot taken when the order was placed, in the same spirit as
 * `payment_method_name` — renaming a branch next year must not rewrite last
 * year's tickets.
 *
 * Nothing here may throw. `customer_data` is untyped JSON coming back from three
 * different databases; a malformed value must degrade to "no branch", never
 * take down a merchant's order list.
 */

const PLATFORM_ORDER: OutletOrderLike = {
  outlet_id: 'outlet-bgc',
  customer_data: { outlet_id: 'outlet-bgc', outlet_name: 'Lucky Joy — BGC' },
}

const CONVEX_ORDER: OutletOrderLike = {
  customer_data: { outlet_id: 'outlet-makati', outlet_name: 'Lucky Joy — Makati' },
}

const SINGLE_LOCATION_ORDER: OutletOrderLike = {
  customer_data: { customer_phone: '09171234567' },
}

describe('getOrderOutletId', () => {
  it('reads the column on the platform backend', () => {
    expect(getOrderOutletId(PLATFORM_ORDER)).toBe('outlet-bgc')
  })

  it('falls back to customer_data on backends with no column', () => {
    expect(getOrderOutletId(CONVEX_ORDER)).toBe('outlet-makati')
  })

  it('returns nothing for a single-location order', () => {
    expect(getOrderOutletId(SINGLE_LOCATION_ORDER)).toBeNull()
  })

  it('returns nothing for an order with no customer_data at all', () => {
    expect(getOrderOutletId({})).toBeNull()
  })

  it('survives a null order', () => {
    expect(getOrderOutletId(null)).toBeNull()
  })

  it('survives an undefined order', () => {
    expect(getOrderOutletId(undefined)).toBeNull()
  })

  it('ignores customer_data that is not an object', () => {
    expect(getOrderOutletId({ customer_data: 'not-json' as unknown as Record<string, unknown> })).toBeNull()
  })

  it('ignores customer_data that is an array', () => {
    expect(getOrderOutletId({ customer_data: [] as unknown as Record<string, unknown> })).toBeNull()
  })

  it('ignores a non-string id inside customer_data', () => {
    expect(getOrderOutletId({ customer_data: { outlet_id: 42 } })).toBeNull()
  })

  it('ignores a blank id', () => {
    expect(getOrderOutletId({ customer_data: { outlet_id: '   ' } })).toBeNull()
  })

  it('prefers the column when the two disagree', () => {
    // The column is written by the server; customer_data is the portable copy.
    const order: OutletOrderLike = {
      outlet_id: 'outlet-column',
      customer_data: { outlet_id: 'outlet-snapshot' },
    }
    expect(getOrderOutletId(order)).toBe('outlet-column')
  })

  it('trims a padded id so it matches the filter', () => {
    expect(getOrderOutletId({ customer_data: { outlet_id: ' outlet-bgc ' } })).toBe('outlet-bgc')
  })
})

describe('getOrderOutletLabel', () => {
  it('shows the branch name captured when the order was placed', () => {
    expect(getOrderOutletLabel(PLATFORM_ORDER)).toBe('Lucky Joy — BGC')
  })

  it('shows the name on a backend with no column', () => {
    expect(getOrderOutletLabel(CONVEX_ORDER)).toBe('Lucky Joy — Makati')
  })

  it('keeps the name the order was placed under after the branch is renamed', () => {
    // The snapshot is the whole point: no live lookup, so a rename cannot
    // rewrite history.
    expect(getOrderOutletLabel(CONVEX_ORDER)).toBe('Lucky Joy — Makati')
  })

  it('shows nothing for a single-location order', () => {
    expect(getOrderOutletLabel(SINGLE_LOCATION_ORDER)).toBeNull()
  })

  it('shows nothing when only an id was recorded', () => {
    expect(getOrderOutletLabel({ outlet_id: 'outlet-bgc' })).toBeNull()
  })

  it('shows nothing for a blank name', () => {
    expect(getOrderOutletLabel({ customer_data: { outlet_name: '   ' } })).toBeNull()
  })

  it('ignores a non-string name', () => {
    expect(getOrderOutletLabel({ customer_data: { outlet_name: { first: 'BGC' } } })).toBeNull()
  })

  it('trims surrounding whitespace from the name', () => {
    expect(getOrderOutletLabel({ customer_data: { outlet_name: '  BGC  ' } })).toBe('BGC')
  })

  it('survives a null order', () => {
    expect(getOrderOutletLabel(null)).toBeNull()
  })
})

describe('listOrderOutlets', () => {
  it('offers nothing to filter for a single-location merchant', () => {
    // Drives the UI: an empty list means the branch dropdown never renders, so
    // a merchant without branches sees exactly today's order list.
    expect(listOrderOutlets([SINGLE_LOCATION_ORDER, {}, { customer_data: null }])).toEqual([])
  })

  it('lists each branch that appears in the orders', () => {
    expect(listOrderOutlets([PLATFORM_ORDER, CONVEX_ORDER])).toEqual([
      { id: 'outlet-bgc', name: 'Lucky Joy — BGC' },
      { id: 'outlet-makati', name: 'Lucky Joy — Makati' },
    ])
  })

  it('lists a branch once however many orders it took', () => {
    const result = listOrderOutlets([PLATFORM_ORDER, PLATFORM_ORDER, PLATFORM_ORDER])
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('outlet-bgc')
  })

  it('sorts branches by name so the dropdown does not reshuffle', () => {
    const zulu: OutletOrderLike = { customer_data: { outlet_id: 'z', outlet_name: 'Zulu' } }
    const alpha: OutletOrderLike = { customer_data: { outlet_id: 'a', outlet_name: 'Alpha' } }
    expect(listOrderOutlets([zulu, alpha]).map((o) => o.name)).toEqual(['Alpha', 'Zulu'])
  })

  it('keeps the most recent name when a branch was renamed mid-history', () => {
    // Orders arrive newest-first, so the first snapshot seen is the newest one.
    const renamed: OutletOrderLike = { customer_data: { outlet_id: 'outlet-bgc', outlet_name: 'BGC High Street' } }
    const older: OutletOrderLike = { customer_data: { outlet_id: 'outlet-bgc', outlet_name: 'BGC' } }
    expect(listOrderOutlets([renamed, older])).toEqual([{ id: 'outlet-bgc', name: 'BGC High Street' }])
  })

  it('skips a branch whose name was never recorded', () => {
    // A filter option with no label is unusable; the order still shows in the
    // unfiltered list.
    expect(listOrderOutlets([{ outlet_id: 'outlet-nameless' }])).toEqual([])
  })

  it('survives an empty order list', () => {
    expect(listOrderOutlets([])).toEqual([])
  })
})

describe('matchesOutletFilter', () => {
  it('shows every order when no branch is selected', () => {
    expect(matchesOutletFilter(PLATFORM_ORDER, OUTLET_FILTER_ALL)).toBe(true)
    expect(matchesOutletFilter(SINGLE_LOCATION_ORDER, OUTLET_FILTER_ALL)).toBe(true)
  })

  it('shows an order belonging to the selected branch', () => {
    expect(matchesOutletFilter(PLATFORM_ORDER, 'outlet-bgc')).toBe(true)
  })

  it('hides an order belonging to another branch', () => {
    expect(matchesOutletFilter(CONVEX_ORDER, 'outlet-bgc')).toBe(false)
  })

  it('hides an unattributed order when a branch is selected', () => {
    expect(matchesOutletFilter(SINGLE_LOCATION_ORDER, 'outlet-bgc')).toBe(false)
  })

  it('matches an order recorded only in customer_data', () => {
    expect(matchesOutletFilter(CONVEX_ORDER, 'outlet-makati')).toBe(true)
  })

  it('matches a nameless order by its id', () => {
    expect(matchesOutletFilter({ outlet_id: 'outlet-nameless' }, 'outlet-nameless')).toBe(true)
  })
})
