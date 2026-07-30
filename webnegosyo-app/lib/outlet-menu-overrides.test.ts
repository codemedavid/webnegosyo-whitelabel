import {
  buildOutletMenuIndex,
  findOutletMenuOverride,
  resolveItemForOutlet,
  resolveMenuForOutlet,
  summarizeItemAcrossBranches,
  type OutletMenuOverrideRow,
} from './outlet-menu-overrides'

/**
 * Per-branch menus and prices, decided in one pure place.
 *
 * The table is override-only: a row exists because a branch DIFFERS. The single
 * most important property below is that no row, an unknown branch, or no branch
 * at all leaves the store-wide menu exactly as it is — that is the behaviour
 * every tenant has today, and a regression there is not a wrong price at one
 * shop, it is a wrong price at every shop.
 */

const item = (over: Partial<ItemShape> = {}): ItemShape => ({
  id: 'item-1',
  name: 'Adobo',
  price: 180,
  discounted_price: null,
  is_available: true,
  ...over,
})

interface ItemShape {
  id: string
  name: string
  price: number
  discounted_price: number | null
  is_available: boolean
}

const override = (over: Partial<OutletMenuOverrideRow> = {}): OutletMenuOverrideRow => ({
  outlet_id: 'branch-a',
  menu_item_id: 'item-1',
  is_listed: true,
  is_available: true,
  price: null,
  discounted_price: null,
  discount_cleared: false,
  ...over,
})

describe('resolveItemForOutlet — inheriting the store-wide menu', () => {
  it('leaves an item untouched when the branch has no opinion', () => {
    const resolved = resolveItemForOutlet(item(), null)

    expect(resolved.price).toBe(180)
    expect(resolved.discounted_price).toBeNull()
    expect(resolved.is_available).toBe(true)
  })

  it('does not mutate the item it was given', () => {
    const original = item()

    resolveItemForOutlet(original, override({ price: 200 }))

    expect(original.price).toBe(180)
  })

  it('keeps every field the override says nothing about', () => {
    const resolved = resolveItemForOutlet(item({ name: 'Sinigang' }), override({ price: 210 }))

    expect(resolved.name).toBe('Sinigang')
  })
})

describe('resolveItemForOutlet — price', () => {
  it('applies a branch price', () => {
    expect(resolveItemForOutlet(item(), override({ price: 210 })).price).toBe(210)
  })

  it('treats a zero branch price as a real price, not an unset one', () => {
    // Free at this branch is a decision a merchant can make; reading 0 as
    // "inherit" would silently charge for a giveaway.
    expect(resolveItemForOutlet(item(), override({ price: 0 })).price).toBe(0)
  })

  it('applies a branch discount', () => {
    const resolved = resolveItemForOutlet(item({ discounted_price: 150 }), override({ discounted_price: 120 }))

    expect(resolved.discounted_price).toBe(120)
  })

  it('inherits the store-wide discount when the branch is silent', () => {
    const resolved = resolveItemForOutlet(item({ discounted_price: 150 }), override({ price: 200 }))

    expect(resolved.price).toBe(200)
    expect(resolved.discounted_price).toBe(150)
  })

  it('lets a branch opt out of a store-wide sale', () => {
    // The reason `discount_cleared` exists: a NULL discounted_price already
    // means "inherit", so without it a branch could never decline a promotion.
    const resolved = resolveItemForOutlet(item({ discounted_price: 150 }), override({ discount_cleared: true }))

    expect(resolved.discounted_price).toBeNull()
    expect(resolved.price).toBe(180)
  })
})

describe('resolveItemForOutlet — availability', () => {
  it("marks an item unavailable when the branch has 86'd it", () => {
    expect(resolveItemForOutlet(item(), override({ is_available: false })).is_available).toBe(false)
  })

  it('keeps a store-wide out-of-stock item unavailable at every branch', () => {
    // Store-wide off is the stronger statement: a branch cannot un-86 a dish
    // the merchant took off the whole menu.
    const resolved = resolveItemForOutlet(item({ is_available: false }), override({ is_available: true }))

    expect(resolved.is_available).toBe(false)
  })
})

describe('resolveMenuForOutlet — which dishes a branch carries', () => {
  const menu = [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })]

  it('returns the whole store-wide menu when no branch is selected', () => {
    const index = buildOutletMenuIndex([
      override({ outlet_id: 'branch-a', menu_item_id: 'b', is_listed: false }),
    ])

    const resolved = resolveMenuForOutlet(menu, index, null)

    expect(resolved.map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })

  it('drops a dish the branch does not carry', () => {
    const index = buildOutletMenuIndex([
      override({ outlet_id: 'branch-a', menu_item_id: 'b', is_listed: false }),
    ])

    const resolved = resolveMenuForOutlet(menu, index, 'branch-a')

    expect(resolved.map((i) => i.id)).toEqual(['a', 'c'])
  })

  it('keeps a dish another branch dropped', () => {
    const index = buildOutletMenuIndex([
      override({ outlet_id: 'branch-a', menu_item_id: 'b', is_listed: false }),
    ])

    const resolved = resolveMenuForOutlet(menu, index, 'branch-b')

    expect(resolved.map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })

  it('prices each surviving dish for the branch', () => {
    const index = buildOutletMenuIndex([
      override({ outlet_id: 'branch-a', menu_item_id: 'a', price: 250 }),
    ])

    const resolved = resolveMenuForOutlet(menu, index, 'branch-a')

    expect(resolved.find((i) => i.id === 'a')?.price).toBe(250)
    expect(resolved.find((i) => i.id === 'b')?.price).toBe(180)
  })

  it('leaves the menu alone for a branch with no overrides at all', () => {
    const resolved = resolveMenuForOutlet(menu, buildOutletMenuIndex([]), 'branch-z')

    expect(resolved.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(resolved.every((i) => i.price === 180)).toBe(true)
  })
})

describe('buildOutletMenuIndex', () => {
  it('finds an override by branch and item', () => {
    const index = buildOutletMenuIndex([
      override({ outlet_id: 'branch-a', menu_item_id: 'item-1', price: 210 }),
      override({ outlet_id: 'branch-b', menu_item_id: 'item-1', price: 195 }),
    ])

    expect(findOutletMenuOverride(index, 'branch-a', 'item-1')?.price).toBe(210)
    expect(findOutletMenuOverride(index, 'branch-b', 'item-1')?.price).toBe(195)
  })

  it('returns null for a branch or item with no row', () => {
    const index = buildOutletMenuIndex([override({ outlet_id: 'branch-a', menu_item_id: 'item-1' })])

    expect(findOutletMenuOverride(index, 'branch-z', 'item-1')).toBeNull()
    expect(findOutletMenuOverride(index, 'branch-a', 'item-9')).toBeNull()
    expect(findOutletMenuOverride(index, null, 'item-1')).toBeNull()
  })

  it('survives a null or undefined row list', () => {
    // The storefront carries a failed override query as an empty result rather
    // than blanking the menu; that must not throw here.
    expect(findOutletMenuOverride(buildOutletMenuIndex(null), 'branch-a', 'item-1')).toBeNull()
    expect(findOutletMenuOverride(buildOutletMenuIndex(undefined), 'branch-a', 'item-1')).toBeNull()
  })
})

describe('summarizeItemAcrossBranches — what the owner sees', () => {
  const branches = [
    { id: 'branch-a', name: 'Makati' },
    { id: 'branch-b', name: 'Cebu' },
    { id: 'branch-c', name: 'Davao' },
  ]

  it('reports an untouched item as carried everywhere at one price', () => {
    const summary = summarizeItemAcrossBranches(item(), branches, buildOutletMenuIndex([]))

    expect(summary.listedCount).toBe(3)
    expect(summary.branchCount).toBe(3)
    expect(summary.isEverywhere).toBe(true)
    expect(summary.hasPriceOverrides).toBe(false)
    expect(summary.priceRange).toEqual({ min: 180, max: 180 })
  })

  it('counts the branches that carry it', () => {
    const index = buildOutletMenuIndex([
      override({ outlet_id: 'branch-b', menu_item_id: 'item-1', is_listed: false }),
    ])

    const summary = summarizeItemAcrossBranches(item(), branches, index)

    expect(summary.listedCount).toBe(2)
    expect(summary.isEverywhere).toBe(false)
    expect(summary.unlistedBranchNames).toEqual(['Cebu'])
  })

  it('reports the spread when branches price differently', () => {
    const index = buildOutletMenuIndex([
      override({ outlet_id: 'branch-a', menu_item_id: 'item-1', price: 210 }),
      override({ outlet_id: 'branch-c', menu_item_id: 'item-1', price: 160 }),
    ])

    const summary = summarizeItemAcrossBranches(item(), branches, index)

    expect(summary.hasPriceOverrides).toBe(true)
    // branch-b still inherits 180, so the store-wide price is part of the range.
    expect(summary.priceRange).toEqual({ min: 160, max: 210 })
  })

  it('ignores the price of a branch that does not carry the item', () => {
    const index = buildOutletMenuIndex([
      override({ outlet_id: 'branch-a', menu_item_id: 'item-1', is_listed: false, price: 999 }),
    ])

    const summary = summarizeItemAcrossBranches(item(), branches, index)

    expect(summary.priceRange).toEqual({ min: 180, max: 180 })
  })

  it("flags branches that have 86'd the item", () => {
    const index = buildOutletMenuIndex([
      override({ outlet_id: 'branch-c', menu_item_id: 'item-1', is_available: false }),
    ])

    const summary = summarizeItemAcrossBranches(item(), branches, index)

    expect(summary.unavailableBranchNames).toEqual(['Davao'])
    expect(summary.listedCount).toBe(3)
  })

  it('reports an item no branch carries', () => {
    const index = buildOutletMenuIndex(
      branches.map((b) => override({ outlet_id: b.id, menu_item_id: 'item-1', is_listed: false }))
    )

    const summary = summarizeItemAcrossBranches(item(), branches, index)

    expect(summary.listedCount).toBe(0)
    expect(summary.isEverywhere).toBe(false)
    expect(summary.priceRange).toBeNull()
  })

  it('says nothing about branches for a tenant that has none', () => {
    const summary = summarizeItemAcrossBranches(item(), [], buildOutletMenuIndex([]))

    expect(summary.branchCount).toBe(0)
    expect(summary.listedCount).toBe(0)
    expect(summary.priceRange).toBeNull()
  })
})
