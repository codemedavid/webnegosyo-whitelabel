import { buildGoalTrackers, type TrackedOrder } from '@/lib/onboarding/goal-trackers'

const order = (total: number, source = 'web', customerKey: string | null = null): TrackedOrder => ({ total, source, customerKey })

describe('buildGoalTrackers', () => {
  it('shows one tracker per goal, in the listed order', () => {
    const trackers = buildGoalTrackers({ goals: ['regulars', 'ordering'], dailyOrders: '10_30', typicalOrder: null, orders: [] })
    expect(trackers.map((t) => t.goal)).toEqual(['ordering', 'regulars'])
  })

  it('waits for enough orders before showing an average, then compares it to the owner\'s own range', () => {
    const few = buildGoalTrackers({ goals: ['bigger_orders'], dailyOrders: null, typicalOrder: '100_200', orders: [order(250), order(250)] })[0]
    expect(few).toMatchObject({ value: '₱—', caption: 'Shows after 5 orders', before: '₱100 to ₱200', comparison: null })

    const enough = buildGoalTrackers({ goals: ['bigger_orders'], dailyOrders: null, typicalOrder: '100_200', orders: [220, 240, 260, 200, 230].map((t) => order(t)) })[0]
    expect(enough).toMatchObject({ value: '₱230', caption: 'across 5 orders', comparison: 'Above your usual order' })
  })

  it('counts online orders and register sales apart', () => {
    const orders = [order(100, 'web'), order(100, 'pos'), order(100, 'web')]
    const [online, register] = buildGoalTrackers({ goals: ['ordering', 'faster_counter'], dailyOrders: '10_30', typicalOrder: null, orders })
    expect(online).toMatchObject({ value: '2', before: '10 to 30 orders a day, all channels' })
    expect(register).toMatchObject({ value: '1' })
  })

  it('counts customers who ordered twice or more, never unnamed orders', () => {
    const orders = [order(1, 'web', 'a'), order(1, 'web', 'a'), order(1, 'web', 'b'), order(1, 'web', null), order(1, 'web', null)]
    expect(buildGoalTrackers({ goals: ['regulars'], dailyOrders: null, typicalOrder: null, orders })[0]).toMatchObject({ value: '1', caption: 'of 2 named customers' })
  })

  it('says plainly when the orders could not be read', () => {
    const [tracker] = buildGoalTrackers({ goals: ['ordering'], dailyOrders: 'none', typicalOrder: null, orders: null })
    expect(tracker).toMatchObject({ value: '—', caption: 'Not available for this store yet', before: null })
  })
})
