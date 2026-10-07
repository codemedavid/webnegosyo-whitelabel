import { buildGrowthActions, shortChange } from '@/components/admin/dashboard/dashboard-copy'

describe('shortChange', () => {
  test('small counts show the plain difference', () => {
    expect(shortChange({ current: 5, previous: 2, kind: 'count' })).toEqual({ direction: 'up', text: '+3' })
    expect(shortChange({ current: 1, previous: 4, kind: 'count' })).toEqual({ direction: 'down', text: '−3' })
  })

  test('money and large counts show a rounded percentage', () => {
    expect(shortChange({ current: 120, previous: 100, kind: 'count' })).toEqual({ direction: 'up', text: '+20%' })
    expect(shortChange({ current: 880, previous: 1000, kind: 'money' })).toEqual({ direction: 'down', text: '−12%' })
  })

  test('caps runaway percentages', () => {
    expect(shortChange({ current: 50_000, previous: 10, kind: 'money' }).text).toBe('+999%+')
  })

  test('no change and no history', () => {
    expect(shortChange({ current: 7, previous: 7, kind: 'count' })).toEqual({ direction: 'flat', text: '0' })
    expect(shortChange({ current: 500, previous: 500, kind: 'money' })).toEqual({ direction: 'flat', text: '0%' })
    expect(shortChange({ current: 500, previous: 0, kind: 'money' })).toEqual({ direction: 'none', text: 'New' })
  })
})

describe('buildGrowthActions', () => {
  const hrefs = { customers: '/s/admin/customers', loyalty: '/s/admin/loyalty' }
  const base = {
    actions: { firstTimersNotBack: 0, slippingAway: 0 },
    loyalty: null,
    capture: { rate: 100, previousRate: null, guestOrders: 0, guestSales: 0, byChannel: [] },
    hasLoyaltyProgram: true,
    isBranchView: false,
    hrefs,
  }

  test('nothing to do yields an empty list', () => {
    expect(buildGrowthActions(base)).toEqual([])
  })

  test('ranks rewards first, then people drifting away, then tips', () => {
    const actions = buildGrowthActions({
      ...base,
      actions: { firstTimersNotBack: 12, slippingAway: 5 },
      loyalty: { members: 40, rewardReady: 3, almostThere: 6, dormant: 2 },
      capture: { ...base.capture, rate: 40, guestOrders: 30, guestSales: 4500 },
    })

    expect(actions.map((action) => action.key)).toEqual(['reward-ready', 'slipping', 'first-timers', 'almost-there', 'capture'])
    expect(actions[2]).toMatchObject({ title: "12 first-timers haven't come back", href: hrefs.customers })
    expect(actions[4].title).toBe('60% of orders left no phone number')
  })

  test('uses singular copy for one person', () => {
    const [action] = buildGrowthActions({ ...base, actions: { firstTimersNotBack: 0, slippingAway: 1 } })

    expect(action.title).toBe('1 regular is overdue for a visit')
  })

  test('suggests a stamp card only to store-wide accounts without one', () => {
    const noProgram = { ...base, hasLoyaltyProgram: false }

    expect(buildGrowthActions(noProgram).map((action) => action.key)).toEqual(['stamp-card'])
    expect(buildGrowthActions({ ...noProgram, isBranchView: true })).toEqual([])
  })

  test('a mostly-identified store gets no phone-number tip', () => {
    const actions = buildGrowthActions({ ...base, capture: { ...base.capture, rate: 85, guestOrders: 3, guestSales: 300 } })

    expect(actions).toEqual([])
  })
})
