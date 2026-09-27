import { buildBasketStats, ordersTogether, topPartners } from '@/lib/boost/basket-stats'

describe('buildBasketStats', () => {
  const stats = buildBasketStats([
    ['burger', 'fries', 'coke'],
    ['burger', 'fries'],
    ['burger', 'coke'],
    ['burger', 'burger', 'fries'], // the same item twice in one order counts once
    ['pasta', 'coke'],
    [],
  ])

  it('counts orders, not lines', () => {
    expect(stats.orderCount).toBe(5)
    expect(stats.itemOrders.get('burger')).toBe(4)
    expect(stats.itemOrders.get('fries')).toBe(3)
  })

  it('counts pairs symmetrically', () => {
    expect(ordersTogether(stats, 'burger', 'fries')).toBe(3)
    expect(ordersTogether(stats, 'fries', 'burger')).toBe(3)
    expect(ordersTogether(stats, 'pasta', 'fries')).toBe(0)
  })

  it('ranks partners by how often they share an order, with the share of the anchor', () => {
    const partners = topPartners(stats, 'burger', { limit: 5 })
    expect(partners.map((p) => p.itemId)).toEqual(['fries', 'coke'])
    expect(partners[0]).toEqual({ itemId: 'fries', together: 3, share: 0.75 })
  })

  it('honours exclude, filter and minTogether', () => {
    expect(topPartners(stats, 'burger', { limit: 5, exclude: new Set(['fries']) }).map((p) => p.itemId)).toEqual(['coke'])
    expect(topPartners(stats, 'burger', { limit: 5, minTogether: 3 }).map((p) => p.itemId)).toEqual(['fries'])
    expect(topPartners(stats, 'burger', { limit: 5, filter: (id) => id === 'coke' }).map((p) => p.itemId)).toEqual(['coke'])
  })

  it('returns nothing for an item that was never ordered', () => {
    expect(topPartners(stats, 'ghost', { limit: 3 })).toEqual([])
  })
})
