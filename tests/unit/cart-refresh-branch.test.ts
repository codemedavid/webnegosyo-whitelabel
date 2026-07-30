import { describe, it, expect, jest, beforeEach } from '@jest/globals'

/**
 * The cart's re-check must re-check against the RIGHT branch.
 *
 * `refreshCartItems` exists to pick up admin edits between adding an item and
 * paying for it, and it overwrites the stored line with what the database says.
 * Reading only `menu_items` there would quietly undo per-branch pricing at the
 * last moment before checkout: the customer added a dish at their branch's
 * price and the refresh would restore the store-wide one.
 */

const from = jest.fn()

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from }),
}))

/** A PostgREST-ish chain that resolves to `rows` however it is filtered. */
function chain(rows: unknown[]) {
  const result = Promise.resolve({ data: rows, error: null })
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'in']) {
    builder[method] = jest.fn(() => builder)
  }
  builder.then = result.then.bind(result)
  return builder
}

const MENU_ROW = {
  id: 'adobo',
  name: 'Adobo',
  price: 180,
  discounted_price: null,
  image_url: 'img',
  is_available: true,
}

const OVERRIDE_ROW = {
  id: 'omi-1',
  tenant_id: 't1',
  outlet_id: 'branch-a',
  menu_item_id: 'adobo',
  is_listed: true,
  is_available: true,
  price: 160,
  discounted_price: null,
  discount_cleared: false,
  created_at: '',
  updated_at: '',
}

describe('fetchFreshCartItemData', () => {
  beforeEach(() => {
    jest.resetModules()
    from.mockReset()
  })

  it('returns the store-wide price when no branch is given', async () => {
    from.mockImplementation(() => chain([MENU_ROW]))
    const { fetchFreshCartItemData } = await import('@/lib/cart-refresh')

    const fresh = await fetchFreshCartItemData(['adobo'], 't1')

    expect(fresh.get('adobo')?.price).toBe(180)
    // No branch, no second query — a single-location tenant is untouched.
    expect(from).toHaveBeenCalledTimes(1)
  })

  it("returns the branch's price when the cart belongs to a branch", async () => {
    from.mockImplementation((table: string) =>
      chain(table === 'outlet_menu_items' ? [OVERRIDE_ROW] : [MENU_ROW])
    )
    const { fetchFreshCartItemData } = await import('@/lib/cart-refresh')

    const fresh = await fetchFreshCartItemData(['adobo'], 't1', 'branch-a')

    expect(fresh.get('adobo')?.price).toBe(160)
  })

  it('drops a dish the branch stopped carrying', async () => {
    from.mockImplementation((table: string) =>
      chain(
        table === 'outlet_menu_items'
          ? [{ ...OVERRIDE_ROW, is_listed: false }]
          : [MENU_ROW]
      )
    )
    const { fetchFreshCartItemData } = await import('@/lib/cart-refresh')

    const fresh = await fetchFreshCartItemData(['adobo'], 't1', 'branch-a')

    // Reported as unavailable rather than missing: the caller removes
    // unavailable lines and tells the customer, while a missing id is left
    // alone as "we could not check".
    expect(fresh.get('adobo')?.is_available).toBe(false)
  })

  it("marks a dish the branch has 86'd unavailable", async () => {
    from.mockImplementation((table: string) =>
      chain(
        table === 'outlet_menu_items'
          ? [{ ...OVERRIDE_ROW, is_available: false }]
          : [MENU_ROW]
      )
    )
    const { fetchFreshCartItemData } = await import('@/lib/cart-refresh')

    const fresh = await fetchFreshCartItemData(['adobo'], 't1', 'branch-a')

    expect(fresh.get('adobo')?.is_available).toBe(false)
  })
})
