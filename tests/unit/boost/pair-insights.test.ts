import { buildBasketStats } from '@/lib/boost/basket-stats'
import { findPickedTogether, pairStrength } from '@/lib/boost/pair-insights'

describe('findPickedTogether', () => {
  // 10 orders. Burger + fries are ordered together far more than chance;
  // rice is in almost every order, so it co-occurs with everything by accident.
  const stats = buildBasketStats([
    ['burger', 'fries', 'rice'],
    ['burger', 'fries', 'rice'],
    ['burger', 'fries', 'rice'],
    ['burger', 'fries'],
    ['pasta', 'rice'],
    ['pasta', 'rice', 'iced-tea'],
    ['pasta', 'iced-tea', 'rice'],
    ['adobo', 'rice'],
    ['adobo', 'rice'],
    ['cake'],
  ])

  it('reports how often the pair shares an order, both ways, with lift over chance', () => {
    // Arrange / Act
    const [top] = findPickedTogether(stats, { limit: 10 })

    // Assert: burger in 4 orders, fries in 4 orders, together in 4 of 10.
    expect(top).toMatchObject({
      anchorId: 'burger',
      partnerId: 'fries',
      together: 4,
      share: 1,
      reverseShare: 1,
      support: 0.4,
      lift: 2.5,
      strength: 'always',
    })
  })

  it('orients each pair so the share reads "partner is in X% of anchor orders" at its strongest', () => {
    const pairs = findPickedTogether(stats, { limit: 10 })
    const teaPasta = pairs.find((p) => [p.anchorId, p.partnerId].sort().join('|') === 'iced-tea|pasta')

    // iced tea is in 2 orders, pasta in 3: pasta rides with iced tea 100% of the time.
    expect(teaPasta).toMatchObject({ anchorId: 'iced-tea', partnerId: 'pasta', together: 2, share: 1 })
    expect(teaPasta?.reverseShare).toBeCloseTo(2 / 3)
  })

  it('drops pairs that meet no more often than chance by default', () => {
    // rice is in 8 of 10 orders; burger+rice together 3 of 10 < 0.4 × 0.8 expected.
    const pairs = findPickedTogether(stats, { limit: 50 })
    const keys = pairs.map((p) => [p.anchorId, p.partnerId].sort().join('|'))

    expect(keys).not.toContain('burger|rice')
    expect(keys).not.toContain('fries|rice')
  })

  it('keeps below-chance pairs when asked, for a complete picture', () => {
    const pairs = findPickedTogether(stats, { limit: 50, aboveChanceOnly: false })
    const keys = pairs.map((p) => [p.anchorId, p.partnerId].sort().join('|'))

    expect(keys).toContain('burger|rice')
  })

  it('ignores coincidences below the minimum shared orders', () => {
    const pairs = findPickedTogether(stats, { limit: 50, minTogether: 3 })

    expect(pairs.every((p) => p.together >= 3)).toBe(true)
  })

  it('ranks by shared orders, then by lift, and honours the limit', () => {
    const pairs = findPickedTogether(stats, { limit: 2 })

    expect(pairs).toHaveLength(2)
    expect(pairs[0].together).toBeGreaterThanOrEqual(pairs[1].together)
  })

  it('returns nothing for a store with no orders', () => {
    expect(findPickedTogether(buildBasketStats([]), { limit: 5 })).toEqual([])
  })
})

describe('pairStrength', () => {
  it('names the pattern from the strongest direction', () => {
    expect(pairStrength(0.75)).toBe('always')
    expect(pairStrength(0.6)).toBe('always')
    expect(pairStrength(0.35)).toBe('often')
    expect(pairStrength(0.1)).toBe('sometimes')
  })
})
