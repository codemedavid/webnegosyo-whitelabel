import { computeBreakeven } from '@/lib/assistant/insights/breakeven'
import { buildPromoIdeas } from '@/lib/assistant/insights/promotions'

describe('computeBreakeven', () => {
  test('20% off a ₱200 dish costing ₱70 needs 44.4% more sales', () => {
    const [line] = computeBreakeven([{ name: 'Sisig', price: 200, unitCost: 70, unitsSold: 40 }], { kind: 'percent_off', value: 20 })

    // margin 130 → 90: 130 / 90 = 1.444…
    expect(line).toMatchObject({ promoPrice: 160, marginBefore: 130, marginAfter: 90, requiredLiftPct: 44.4, unitsNeeded: 58, costBasis: 'recipe', losesMoney: false })
  })

  test('falls back to an assumed food cost and says so', () => {
    const [line] = computeBreakeven([{ name: 'Adobo', price: 100, unitCost: null }], { kind: 'amount_off', value: 10 })

    expect(line).toMatchObject({ unitCost: 35, costBasis: 'assumed', marginBefore: 65, marginAfter: 55 })
  })

  test('flags a promo that loses money on every sale', () => {
    const [line] = computeBreakeven([{ name: 'Crab', price: 300, unitCost: 250 }], { kind: 'percent_off', value: 20 })

    expect(line.losesMoney).toBe(true)
    expect(line.requiredLiftPct).toBeNull()
  })

  test('prices a combo as one line against the sum of its dishes', () => {
    const [line] = computeBreakeven(
      [{ name: 'Sisig', price: 180, unitCost: 60, unitsSold: 40 }, { name: 'Iced Tea', price: 60, unitCost: 10, unitsSold: 25 }],
      { kind: 'combo_price', value: 219 },
    )

    expect(line).toMatchObject({ name: 'Sisig + Iced Tea', regularPrice: 240, unitCost: 70, marginBefore: 170, marginAfter: 149, unitsNow: 25 })
  })
})

describe('buildPromoIdeas', () => {
  const facts = {
    bestSeller: { name: 'Sisig', price: 180, unitCost: null, unitsSold: 40 },
    slowDishes: [{ name: 'Kare-kare', price: 320, unitCost: null, unitsSold: 1 }],
    quietestHour: '3 PM',
    quietestDay: 'Tuesday',
    avgOrderValue: 410,
    slippingRegulars: 6,
  }

  test('each goal yields grounded ideas with a next step', () => {
    expect(buildPromoIdeas('fill_quiet_times', facts)[0]).toMatchObject({ title: 'Quiet-time 10% off Sisig', nextPrompt: expect.stringContaining('voucher') })
    expect(buildPromoIdeas('move_slow_dishes', facts)[0].mechanic).toBe('Combo at ₱449 (regular ₱500)')
    expect(buildPromoIdeas('win_back', facts)[0].title).toBe('Come-back 10% off (min ₱400)')
    expect(buildPromoIdeas('raise_order_value', facts)[0].title).toBe('Free delivery over ₱500')
  })

  test('no ideas without the facts to ground them', () => {
    expect(buildPromoIdeas('fill_quiet_times', { ...facts, bestSeller: null })).toEqual([])
    expect(buildPromoIdeas('win_back', { ...facts, avgOrderValue: null })).toEqual([])
  })
})
