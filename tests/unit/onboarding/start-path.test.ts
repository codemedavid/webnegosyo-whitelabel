import { buildStartPath, canTickByHand, type PathContext, type PathSignals } from '@/lib/onboarding/start-path'

const CTX: PathContext = {
  goals: ['regulars', 'bigger_orders'],
  channels: ['facebook'],
  adminPath: '/kape/admin',
  shareUrl: 'https://kape.webnegosyo.com',
  platformOrigin: 'https://www.webnegosyo.com',
}

const FRESH: PathSignals = {
  isLive: true,
  launchCombosWaiting: 2,
  hasAppLogin: false,
  orderCount: 0,
  comboOrderCount: 0,
  stampsGiven: 0,
  activeTexts: 0,
  bestSellerPhotos: { withPhoto: 0, total: 2 },
  posOrderCount: 0,
  lessonsWatched: 0,
  ticks: new Set(),
}

const ids = (path: ReturnType<typeof buildStartPath>) => path.units.flatMap((unit) => unit.steps.map((step) => step.id))

describe('buildStartPath', () => {
  it('starts a live store at reviewing its combos, with "open" already ticked', () => {
    const path = buildStartPath(CTX, FRESH)

    expect(path.units[0].steps[0]).toMatchObject({ id: 'open', state: 'done', detail: 'https://kape.webnegosyo.com' })
    expect(path.currentStepId).toBe('combos')
    expect(path.done).toBe(1)
  })

  it('orders the goal steps by the goals the owner picked (listed order), and only theirs', () => {
    const goalUnit = buildStartPath(CTX, FRESH).units.find((unit) => unit.id === 'week2')!
    expect(goalUnit.steps.map((step) => step.id)).toEqual(['combo_sale', 'first_stamp', 'texts_on'])
    expect(ids(buildStartPath({ ...CTX, goals: ['faster_counter'] }, FRESH))).toContain('pos_sale')
    expect(ids(buildStartPath({ ...CTX, goals: ['faster_counter'] }, FRESH))).not.toContain('first_stamp')
  })

  it('ticks steps from data, never from a tap when the data says otherwise', () => {
    const path = buildStartPath(CTX, {
      ...FRESH,
      launchCombosWaiting: 0,
      hasAppLogin: true,
      orderCount: 3,
      ticks: new Set(['share', 'first_stamp']),
    })
    const state = Object.fromEntries(path.units.flatMap((unit) => unit.steps.map((step) => [step.id, step.state])))
    expect(state).toMatchObject({ combos: 'done', share: 'done', app: 'done', first_order: 'done', ten_orders: 'current', first_stamp: 'upcoming' })
  })

  it('lets a tap finish a step only when it is manual or its data could not be read', () => {
    expect(canTickByHand('share', FRESH)).toBe(true)
    expect(canTickByHand('first_order', FRESH)).toBe(false)
    expect(canTickByHand('first_order', { ...FRESH, orderCount: null })).toBe(true)
    expect(canTickByHand('open', { ...FRESH, isLive: false })).toBe(false)
    const unknown = buildStartPath(CTX, { ...FRESH, orderCount: null, ticks: new Set(['first_order']) })
    expect(unknown.units[1].steps.find((step) => step.id === 'first_order')?.state).toBe('done')
  })

  it('has no combo step for a store with nothing to review', () => {
    expect(ids(buildStartPath(CTX, { ...FRESH, launchCombosWaiting: null }))).not.toContain('combos')
  })

  it('points a store that is not open yet at opening it', () => {
    const path = buildStartPath(CTX, { ...FRESH, isLive: false })
    expect(path.currentStepId).toBe('open')
    expect(path.units[0].steps[0].action?.href).toBe('/kape/admin/start#launch')
  })

  it('links the app download on the platform host, never the store domain', () => {
    const app = buildStartPath(CTX, FRESH).units[1].steps.find((step) => step.id === 'app')
    expect(app?.action?.href).toBe('https://www.webnegosyo.com/download')
  })

  it('is complete when every step is done', () => {
    const path = buildStartPath(CTX, {
      isLive: true, launchCombosWaiting: 0, hasAppLogin: true, orderCount: 12, comboOrderCount: 1, stampsGiven: 4,
      activeTexts: 1, bestSellerPhotos: { withPhoto: 3, total: 3 }, posOrderCount: 2, lessonsWatched: 3, ticks: new Set(['share']),
    })
    expect(path.isComplete).toBe(true)
    expect(path.done).toBe(path.total)
    expect(path.currentStepId).toBeNull()
  })

  it('asks for photos on at most the top 3 best sellers, and at least one', () => {
    const photos = (withPhoto: number, total: number) => buildStartPath({ ...CTX, goals: ['ordering'] }, { ...FRESH, bestSellerPhotos: { withPhoto, total } })
      .units.find((unit) => unit.id === 'week2')!.steps[0].state
    expect(photos(3, 5)).toBe('done')
    expect(photos(1, 1)).toBe('done')
    expect(photos(0, 0)).not.toBe('done')
    expect(photos(2, 3)).not.toBe('done')
  })
})
