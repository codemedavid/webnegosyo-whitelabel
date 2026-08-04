/**
 * BCG menu-engineering classification, computed rather than guessed.
 *
 * Two things make this dangerous enough to deserve its own guardrails:
 *
 * 1. `menu_items` has NO cost column, so true contribution margin is not
 *    knowable. Without caller-supplied costs the profitability axis is a PRICE
 *    PROXY, and the result must say so — calling a price proxy "margin" would
 *    hand the merchant a confident lie about which dishes make money.
 *
 * 2. An item with no sales in the window looks identical to an item whose sales
 *    the read could not see. The first is a dog; the second is a blind spot. If
 *    the read was incomplete, nothing gets classified at all.
 */

import { classifyMenu, type ClassifiableItem } from '@/lib/menu-engineering-classify'
import type { MenuPerformance } from '@/lib/queries/menu-performance-merge'

function perf(
  items: Array<{ itemId: string; units: number; revenue: number }>,
  overrides: Partial<MenuPerformance> = {},
): MenuPerformance {
  const totalUnits = items.reduce((s, i) => s + i.units, 0)
  const totalRevenue = items.reduce((s, i) => s + i.revenue, 0)
  return {
    dataSource: 'platform',
    windowDays: 30,
    totalUnits,
    totalRevenue,
    items: items.map((i) => ({
      itemId: i.itemId,
      name: i.itemId,
      units: i.units,
      revenue: i.revenue,
      unitShare: totalUnits > 0 ? i.units / totalUnits : 0,
      revenueShare: totalRevenue > 0 ? i.revenue / totalRevenue : 0,
    })),
    coverage: { complete: true },
    ...overrides,
  }
}

const MENU: ClassifiableItem[] = [
  { id: 'a', name: 'Premium Steak', price: 500 },
  { id: 'b', name: 'House Rice', price: 100 },
  { id: 'c', name: 'Truffle Pasta', price: 450 },
  { id: 'd', name: 'Plain Toast', price: 80 },
]

describe('classifyMenu quadrants', () => {
  // Popular + high margin, popular + low margin, unpopular + high margin,
  // unpopular + low margin — one item per quadrant.
  const performance = perf([
    { itemId: 'a', units: 100, revenue: 50000 },
    { itemId: 'b', units: 100, revenue: 10000 },
    { itemId: 'c', units: 2, revenue: 900 },
    { itemId: 'd', units: 2, revenue: 160 },
  ])

  it('calls a popular, high-margin item a star', () => {
    const result = classifyMenu({ items: MENU, performance })
    expect(result.items.find((i) => i.itemId === 'a')?.classification).toBe('star')
  })

  it('calls a popular, low-margin item a plowhorse', () => {
    const result = classifyMenu({ items: MENU, performance })
    expect(result.items.find((i) => i.itemId === 'b')?.classification).toBe('plowhorse')
  })

  it('calls an unpopular, high-margin item a puzzle', () => {
    const result = classifyMenu({ items: MENU, performance })
    expect(result.items.find((i) => i.itemId === 'c')?.classification).toBe('puzzle')
  })

  it('calls an unpopular, low-margin item a dog', () => {
    const result = classifyMenu({ items: MENU, performance })
    expect(result.items.find((i) => i.itemId === 'd')?.classification).toBe('dog')
  })

  it('explains every verdict, so a merchant can disagree with the reasoning', () => {
    const result = classifyMenu({ items: MENU, performance })
    for (const item of result.items) {
      expect(item.reason.length).toBeGreaterThan(0)
    }
  })
})

describe('margin basis honesty', () => {
  const performance = perf([
    { itemId: 'a', units: 100, revenue: 50000 },
    { itemId: 'b', units: 100, revenue: 10000 },
  ])
  const twoItems = MENU.slice(0, 2)

  it('labels the profitability axis a price proxy when no costs are supplied', () => {
    const result = classifyMenu({ items: twoItems, performance })

    expect(result.marginBasis).toBe('price_proxy')
    expect(result.warnings.join(' ')).toMatch(/price|proxy/i)
  })

  it('uses real contribution margin when costs are supplied', () => {
    const result = classifyMenu({
      items: twoItems,
      performance,
      costs: { a: 450, b: 10 },
    })

    expect(result.marginBasis).toBe('cost')
    // Steak costs 450 of its 500 price (margin 50); rice costs 10 of 100
    // (margin 90). On price alone the steak looks premium; on real cost it is
    // the weaker earner — which is the entire point of supplying costs.
    const steak = result.items.find((i) => i.itemId === 'a')!
    const rice = result.items.find((i) => i.itemId === 'b')!
    expect(steak.contributionMargin).toBe(50)
    expect(rice.contributionMargin).toBe(90)
    expect(steak.isProfitable).toBe(false)
    expect(rice.isProfitable).toBe(true)
  })

  it('falls back to the price proxy when costs cover only part of the menu', () => {
    // A half-costed menu would mix two incompatible scales on one axis.
    const result = classifyMenu({ items: twoItems, performance, costs: { a: 450 } })

    expect(result.marginBasis).toBe('price_proxy')
    expect(result.warnings.join(' ')).toMatch(/some|partial|not all/i)
  })
})

describe('refusing to classify without evidence', () => {
  it('classifies nothing when the sales read was incomplete', () => {
    // THE guardrail. A Convex tenant read through the wrong database returns no
    // rows; classifying from that marks every item a dog.
    const blind = perf([], { coverage: { complete: false, note: 'No order data in this window' } })

    const result = classifyMenu({ items: MENU, performance: blind })

    expect(result.canApply).toBe(false)
    expect(result.items.every((i) => i.classification === 'unclassified')).toBe(true)
    expect(result.warnings.join(' ')).toMatch(/incomplete|no order data|cannot/i)
  })

  it('classifies nothing when the window holds too few sales to mean anything', () => {
    const thin = perf([{ itemId: 'a', units: 3, revenue: 1500 }])

    const result = classifyMenu({ items: MENU, performance: thin })

    expect(result.canApply).toBe(false)
    expect(result.warnings.join(' ')).toMatch(/too few|not enough|minimum/i)
  })

  it('classifies normally once the window carries enough sales', () => {
    const enough = perf([
      { itemId: 'a', units: 100, revenue: 50000 },
      { itemId: 'b', units: 100, revenue: 10000 },
    ])

    const result = classifyMenu({ items: MENU, performance: enough })

    expect(result.canApply).toBe(true)
  })
})

describe('items the sales read never mentioned', () => {
  const performance = perf([
    { itemId: 'a', units: 100, revenue: 50000 },
    { itemId: 'b', units: 100, revenue: 10000 },
  ])

  it('treats a listed item with zero recorded sales as genuinely unpopular', () => {
    // With a complete read, absence from the sales list IS the evidence.
    const result = classifyMenu({ items: MENU, performance })
    const toast = result.items.find((i) => i.itemId === 'd')!

    expect(toast.units).toBe(0)
    expect(toast.isPopular).toBe(false)
    expect(['dog', 'puzzle']).toContain(toast.classification)
  })

  it('covers every menu item exactly once, so nothing is quietly skipped', () => {
    const result = classifyMenu({ items: MENU, performance })

    expect(result.items.map((i) => i.itemId).sort()).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('popularity threshold', () => {
  it('uses the classic 70%-of-fair-share rule by default', () => {
    // 4 items, fair share = 25%; the 70% rule makes the bar 17.5%.
    const performance = perf([
      { itemId: 'a', units: 60, revenue: 30000 },
      { itemId: 'b', units: 20, revenue: 2000 },
      { itemId: 'c', units: 15, revenue: 6750 },
      { itemId: 'd', units: 5, revenue: 400 },
    ])

    const result = classifyMenu({ items: MENU, performance })

    expect(result.items.find((i) => i.itemId === 'b')?.isPopular).toBe(true) // 20% > 17.5%
    expect(result.items.find((i) => i.itemId === 'd')?.isPopular).toBe(false) // 5% < 17.5%
    expect(result.items.find((i) => i.itemId === 'b')?.expectedShare).toBeCloseTo(0.175)
  })

  it('handles a single-item menu without dividing by zero', () => {
    const result = classifyMenu({
      items: [MENU[0]],
      performance: perf([{ itemId: 'a', units: 50, revenue: 25000 }]),
    })

    expect(result.items).toHaveLength(1)
    expect(Number.isFinite(result.items[0].expectedShare)).toBe(true)
  })

  it('returns an empty classification for an empty menu', () => {
    const result = classifyMenu({ items: [], performance: perf([]) })

    expect(result.items).toEqual([])
    expect(result.canApply).toBe(false)
  })
})
