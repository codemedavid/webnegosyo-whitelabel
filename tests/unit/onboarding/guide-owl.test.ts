import { WIZARD_STEPS } from '@/lib/onboarding/wizard-steps'
import { OWL_LOOKS, OWL_STATES } from '@/components/mascot/owl-markup'
import { guideOwlLook, guideOwlState, isTapAnswer, reactionLine } from '@/components/onboarding/guide-owl'

const calm = { isSubmitting: false, isUploadingMenu: false, isReacting: false }

describe('guideOwlState', () => {
  it.each(WIZARD_STEPS)('gives the %s step a real owl state', (step) => {
    expect(OWL_STATES).toContain(guideOwlState(step, calm))
  })

  it('rests with open eyes on the welcome screen, so he can look up at the greeting', () => {
    expect(guideOwlState('welcome', calm)).toBe('idle')
  })

  it('greets with a happy beat when asked to react', () => {
    expect(guideOwlState('welcome', { ...calm, isReacting: true })).toBe('happy')
  })

  it('cheers the launch plan', () => {
    expect(guideOwlState('plan', calm)).toBe('happy')
  })

  it('waits for the menu, then thinks while it uploads', () => {
    expect(guideOwlState('menu', calm)).toBe('waiting')
    expect(guideOwlState('menu', { ...calm, isUploadingMenu: true })).toBe('thinking')
  })

  it('thinks while the answers are being sent, whatever the step', () => {
    expect(guideOwlState('account', { ...calm, isSubmitting: true })).toBe('thinking')
  })

  it('keeps thinking over a reaction: work in flight beats a cheer', () => {
    expect(guideOwlState('account', { ...calm, isSubmitting: true, isReacting: true })).toBe('thinking')
  })

  it('reacts to an answer on an ordinary question', () => {
    expect(guideOwlState('goals', { ...calm, isReacting: true })).toBe('happy')
  })

  it('rests on ordinary questions', () => {
    expect(guideOwlState('hours', calm)).toBe('idle')
  })
})

describe('guideOwlLook', () => {
  it('looks up at the greeting on the welcome screen', () => {
    expect(guideOwlLook('welcome', 'idle')).toBe('up')
  })

  it('looks down at the answers on a question', () => {
    expect(guideOwlLook('goals', 'idle')).toBe('down')
  })

  it.each(OWL_STATES.filter((state) => state !== 'idle'))('leaves the eyes to the %s state', (state) => {
    expect(guideOwlLook('goals', state)).toBeUndefined()
  })

  it.each(WIZARD_STEPS)('only ever names a real look on %s', (step) => {
    const look = guideOwlLook(step, 'idle')
    if (look !== undefined) expect(OWL_LOOKS).toContain(look)
  })
})

describe('isTapAnswer', () => {
  it.each([
    { goals: [] }, { channels: [] }, { dailyOrders: '' as const }, { typicalOrder: '' as const },
    { storeType: '' as const }, { orderTypes: [] }, { acceptsCash: true },
  ])('counts %o as a tap', (patch) => {
    expect(isTapAnswer(patch)).toBe(true)
  })

  it.each([{ storeName: 'Kape' }, { menuText: 'Adobo 120' }, { gcashNumber: '0917' }, { brandColor: '#ff0000' }, {}])(
    'does not react to typing or dragging (%o)',
    (patch) => {
      expect(isTapAnswer(patch)).toBe(false)
    },
  )
})

describe('reactionLine', () => {
  it('says something short every time', () => {
    for (let count = 0; count < 12; count += 1) {
      const line = reactionLine(count)
      expect(line.length).toBeGreaterThan(0)
      expect(line.length).toBeLessThanOrEqual(12)
    }
  })

  it('varies from one tap to the next', () => {
    expect(reactionLine(0)).not.toBe(reactionLine(1))
  })

  it('never breaks on a negative or huge count', () => {
    expect(reactionLine(-3).length).toBeGreaterThan(0)
    expect(reactionLine(Number.MAX_SAFE_INTEGER).length).toBeGreaterThan(0)
  })
})
