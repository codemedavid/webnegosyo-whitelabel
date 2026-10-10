import { buildBoostIdeas, type IdeaItem } from '@/lib/boost/ideas'
import { buildBasketStats } from '@/lib/boost/basket-stats'

function item(id: string, name: string, price: number, categoryName: string, extra: Partial<IdeaItem> = {}): IdeaItem {
  return {
    id,
    name,
    price,
    categoryId: `cat-${categoryName.toLowerCase()}`,
    categoryName,
    imageUrl: null,
    isAvailable: true,
    ...extra,
  }
}

// `order` is the merchant's display order, as real menu items carry it.
const MENU: IdeaItem[] = [
  item('burger', 'Burger', 99, 'Burgers'),
  item('cheese', 'Cheeseburger', 149, 'Burgers'),
  item('burger-meal', 'Burger Meal', 149, 'Burgers'),
  item('fries', 'Fries', 45, 'Sides'),
  item('rice', 'Extra Rice', 20, 'Sides'),
  item('coke', 'Coke', 30, 'Drinks'),
  item('tea', 'Iced Tea', 39, 'Drinks'),
  item('tea-l', 'Iced Tea Large', 49, 'Drinks'),
  item('sundae', 'Sundae', 35, 'Desserts'),
].map((it, index) => ({ ...it, order: index }))

const kinds = (ideas: { kind: string }[]) => ideas.map((i) => i.kind)

describe('buildBoostIdeas — combos', () => {
  it('builds a main + side + drink meal from menu roles alone', () => {
    const ideas = buildBoostIdeas({ items: MENU, limit: 20 })
    const combo = ideas.find((i) => i.kind === 'combo' && i.picks[0].itemIds[0] === 'burger')
    expect(combo).toBeDefined()
    if (combo?.kind !== 'combo') throw new Error('expected combo')
    expect(combo.name).toBe('Burger Meal')
    // Without order history, the merchant's own menu order decides: the first
    // side and the first drink they list are their signature ones.
    expect(combo.picks.map((p) => p.itemIds[0])).toEqual(['burger', 'fries', 'coke'])
    expect(combo.regularPrice).toBe(99 + 45 + 30)
    expect(combo.price).toBeLessThan(combo.regularPrice)
    expect(combo.price % 10).toBe(9)
  })

  it('uses what customers actually order together when history exists', () => {
    const stats = buildBasketStats([
      ['burger', 'fries', 'tea'],
      ['burger', 'fries', 'tea'],
      ['burger', 'rice'],
      ['burger', 'rice', 'tea'],
    ])
    const ideas = buildBoostIdeas({ items: MENU, stats, limit: 20 })
    const combo = ideas.find((i) => i.kind === 'combo')
    if (combo?.kind !== 'combo') throw new Error('expected combo')
    expect(combo.picks.map((p) => p.itemIds[0])).toEqual(['burger', 'fries', 'tea'])
    expect(combo.reason).toMatch(/ordered together/i)
  })

  it('does not suggest a combo for a main that is already in one', () => {
    const ideas = buildBoostIdeas({
      items: MENU,
      existing: { comboItemIds: new Set(['burger', 'cheese', 'burger-meal']) },
      limit: 20,
    })
    expect(kinds(ideas)).not.toContain('combo')
  })

  it('suggests no combo on a menu with nothing to anchor one (no mains, no drinks)', () => {
    const ideas = buildBoostIdeas({ items: MENU.filter((i) => i.categoryName === 'Sides'), limit: 20 })
    expect(kinds(ideas)).not.toContain('combo')
  })
})

describe('buildBoostIdeas — upgrades', () => {
  it('pairs an item with its bigger or meal version', () => {
    const ideas = buildBoostIdeas({ items: MENU, limit: 20 })
    const upgrades = ideas.filter((i) => i.kind === 'upgrade')
    const meal = upgrades.find((u) => u.kind === 'upgrade' && u.sourceId === 'burger')
    const size = upgrades.find((u) => u.kind === 'upgrade' && u.sourceId === 'tea')
    expect(meal).toMatchObject({ targetId: 'burger-meal', header: 'Make it a meal?' })
    expect(size).toMatchObject({ targetId: 'tea-l', header: 'Go bigger?' })
  })

  it('never upgrades to something cheaper or unavailable', () => {
    const ideas = buildBoostIdeas({
      items: MENU.map((i) => (i.id === 'burger-meal' ? { ...i, isAvailable: false } : i)),
      limit: 20,
    })
    expect(ideas.some((i) => i.kind === 'upgrade' && i.sourceId === 'burger')).toBe(false)
  })

  it('skips items that already have an upgrade', () => {
    const ideas = buildBoostIdeas({ items: MENU, existing: { upgradeSourceIds: new Set(['burger', 'tea']) }, limit: 20 })
    expect(ideas.some((i) => i.kind === 'upgrade')).toBe(false)
  })
})

describe('buildBoostIdeas — pairings and last call', () => {
  it('suggests sides and drinks after every main in a category', () => {
    const ideas = buildBoostIdeas({ items: MENU, limit: 20 })
    const pairing = ideas.find((i) => i.kind === 'pairing')
    if (pairing?.kind !== 'pairing') throw new Error('expected pairing')
    expect(pairing.categoryName).toBe('Burgers')
    expect(pairing.sourceIds.sort()).toEqual(['burger', 'burger-meal', 'cheese'])
    expect(pairing.targetIds.length).toBeGreaterThan(0)
    expect(pairing.targetIds.length).toBeLessThanOrEqual(3)
    expect(pairing.targetIds.every((id) => !pairing.sourceIds.includes(id))).toBe(true)
  })

  it('offers the cart last call only while it is off', () => {
    expect(kinds(buildBoostIdeas({ items: MENU, limit: 20 }))).toContain('last_call')
    expect(
      kinds(buildBoostIdeas({ items: MENU, existing: { lastCallEnabled: true }, limit: 20 }))
    ).not.toContain('last_call')
  })
})

describe('buildBoostIdeas — housekeeping', () => {
  it('produces the same ids for the same menu', () => {
    const a = buildBoostIdeas({ items: MENU, limit: 20 }).map((i) => i.id)
    const b = buildBoostIdeas({ items: [...MENU].reverse(), limit: 20 }).map((i) => i.id)
    expect(b.sort()).toEqual(a.sort())
  })

  it('hides dismissed ideas and respects the limit', () => {
    const all = buildBoostIdeas({ items: MENU, limit: 20 })
    const dismissed = new Set([all[0].id])
    const rest = buildBoostIdeas({ items: MENU, dismissedIds: dismissed, limit: 20 })
    expect(rest.map((i) => i.id)).not.toContain(all[0].id)
    expect(buildBoostIdeas({ items: MENU, limit: 2 })).toHaveLength(2)
  })

  it('returns nothing for an empty menu', () => {
    expect(buildBoostIdeas({ items: [], limit: 6 })).toEqual([])
  })
})

describe('buildBoostIdeas — cafés and drink-led menus', () => {
  const CAFE: IdeaItem[] = [
    item('latte', 'Café Latte', 120, 'Coffee Series'),
    item('mocha', 'Café Mocha', 150, 'Coffee Series'),
    item('java', 'Java Chip', 160, 'Frappe Series'),
    item('jelly', 'Coffee Jelly', 160, 'Frappe Series'),
    item('caramel', 'Salted Caramel', 160, 'Frappe Series'),
    item('nutella', 'Nutella Cream', 170, 'Frappe Series'),
  ].map((it, index) => ({ ...it, categoryName: it.categoryName === 'Coffee Series' ? 'Coffee' : 'Frappes', order: index }))

  it('offers an "any 2" combo from same-priced drinks when there is no food', () => {
    const combo = buildBoostIdeas({ items: CAFE, limit: 20 }).find((i) => i.kind === 'combo')
    if (combo?.kind !== 'combo') throw new Error('expected an any-2 combo')
    expect(combo.picks).toHaveLength(1)
    expect(combo.picks[0].itemIds.sort()).toEqual(['caramel', 'java', 'jelly'])
    expect(combo.regularPrice).toBe(320)
    expect(combo.price).toBeLessThan(320)
    expect(combo.name).toBe('Any 2 Frappes')
  })

  it('pairs drinks with pastries when the café sells food', () => {
    const withPastry = [...CAFE, { ...item('croissant', 'Croissant', 90, 'Pastries'), order: 50 }]
    const ideas = buildBoostIdeas({ items: withPastry, limit: 20 })
    const pairing = ideas.find((i) => i.kind === 'pairing')
    if (pairing?.kind !== 'pairing') throw new Error('expected pairing')
    expect(pairing.targetIds).toEqual(['croissant'])
    const combo = ideas.find((i) => i.kind === 'combo')
    if (combo?.kind !== 'combo') throw new Error('expected combo')
    expect(combo.picks.map((p) => p.itemIds[0])).toContain('croissant')
  })
})

describe('buildBoostIdeas — free (₱0) items', () => {
  // The menu reader turns "Served with: Garlic Rice" into a ₱0 item. Offering
  // it earns nothing, and a combo built on it charges for what was already free.
  const SILOG_MENU: IdeaItem[] = [
    item('sisig', 'Sisigsilog', 179, 'Best Sellers'),
    item('tapa', 'Tapsilog', 159, 'Best Sellers'),
    item('free-rice', 'Garlic Rice', 0, 'Served With'),
    item('free-egg', '2 Eggs', 0, 'Served With'),
    item('coke', 'Regular Coke', 38, 'Drinks'),
    item('oj', 'Orange Juice', 65, 'Drinks'),
  ].map((it, index) => ({ ...it, order: index }))

  it('never puts a ₱0 item in any offer', () => {
    const ideas = buildBoostIdeas({ items: SILOG_MENU, limit: 20 })
    expect(ideas.length).toBeGreaterThan(0)
    const used = ideas.flatMap((idea) => [
      ...idea.itemIds,
      ...(idea.kind === 'combo' ? idea.picks.flatMap((pick) => pick.itemIds) : []),
      ...(idea.kind === 'pairing' ? idea.targetIds : []),
    ])
    expect(used).not.toContain('free-rice')
    expect(used).not.toContain('free-egg')
  })

  it('still builds a main + drink combo when the only side is free', () => {
    const combo = buildBoostIdeas({ items: SILOG_MENU, limit: 20 }).find((idea) => idea.kind === 'combo')
    if (combo?.kind !== 'combo') throw new Error('expected combo')
    expect(combo.picks.map((pick) => pick.itemIds[0])).toEqual(['sisig', 'coke'])
    expect(combo.regularPrice).toBe(179 + 38)
  })
})

describe('buildBoostIdeas — trade-up upgrades', () => {
  const TAPA_MENU: IdeaItem[] = [
    item('baboy', 'Tapang Baboy', 179, 'Best Sellers'),
    item('baka', 'Tapang Baka', 198, 'Best Sellers'),
    item('kabayo', 'Tapang Kabayo', 260, 'Best Sellers'),
    item('pinoy', 'Pinoy Tapa Bowl', 189, 'Rice Bowls'),
    item('coke', 'Coke', 38, 'Drinks'),
  ].map((it, index) => ({ ...it, order: index }))

  it('suggests the premium version of the same dish in the same category', () => {
    const upgrade = buildBoostIdeas({ items: TAPA_MENU, limit: 20 }).find(
      (idea) => idea.kind === 'upgrade' && idea.sourceId === 'baboy',
    )
    expect(upgrade).toMatchObject({ targetId: 'baka', header: 'Upgrade it?', priceDifference: 19 })
  })

  it('never trades up to a much pricier dish, another category or a same-price dish', () => {
    const upgrades = buildBoostIdeas({ items: TAPA_MENU, limit: 20 }).filter((idea) => idea.kind === 'upgrade')
    // Baka → Kabayo is +31%: too big a jump to suggest on the item page.
    expect(upgrades.some((idea) => idea.kind === 'upgrade' && idea.sourceId === 'baka')).toBe(false)
    expect(upgrades.every((idea) => idea.kind === 'upgrade' && idea.targetId !== 'pinoy')).toBe(true)
  })

  it('prefers a real bigger or meal version over a trade-up', () => {
    const upgrades = buildBoostIdeas({ items: MENU, limit: 20 }).filter((idea) => idea.kind === 'upgrade')
    expect(upgrades.find((idea) => idea.kind === 'upgrade' && idea.sourceId === 'burger')).toMatchObject({ targetId: 'burger-meal' })
  })

  it('does not trade up between drinks that only share a generic word', () => {
    const menu = [item('pj', 'Pineapple Juice', 55, 'Drinks'), item('oj', 'Orange Juice', 65, 'Drinks')]
    expect(buildBoostIdeas({ items: menu, limit: 20 }).some((idea) => idea.kind === 'upgrade')).toBe(false)
  })
})
