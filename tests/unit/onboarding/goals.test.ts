import {
  GOAL_IDS,
  GOALS,
  buildLaunchPlan,
  orderGoals,
  typicalOrderPesos,
} from '@/lib/onboarding/goals'

describe('onboarding goals', () => {
  it('offers four goals, the first being a better ordering experience', () => {
    expect(GOAL_IDS).toEqual(['ordering', 'bigger_orders', 'regulars', 'faster_counter'])
    expect(GOALS.ordering.title).toBe('Better ordering experience')
  })

  it('keeps goals in the order they are listed, whatever order they were tapped in', () => {
    expect(orderGoals(['regulars', 'bigger_orders'])).toEqual(['bigger_orders', 'regulars'])
    expect(orderGoals(['regulars', 'regulars'])).toEqual(['regulars'])
  })
})

describe('buildLaunchPlan', () => {
  it('leads with the moves for each goal picked, tagged with that goal', () => {
    const plan = buildLaunchPlan(['bigger_orders', 'regulars'])

    expect(plan.goals).toEqual(['Bigger orders', 'More regulars'])
    expect(plan.rows.map((row) => row.goal)).toEqual(['bigger_orders', 'bigger_orders', 'regulars', 'regulars'])
    expect(plan.rows[0].title).toMatch(/combo/i)
    expect(plan.rows[2].title).toMatch(/stamp card/i)
  })

  it('names what else is set up without leading with it', () => {
    const plan = buildLaunchPlan(['regulars'])

    expect(plan.rows.every((row) => row.goal === 'regulars')).toBe(true)
    expect(plan.alsoReady).toMatch(/combos/i)
  })

  it('never promises a number', () => {
    const everything = buildLaunchPlan(['ordering', 'bigger_orders', 'regulars', 'faster_counter'])
    const words = [...everything.rows.flatMap((row) => [row.title, row.detail]), everything.alsoReady ?? ''].join(' ')
    expect(words).not.toMatch(/%|\bincrease\b|\bboost\b.*\d/i)
    // One move per goal when all four were picked, so every goal is on the screen.
    expect(everything.rows.map((row) => row.goal)).toEqual(['ordering', 'bigger_orders', 'regulars', 'faster_counter'])
  })

  it('falls back to the ordering moves when nothing was picked', () => {
    expect(buildLaunchPlan([]).rows[0].goal).toBe('ordering')
  })
})

describe('typicalOrderPesos', () => {
  it('turns the owner\'s bucket into a peso figure for sizing the reward', () => {
    expect(typicalOrderPesos('under_100')).toBe(80)
    expect(typicalOrderPesos('100_200')).toBe(150)
    expect(typicalOrderPesos('200_400')).toBe(300)
    expect(typicalOrderPesos('over_400')).toBe(500)
    expect(typicalOrderPesos(null)).toBeNull()
    expect(typicalOrderPesos(undefined)).toBeNull()
  })
})
