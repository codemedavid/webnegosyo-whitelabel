import { charmPrice, comboRegularPrice, describeSavings, suggestComboPrice } from '@/lib/boost/pricing'

describe('charmPrice', () => {
  it('rounds down to a price ending in 9', () => {
    expect(charmPrice(222.3)).toBe(219)
    expect(charmPrice(250)).toBe(249)
    expect(charmPrice(249)).toBe(249)
    expect(charmPrice(100)).toBe(99)
    expect(charmPrice(1234)).toBe(1229)
  })

  it('leaves small prices as whole pesos', () => {
    expect(charmPrice(15.7)).toBe(15)
    expect(charmPrice(0)).toBe(0)
  })
})

describe('comboRegularPrice', () => {
  it('adds the cheapest choice of each pick times its count', () => {
    expect(
      comboRegularPrice([
        { prices: [149], count: 1 },
        { prices: [45, 55, 60], count: 1 },
        { prices: [30], count: 2 },
      ])
    ).toBe(149 + 45 + 60)
  })

  it('ignores empty picks', () => {
    expect(comboRegularPrice([{ prices: [], count: 1 }, { prices: [99], count: 1 }])).toBe(99)
  })
})

describe('suggestComboPrice', () => {
  it('takes about 10% off and lands on a charm price', () => {
    expect(suggestComboPrice(254)).toBe(219)
  })

  it('always stays below the regular price', () => {
    expect(suggestComboPrice(50)).toBeLessThan(50)
    expect(suggestComboPrice(20)).toBeLessThan(20)
  })

  it('returns 0 for an empty combo', () => {
    expect(suggestComboPrice(0)).toBe(0)
  })
})

describe('describeSavings', () => {
  it('reports the peso and percent saving', () => {
    expect(describeSavings(250, 219)).toEqual({ amount: 31, percent: 12 })
  })

  it('reports nothing when the combo is not cheaper', () => {
    expect(describeSavings(200, 200)).toBeNull()
    expect(describeSavings(200, 240)).toBeNull()
    expect(describeSavings(0, 0)).toBeNull()
  })
})
